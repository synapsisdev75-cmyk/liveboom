const { createHash } = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');
const { getAdminDb, firestoreConfigured } = require('./firestoreAdmin');
const {
  normalizeBlastBalances,
  applyWithdrawEarned,
  applyRefundWithdrawal,
  firestoreBalancePatch,
} = require('./blastBalances');
const { setBalances } = require('./walletMemory');

const OWNER_EMAIL = 'synapsisdev75@gmail.com';
const COLLECTION = 'withdrawalRequests';
const ALLOWED_STATUSES = new Set(['processing', 'paid', 'rejected']);

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

function errorWithStatus(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function timestampToIso(value, fallbackMs = 0) {
  if (value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  const seconds = Number(value?._seconds ?? value?.seconds);
  if (Number.isFinite(seconds) && seconds > 0) {
    return new Date(seconds * 1000).toISOString();
  }
  return fallbackMs > 0 ? new Date(fallbackMs).toISOString() : '';
}

function serializeWithdrawal(id, data) {
  const createdAtMs = Math.max(0, Math.floor(Number(data?.createdAtMs) || 0));
  const updatedAtMs = Math.max(0, Math.floor(Number(data?.updatedAtMs) || 0));
  return {
    id,
    reference: clean(data?.reference || id, 96),
    uid: clean(data?.uid, 128),
    userDisplayName: clean(data?.userDisplayName, 120),
    username: clean(data?.username, 48),
    userEmail: clean(data?.userEmail, 160),
    coins: Math.max(0, Math.floor(Number(data?.coins) || 0)),
    amountCop: Math.max(0, Math.floor(Number(data?.amountCop) || 0)),
    coinToCop: Math.max(0, Number(data?.coinToCop) || 0),
    fullName: clean(data?.fullName, 120),
    documentId: clean(data?.documentId, 32),
    payoutMethod: clean(data?.payoutMethod, 40),
    accountNumber: clean(data?.accountNumber, 40),
    accountType: clean(data?.accountType, 20),
    status: clean(data?.status || 'pending', 20),
    reviewNote: clean(data?.reviewNote, 500),
    reviewedByEmail: clean(data?.reviewedByEmail, 160),
    createdAt: timestampToIso(data?.createdAt, createdAtMs),
    createdAtMs,
    updatedAt: timestampToIso(data?.updatedAt, updatedAtMs || createdAtMs),
    updatedAtMs,
  };
}

function requestDocId(uid, clientRequestId) {
  const seed = `${String(uid)}:${clean(clientRequestId, 120)}`;
  return `wd_${createHash('sha256').update(seed).digest('hex').slice(0, 40)}`;
}

function assertFirestoreReady() {
  if (!firestoreConfigured()) {
    throw errorWithStatus(
      'Los retiros no están disponibles temporalmente. Intenta de nuevo más tarde.',
      503,
      'WITHDRAWAL_STORE_UNAVAILABLE',
    );
  }
}

async function createWithdrawalRequest({
  uid,
  tokenProfile,
  coins,
  amountCop,
  coinToCop,
  clientRequestId,
  fullName,
  documentId,
  payoutMethod,
  accountNumber,
  accountType,
}) {
  assertFirestoreReady();
  const db = getAdminDb();
  const id = requestDocId(uid, clientRequestId);
  const requestRef = db.collection(COLLECTION).doc(id);
  const userRef = db.collection('users').doc(String(uid));
  const now = Date.now();

  const result = await db.runTransaction(async (tx) => {
    const [existing, userSnap] = await Promise.all([tx.get(requestRef), tx.get(userRef)]);
    if (existing.exists) {
      const row = serializeWithdrawal(existing.id, existing.data());
      if (row.uid !== String(uid)) {
        throw errorWithStatus('Solicitud inválida', 403, 'WITHDRAWAL_FORBIDDEN');
      }
      const current = normalizeBlastBalances(userSnap.exists ? userSnap.data() : {});
      return { duplicate: true, withdrawal: row, balances: current };
    }

    if (!userSnap.exists) {
      throw errorWithStatus('No encontramos tu billetera', 404, 'WALLET_NOT_FOUND');
    }
    const user = userSnap.data() || {};
    const current = normalizeBlastBalances(user);
    const next = applyWithdrawEarned(current, coins);
    if (!next) {
      throw errorWithStatus(
        `Saldo ganado insuficiente. Disponible para retirar: ${current.earnedBlastBalance.toLocaleString('es-CO')} Blast`,
        400,
        'INSUFFICIENT_EARNED_BLAST',
      );
    }

    const record = {
      reference: id,
      uid: String(uid),
      userDisplayName: clean(
        user.displayName || tokenProfile?.name || user.username || tokenProfile?.email,
        120,
      ),
      username: clean(user.username, 48),
      userEmail: clean(user.email || tokenProfile?.email, 160).toLowerCase(),
      coins,
      amountCop,
      coinToCop,
      fullName,
      documentId,
      payoutMethod,
      accountNumber,
      accountType,
      status: 'pending',
      reviewNote: '',
      reviewedByEmail: '',
      refundApplied: false,
      createdAtMs: now,
      updatedAtMs: now,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    tx.update(userRef, {
      ...firestoreBalancePatch(next),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(requestRef, record);

    return {
      duplicate: false,
      withdrawal: serializeWithdrawal(id, { ...record, createdAt: null, updatedAt: null }),
      balances: next,
    };
  });

  setBalances(uid, result.balances);
  return result;
}

async function listUserWithdrawalRequests(uid, max = 100) {
  assertFirestoreReady();
  const snap = await getAdminDb()
    .collection(COLLECTION)
    .where('uid', '==', String(uid))
    .limit(Math.min(200, Math.max(1, max)))
    .get();
  return snap.docs
    .map((item) => serializeWithdrawal(item.id, item.data()))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

function sessionExpiryMs(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  const seconds = Number(value?._seconds ?? value?.seconds);
  return Number.isFinite(seconds) ? seconds * 1000 : 0;
}

async function requireUnlockedSuperAdmin(decoded) {
  assertFirestoreReady();
  const uid = clean(decoded?.uid, 128);
  const email = clean(decoded?.email, 160).toLowerCase();
  if (!uid || !email) {
    throw errorWithStatus('Acceso de Super Admin requerido', 403, 'ADMIN_FORBIDDEN');
  }

  const db = getAdminDb();
  const [configSnap, sessionSnap] = await Promise.all([
    db.collection('config').doc('superAdmins').get(),
    db.collection('adminSessions').doc(uid).get(),
  ]);
  const configured = Array.isArray(configSnap.data()?.emails)
    ? configSnap
        .data()
        .emails.map((item) => clean(item, 160).toLowerCase())
        .filter(Boolean)
    : [];
  const allowed = email === OWNER_EMAIL || configured.includes(email);
  const session = sessionSnap.data() || {};
  const unlocked =
    sessionSnap.exists &&
    clean(session.email, 160).toLowerCase() === email &&
    sessionExpiryMs(session.expiresAt) > Date.now();

  if (!allowed || !unlocked) {
    throw errorWithStatus(
      'Abre y desbloquea la bóveda de Super Admin para revisar retiros.',
      403,
      'ADMIN_VAULT_REQUIRED',
    );
  }
  return { uid, email };
}

async function listAdminWithdrawalRequests(decoded, max = 250) {
  await requireUnlockedSuperAdmin(decoded);
  const snap = await getAdminDb()
    .collection(COLLECTION)
    .orderBy('createdAtMs', 'desc')
    .limit(Math.min(500, Math.max(1, max)))
    .get();
  return snap.docs.map((item) => serializeWithdrawal(item.id, item.data()));
}

async function updateWithdrawalRequest(decoded, id, status, reviewNote = '') {
  const admin = await requireUnlockedSuperAdmin(decoded);
  const nextStatus = clean(status, 20).toLowerCase();
  if (!ALLOWED_STATUSES.has(nextStatus)) {
    throw errorWithStatus('Estado de retiro inválido', 400, 'WITHDRAWAL_STATUS_INVALID');
  }

  const db = getAdminDb();
  const requestRef = db.collection(COLLECTION).doc(clean(id, 96));
  const now = Date.now();
  const result = await db.runTransaction(async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) {
      throw errorWithStatus('Solicitud de retiro no encontrada', 404, 'WITHDRAWAL_NOT_FOUND');
    }
    const current = requestSnap.data() || {};
    const currentStatus = clean(current.status || 'pending', 20);
    if (currentStatus === 'paid' || currentStatus === 'rejected') {
      if (currentStatus === nextStatus) {
        return { withdrawal: serializeWithdrawal(requestSnap.id, current), balances: null };
      }
      throw errorWithStatus(
        'Una solicitud pagada o rechazada ya no se puede cambiar.',
        409,
        'WITHDRAWAL_ALREADY_RESOLVED',
      );
    }

    let refundedBalances = null;
    if (nextStatus === 'rejected' && current.refundApplied !== true) {
      const uid = clean(current.uid, 128);
      const userRef = db.collection('users').doc(uid);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        throw errorWithStatus('No encontramos la billetera del usuario', 404, 'WALLET_NOT_FOUND');
      }
      refundedBalances = applyRefundWithdrawal(
        normalizeBlastBalances(userSnap.data()),
        current.coins,
      );
      tx.update(userRef, {
        ...firestoreBalancePatch(refundedBalances),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const patch = {
      status: nextStatus,
      reviewNote: clean(reviewNote, 500),
      reviewedByEmail: admin.email,
      reviewedByUid: admin.uid,
      refundApplied: nextStatus === 'rejected' ? true : Boolean(current.refundApplied),
      updatedAtMs: now,
      updatedAt: FieldValue.serverTimestamp(),
      ...(nextStatus === 'paid'
        ? { paidAtMs: now, paidAt: FieldValue.serverTimestamp() }
        : {}),
      ...(nextStatus === 'rejected'
        ? { rejectedAtMs: now, rejectedAt: FieldValue.serverTimestamp() }
        : {}),
    };
    tx.update(requestRef, patch);
    return {
      withdrawal: serializeWithdrawal(requestSnap.id, {
        ...current,
        ...patch,
        updatedAt: null,
      }),
      balances: refundedBalances,
      uid: current.uid,
    };
  });

  if (result.balances && result.uid) setBalances(result.uid, result.balances);
  return result.withdrawal;
}

module.exports = {
  createWithdrawalRequest,
  listUserWithdrawalRequests,
  listAdminWithdrawalRequests,
  updateWithdrawalRequest,
  requireUnlockedSuperAdmin,
};
