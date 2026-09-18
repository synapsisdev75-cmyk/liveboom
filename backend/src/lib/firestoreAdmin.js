const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

function loadServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }
}

function projectId() {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try {
    const cfg = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
    if (cfg.projectId) return cfg.projectId;
  } catch {
    /* ignore */
  }
  return 'liveboom-app';
}

function getAdminDb() {
  if (getApps().length === 0) {
    const sa = loadServiceAccount();
    const pid = sa?.project_id || projectId();
    if (sa) {
      initializeApp({
        credential: cert(sa),
        projectId: pid,
      });
    } else {
      initializeApp({ projectId: pid });
    }
  }
  return getFirestore();
}

function firestoreConfigured() {
  return Boolean(loadServiceAccount() || process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG);
}

function hasAdminCredentials() {
  return Boolean(loadServiceAccount());
}

async function savePaymentOrder(order) {
  const db = getAdminDb();
  const ref = String(order.reference || '').trim();
  if (!ref) throw new Error('reference obligatorio');
  await db
    .collection('paymentOrders')
    .doc(ref)
    .set(
      {
        uid: String(order.uid),
        coins: Math.max(0, Math.floor(Number(order.coins) || 0)),
        packageId: String(order.packageId || ''),
        amountInCop: Math.max(0, Math.floor(Number(order.amountInCop) || 0)),
        floor: Math.max(0, Math.floor(Number(order.floor) || 0)),
        kind: order.kind || 'coins',
        paymentLinkId: order.paymentLinkId ? String(order.paymentLinkId) : null,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

async function readPaymentOrder(reference) {
  const db = getAdminDb();
  const snap = await db.collection('paymentOrders').doc(String(reference)).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function findPaymentOrderByLinkId(paymentLinkId) {
  const linkId = String(paymentLinkId || '').trim();
  if (!linkId) return null;
  const db = getAdminDb();
  const q = await db
    .collection('paymentOrders')
    .where('paymentLinkId', '==', linkId)
    .limit(1)
    .get();
  if (q.empty) return null;
  const doc = q.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Completa orden localizada por payment_link_id (checkout hospedado Wompi).
 */
async function completePaymentOrderByLinkId(paymentLinkId, options = {}) {
  const order = await findPaymentOrderByLinkId(paymentLinkId);
  if (!order?.id) {
    return { ok: false, error: 'not_found' };
  }
  return completePaymentOrder(order.id, null, options);
}

/**
 * Acredita blast en Firestore y marca la orden como completada (idempotente).
 */
async function completePaymentOrder(reference, uid, options = {}) {
  const db = getAdminDb();
  const orderRef = db.collection('paymentOrders').doc(String(reference));
  const expectedUid = uid ? String(uid) : '';

  return db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) {
      return { ok: false, error: 'not_found' };
    }

    const order = orderSnap.data();
    if (expectedUid && String(order.uid) !== expectedUid) {
      return { ok: false, error: 'forbidden' };
    }

    const orderUid = String(order.uid);
    const userRef = db.collection('users').doc(orderUid);
    const userSnap = await tx.get(userRef);

    if (order.status === 'completed') {
      const { normalizeBlastBalances } = require('./blastBalances');
      const bal = normalizeBlastBalances(userSnap.exists ? userSnap.data() : {});
      return {
        ok: true,
        duplicate: true,
        uid: orderUid,
        coins: Number(order.coins) || 0,
        coinsBalance: bal.coinsBalance,
        purchasedBlastBalance: bal.purchasedBlastBalance,
        earnedBlastBalance: bal.earnedBlastBalance,
      };
    }

    const expectedAmount = Math.max(0, Math.floor(Number(order.amountInCop) || 0));
    const paidAmount = Math.max(0, Math.floor(Number(options.amountInCop) || 0));
    if (paidAmount > 0 && expectedAmount > 0 && paidAmount !== expectedAmount) {
      return { ok: false, error: 'amount_mismatch' };
    }

    const { normalizeBlastBalances, applyCreditPurchased, firestoreBalancePatch } = require('./blastBalances');
    const currentBal = normalizeBlastBalances(userSnap.exists ? userSnap.data() : {});
    const rawCoins = Math.max(0, Math.floor(Number(order.coins) || 0));
    const { blastForPackage } = require('./coinPackages');
    const coins = order.packageId ? blastForPackage(order.packageId, rawCoins) : rawCoins;
    if (!coins || coins > 25_000) {
      return { ok: false, error: 'coins_mismatch' };
    }
    const nextBal = applyCreditPurchased(currentBal, coins);

    if (userSnap.exists) {
      tx.update(userRef, {
        ...firestoreBalancePatch(nextBal),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.set(
        userRef,
        {
          firebaseUid: orderUid,
          ...firestoreBalancePatch(nextBal),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    tx.update(orderRef, {
      status: 'completed',
      wompiTxnId: options.wompiTxnId || null,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      duplicate: false,
      uid: orderUid,
      coins,
      coinsBalance: nextBal.coinsBalance,
      purchasedBlastBalance: nextBal.purchasedBlastBalance,
      earnedBlastBalance: nextBal.earnedBlastBalance,
    };
  });
}

async function readUserCoinsBalance(uid) {
  const db = getAdminDb();
  const snap = await db.collection('users').doc(String(uid)).get();
  return snap.exists ? Number(snap.data()?.coinsBalance ?? 0) : 0;
}

async function readUserBlastBalances(uid) {
  const { normalizeBlastBalances } = require('./blastBalances');
  const db = getAdminDb();
  const snap = await db.collection('users').doc(String(uid)).get();
  return normalizeBlastBalances(snap.exists ? snap.data() : {});
}

/**
 * Aplica retiro solo sobre blast ganados en Firestore (fuente de verdad de la billetera).
 */
async function applyEarnedWithdraw(uid, coins) {
  const { normalizeBlastBalances, applyWithdrawEarned, firestoreBalancePatch } = require('./blastBalances');
  const db = getAdminDb();
  const userRef = db.collection('users').doc(String(uid));
  const amount = Math.max(0, Math.floor(Number(coins) || 0));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const current = normalizeBlastBalances(snap.exists ? snap.data() : {});
    const result = applyWithdrawEarned(current, amount);
    if (!result.ok) {
      return {
        ok: false,
        error: 'insufficient_earned',
        available: result.available || 0,
        balances: current,
      };
    }
    if (snap.exists) {
      tx.update(userRef, {
        ...firestoreBalancePatch(result.balances),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.set(
        userRef,
        {
          firebaseUid: String(uid),
          ...firestoreBalancePatch(result.balances),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    return { ok: true, balances: result.balances, withdrawn: result.withdrawn };
  });
}

async function saveWithdrawalRecord(record) {
  const db = getAdminDb();
  const id = String(record.id || record.reference || '');
  if (!id) return null;
  const ref = db.collection('withdrawals').doc(id);
  const payload = {
    ...record,
    uid: String(record.uid || ''),
    coins: Math.max(0, Math.floor(Number(record.coins) || 0)),
    amountCop: Math.max(0, Math.floor(Number(record.amountCop) || 0)),
    status: String(record.status || 'pending'),
    fullName: String(record.fullName || ''),
    createdAt: record.createdAt || new Date().toISOString(),
    createdAtMs: Number(record.createdAtMs) || Date.now(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(payload, { merge: true });
  return payload;
}

async function updateWithdrawalRecord(id, patch) {
  const db = getAdminDb();
  const ref = db.collection('withdrawals').doc(String(id));
  await ref.set(
    {
      ...patch,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  const snap = await ref.get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function listWithdrawalRecords(options = {}) {
  const db = getAdminDb();
  const limit = Math.min(500, Math.max(1, Math.floor(Number(options.limit) || 200)));
  const uid = options.uid ? String(options.uid) : '';
  let query = db.collection('withdrawals').orderBy('createdAtMs', 'desc').limit(limit);
  if (uid) {
    query = db
      .collection('withdrawals')
      .where('uid', '==', uid)
      .orderBy('createdAtMs', 'desc')
      .limit(limit);
  }
  const snap = await query.get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

module.exports = {
  firestoreConfigured,
  hasAdminCredentials,
  savePaymentOrder,
  readPaymentOrder,
  findPaymentOrderByLinkId,
  readUserCoinsBalance,
  readUserBlastBalances,
  applyEarnedWithdraw,
  saveWithdrawalRecord,
  updateWithdrawalRecord,
  listWithdrawalRecords,
  completePaymentOrder,
  completePaymentOrderByLinkId,
  getAdminDb,
};
