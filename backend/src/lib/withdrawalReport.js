/**
 * Reporte Excel de retiros: outbox + lock + Storage privado.
 * No mueve saldo. Si falla, el retiro permanece en Firestore.
 */

const { FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { firestoreConfigured, getAdminDb } = require('./firestoreAdmin');
const { fillWorkbook } = require('./withdrawalExcel');
const { formatBogota } = require('./withdrawalExcelMap');
const { adminWithdrawalRecord } = require('./payoutConversion');
const { normalizeWithdrawalStatus } = require('./walletEngine');
const { outboxEventId } = require('./withdrawalIdentity');

const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || 'liveboom-app.firebasestorage.app';
const CURRENT_PATH = 'admin/private/withdrawals/current.xlsx';
const ARCHIVE_PREFIX = 'admin/private/withdrawals/archive/';
const META_PATH = 'config/withdrawalReport';
const LOCK_PATH = 'config/withdrawalReportLock';
const OUTBOX = 'wallet_withdrawal_outbox';
const LOCK_MS = 90_000;
const PAGE = 200;

function getAdminBucket() {
  getAdminDb();
  return getStorage().bucket(STORAGE_BUCKET);
}

function asIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof value === 'object' && typeof value._seconds === 'number') {
    return new Date(value._seconds * 1000).toISOString();
  }
  return null;
}

