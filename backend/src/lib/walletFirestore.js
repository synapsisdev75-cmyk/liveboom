const { createHash, randomUUID } = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');
const {
  FILTER_GROUP,
  filterGroupForType,
  firestoreBalancePatch,
  normalizeBlastBalances,
  toSummary,
} = require('./walletEngine');

function idempotencyDocId(key) {
  return createHash('sha256').update(String(key || '')).digest('hex');
}

function ledgerDocId(idempotencyKey) {
  if (idempotencyKey) return idempotencyDocId(idempotencyKey);
  return randomUUID();
}

function balancesFromSnap(snap) {
  return normalizeBlastBalances(snap && snap.exists ? snap.data() : {});
}

function patchUserBalances(tx, userRef, userSnap, nextBalances, extra = {}) {
  const patch = {
    firebaseUid: userRef.id,
    ...firestoreBalancePatch(nextBalances),
    updatedAt: FieldValue.serverTimestamp(),
    ...extra,
  };
  if (userSnap && userSnap.exists) {
    tx.set(userRef, patch, { merge: true });
  } else {
    tx.set(userRef, patch, { merge: true });
  }
}

async function claimIdempotency(tx, db, key) {
  const id = String(key || '').trim();
  if (!id) return { duplicate: false, existing: null, ref: null };
  const ref = db.collection('wallet_idempotency').doc(idempotencyDocId(id));
  const snap = await tx.get(ref);
  if (snap.exists) {
    return { duplicate: true, existing: snap.data() || {}, ref };
  }
  return { duplicate: false, existing: null, ref };
}

function storeIdempotency(tx, ref, payload) {
  if (!ref) return;
  tx.set(
    ref,
    {
      ...payload,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

function writeLedgerEntry(tx, db, entry) {
  const userId = String(entry.userId || '');
  const transactionType = String(entry.transactionType || 'ADJUSTMENT');
  const id = ledgerDocId(entry.idempotencyKey);
  const createdAtMs = Date.now();
  const doc = {
    id,
    userId,
    transactionType,
    bucket: entry.bucket || null,
    amount: Math.max(0, Math.floor(Number(entry.amount) || 0)),
    direction: entry.direction || null,
    referenceType: entry.referenceType || null,
    referenceId: entry.referenceId || null,
    status: entry.status || 'completed',
    idempotencyKey: entry.idempotencyKey || null,
    filterGroup: filterGroupForType(transactionType),
    createdAtMs,
    createdAt: FieldValue.serverTimestamp(),
    metadata: entry.metadata || null,
  };
  tx.set(db.collection('wallet_ledger').doc(id), doc, { merge: true });
  if (userId) {
    tx.set(db.collection('users').doc(userId).collection('walletLedger').doc(id), doc, {
      merge: true,
    });
  }
  return doc;
}

function writeLedgerEntries(tx, db, entries) {
  return (entries || []).map((entry) => writeLedgerEntry(tx, db, entry));
}

function enqueueWithdrawalOutbox(tx, db, payload) {
  const { outboxEventId } = require('./withdrawalIdentity');
  const withdrawalId = String(payload.withdrawalId || '').trim();
  if (!withdrawalId || !tx || !db) return;
  const updatedAtMs = Number(payload.updatedAtMs) || Date.now();
  const status = String(payload.status || '');
  const eventId = outboxEventId(withdrawalId, updatedAtMs, status);
  tx.set(
    db.collection('wallet_withdrawal_outbox').doc(eventId),
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
    db.doc('config/withdrawalReport'),
    {
      pending: true,
      lastEventAtMs: updatedAtMs,
      lastError: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

module.exports = {
  FILTER_GROUP,
  idempotencyDocId,
  ledgerDocId,
  balancesFromSnap,
  patchUserBalances,
  claimIdempotency,
  storeIdempotency,
  writeLedgerEntry,
  writeLedgerEntries,
  enqueueWithdrawalOutbox,
  toSummary,
};
module.exports.default = module.exports;
