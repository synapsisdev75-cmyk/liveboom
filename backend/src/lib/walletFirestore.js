const { getFirestoreDb, firestoreConfigured } = require('./firebaseAdmin');

function orderRef(db, reference) {
  return db.collection('paymentOrders').doc(String(reference));
}

function userRef(db, uid) {
  return db.collection('users').doc(String(uid));
}

async function savePaymentOrder(order) {
  const db = getFirestoreDb();
  if (!db || !order?.reference) return false;
  try {
    await orderRef(db, order.reference).set(
      {
        uid: String(order.uid || ''),
        coins: Number(order.coins) || 0,
        packageId: order.packageId || '',
        amountInCop: Number(order.amountInCop) || 0,
        currency: order.currency || 'COP',
        kind: order.kind || 'coins',
        status: order.status || 'pending',
        floor: Math.max(0, Number(order.floor) || 0),
        createdAtMs: Date.now(),
      },
      { merge: true },
    );
    return true;
  } catch (error) {
    console.warn('[walletFirestore] savePaymentOrder:', error.message);
    return false;
  }
}

async function getPaymentOrder(reference) {
  const db = getFirestoreDb();
  if (!db || !reference) return null;
  try {
    const snap = await orderRef(db, reference).get();
    if (!snap.exists) return null;
    return { reference: snap.id, ...snap.data() };
  } catch (error) {
    console.warn('[walletFirestore] getPaymentOrder:', error.message);
    return null;
  }
}

async function getFirestoreCoins(uid) {
  const db = getFirestoreDb();
  if (!db || !uid) return 0;
  try {
    const snap = await userRef(db, uid).get();
    if (!snap.exists) return 0;
    return Math.max(0, Number(snap.data()?.coinsBalance) || 0);
  } catch (error) {
    console.warn('[walletFirestore] getFirestoreCoins:', error.message);
    return 0;
  }
}

/**
 * Acredita coins una sola vez por referencia, aunque Vercel ejecute
 * complete-widget y el webhook en instancias distintas.
 */
async function creditApprovedOrder({ uid, coins, reference, wompiTxnId, floor = 0 }) {
  const db = getFirestoreDb();
  if (!db || !uid || !reference) return null;
  const amount = Math.max(0, Math.floor(Number(coins) || 0));
  const orderDoc = orderRef(db, reference);
  const userDoc = userRef(db, uid);
  try {
    return await db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderDoc);
      const userSnap = await tx.get(userDoc);
      const alreadyDone = orderSnap.exists && orderSnap.data()?.status === 'completed';
      const current = Math.max(
        userSnap.exists ? Number(userSnap.data()?.coinsBalance) || 0 : 0,
        Math.max(0, Math.floor(Number(floor) || 0)),
        Number(orderSnap.data()?.floor) || 0,
      );
      if (alreadyDone) {
        return {
          duplicate: true,
          coinsBalance: current,
        };
      }
      const next = current + amount;
      tx.set(
        userDoc,
        {
          coinsBalance: next,
          firebaseUid: uid,
          updatedAt: new Date(),
        },
        { merge: true },
      );
      tx.set(
        orderDoc,
        {
          uid,
          coins: amount,
          status: 'completed',
          wompiTxnId: wompiTxnId || null,
          completedAtMs: Date.now(),
        },
        { merge: true },
      );
      return { duplicate: false, coinsBalance: next };
    });
  } catch (error) {
    console.warn('[walletFirestore] creditApprovedOrder:', error.message);
    return null;
  }
}

module.exports = {
  firestoreConfigured,
  savePaymentOrder,
  getPaymentOrder,
  getFirestoreCoins,
  creditApprovedOrder,
};