function enqueueWithdrawalOutbox(tx, db, payload) {
  const withdrawalId = String(payload.withdrawalId || '').trim();
  if (!withdrawalId) return;
  const updatedAtMs = Number(payload.updatedAtMs) || Date.now();
  const status = String(payload.status || '');
  const eventId = outboxEventId(withdrawalId, updatedAtMs, status);
  tx.set(
    db.collection(OUTBOX).doc(eventId),
    {
      eventId,
      withdrawalId,
      status,
      updatedAtMs,
      processed: false,
      attempts: 0,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  tx.set(
    db.doc(META_PATH),
    {
      pending: true,
      lastEventAtMs: updatedAtMs,
      lastError: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function loadAllWithdrawals(db) {
  const rows = [];
  let last = null;
  for (;;) {
    let query = db.collection('wallet_withdrawals').orderBy('createdAtMs', 'asc').limit(PAGE);
    if (last) query = query.startAfter(last);
    let snap;
    try {
      snap = await query.get();
    } catch (error) {
      if (!last) {
        snap = await db.collection('wallet_withdrawals').limit(PAGE).get();
      } else {
        throw error;
      }
    }
    if (snap.empty) break;
    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      rows.push(
        adminWithdrawalRecord({
          id: doc.id,
          ...data,
          withdrawalId: data.withdrawalId || doc.id,
          requestedAt: asIso(data.requestedAt) || asIso(data.createdAt),
          processedAt: asIso(data.processedAt),
          paidAt: asIso(data.paidAt),
          status: normalizeWithdrawalStatus(data.status),
          snapshot: data.snapshot || null,
          user: data.snapshot || null,
          reviewFlags: data.reviewFlags || [],
          observations: data.observations || '',
          disbursementReference: data.disbursementReference || '',
        }),
      );
    });
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }
  return rows;
}

async function acquireLock(db) {
  const ref = db.doc(LOCK_PATH);
  const owner = `${process.pid}-${Date.now().toString(16)}`;
  const got = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const data = snap.exists ? snap.data() || {} : {};
    if (data.owner && Number(data.expiresAtMs) > now) return false;
    tx.set(
      ref,
      {
        owner,
        expiresAtMs: now + LOCK_MS,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return true;
  });
  return got ? owner : null;
}

async function releaseLock(db, owner) {
  const ref = db.doc(LOCK_PATH);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    if (String(snap.data()?.owner) !== String(owner)) return;
    tx.set(ref, { owner: null, expiresAtMs: 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

async function markOutboxProcessed(db, docs) {
  const batchSize = 400;
  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const batch = db.batch();
    chunk.forEach((doc) => {
      batch.set(doc.ref, { processed: true, processedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  }
}

async function publishWorkbook(buffer, cutMs, summary) {
  const bucket = getAdminBucket();
  const stamp = formatBogota(new Date(cutMs)).replace(/[: ]/g, '-');
  const archivePath = `${ARCHIVE_PREFIX}LiveBoom-Control-Retiros-${stamp}.xlsx`;
  const contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  await bucket.file(archivePath).save(buffer, {
    resumable: false,
    metadata: { contentType, metadata: { private: 'true', cutMs: String(cutMs) } },
  });
  await bucket.file(CURRENT_PATH).save(buffer, {
    resumable: false,
    metadata: { contentType, metadata: { private: 'true', cutMs: String(cutMs) } },
  });
  return { archivePath, currentPath: CURRENT_PATH, bytes: buffer.length, summary };
}

async function processWithdrawalReportQueue() {
  if (!firestoreConfigured()) {
    return { ok: false, reason: 'no-firestore' };
  }
  const db = getAdminDb();
  const pendingSnap = await db.collection(OUTBOX).where('processed', '==', false).limit(80).get();
  const metaSnap = await db.doc(META_PATH).get();
  const meta = metaSnap.exists ? metaSnap.data() || {} : {};
  if (pendingSnap.empty && !meta.pending && meta.generatedAtMs) {
    return { ok: true, skipped: true, reason: 'up-to-date' };
  }

  const owner = await acquireLock(db);
  if (!owner) return { ok: true, skipped: true, reason: 'locked' };

  const startedAt = Date.now();
  try {
    const rows = await loadAllWithdrawals(db);
    const generatedAtLabel = `${formatBogota(new Date(startedAt))} America/Bogota`;
    const built = await fillWorkbook(rows, { generatedAtLabel });
    const latest = await db.doc(META_PATH).get();
    const latestMs = Number(latest.data()?.generatedAtMs) || 0;
    if (latestMs > startedAt) {
      return { ok: true, skipped: true, reason: 'stale-generation' };
    }
    const published = await publishWorkbook(built.buffer, startedAt, built.summary);
    await db.doc(META_PATH).set(
      {
        pending: false,
        lastError: null,
        generatedAtMs: startedAt,
        generatedAtLabel,
        rowCount: built.rowCount,
        sheetCount: built.sheetCount,
        bytes: published.bytes,
        storagePath: CURRENT_PATH,
        archivePath: published.archivePath,
        summary: built.summary,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    if (!pendingSnap.empty) {
      await markOutboxProcessed(db, pendingSnap.docs);
    }
    return { ok: true, rowCount: built.rowCount, generatedAtMs: startedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[withdrawalReport] generate failed', message);
    await db.doc(META_PATH).set(
      {
        pending: true,
        lastError: message.slice(0, 300),
        lastErrorAtMs: Date.now(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { ok: false, error: message };
  } finally {
    await releaseLock(db, owner);
  }
}

let kickTimer = null;
function kickReportSync() {
  if (kickTimer) return;
  kickTimer = setTimeout(() => {
    kickTimer = null;
    void processWithdrawalReportQueue();
  }, 1200);
}

async function readReportMeta() {
  if (!firestoreConfigured()) {
    return { pending: true, generatedAtMs: null, lastError: 'firestore-offline' };
  }
  const snap = await getAdminDb().doc(META_PATH).get();
  if (!snap.exists) {
    return { pending: true, generatedAtMs: null, lastError: null, rowCount: 0 };
  }
  const data = snap.data() || {};
  return {
    pending: Boolean(data.pending),
    generatedAtMs: data.generatedAtMs || null,
    generatedAtLabel: data.generatedAtLabel || null,
    lastError: data.lastError || null,
    rowCount: data.rowCount || 0,
    storagePath: data.storagePath || CURRENT_PATH,
    summary: data.summary || null,
  };
}

async function downloadCurrentReport() {
  const meta = await readReportMeta();
  if (!meta.generatedAtMs) {
    const generated = await processWithdrawalReportQueue();
    if (!generated?.ok && !generated?.skipped) {
      const err = new Error(generated?.error || 'El reporte aún no está listo');
      err.code = 'REPORT_PENDING';
      throw err;
    }
  }
  const latest = await readReportMeta();
  const bucket = getAdminBucket();
  const file = bucket.file(latest.storagePath || CURRENT_PATH);
  const [exists] = await file.exists();
  if (!exists) {
    const err = new Error('No hay un Excel generado todavía');
    err.code = 'REPORT_MISSING';
    throw err;
  }
  const [buffer] = await file.download();
  const stamp = String(latest.generatedAtLabel || latest.generatedAtMs || 'corte')
    .replace(/[: ]/g, '-')
    .replace(/America\/Bogota/g, 'COT');
  return {
    buffer,
    filename: `LiveBoom-Control-Retiros-${stamp}.xlsx`,
    meta: latest,
  };
}

module.exports = {
  CURRENT_PATH,
  enqueueWithdrawalOutbox,
  processWithdrawalReportQueue,
  kickReportSync,
  readReportMeta,
  downloadCurrentReport,
};
module.exports.default = module.exports;
