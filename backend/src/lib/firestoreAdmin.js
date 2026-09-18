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

function usernameKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
}

async function resolveUidByUsername(username) {
  const key = usernameKey(username);
  if (!key) return null;
  const db = getAdminDb();
  const handleSnap = await db.collection('usernames').doc(key).get();
  if (handleSnap.exists) {
    const uid = String(handleSnap.data()?.uid || '').trim();
    if (uid) return uid;
  }
  const q = await db.collection('users').where('username', '==', key).limit(1).get();
  if (!q.empty) return q.docs[0].id;
  return null;
}

function publicUserFields(data, uid) {
  const raw = data && typeof data === 'object' ? data : {};
  return {
    uid: String(uid || ''),
    username: String(raw.username || ''),
    displayName: String(raw.displayName || raw.username || ''),
    email: String(raw.email || ''),
  };
}

/**
 * Debita al remitente (comprados primero) y acredita Blast ganados al receptor.
 * Idempotente por clientId en giftInbox.
 */
async function transferGiftBlast(input) {
  const senderUid = String(input.senderUid || '').trim();
  const recipientUid = String(input.recipientUid || '').trim();
  const coins = Math.max(0, Math.floor(Number(input.coins) || 0));
  const clientId = String(input.clientId || '').trim().slice(0, 80);
  if (!senderUid || !recipientUid || senderUid === recipientUid || coins <= 0) {
    return { ok: false, error: 'invalid' };
  }

  const {
    normalizeBlastBalances,
    applySpend,
    applyCreditEarned,
    firestoreBalancePatch,
  } = require('./blastBalances');
  const db = getAdminDb();
  const senderRef = db.collection('users').doc(senderUid);
  const recipientRef = db.collection('users').doc(recipientUid);
  const inboxRef = clientId
    ? recipientRef.collection('giftInbox').doc(clientId)
    : recipientRef.collection('giftInbox').doc();

  return db.runTransaction(async (tx) => {
    const senderSnap = await tx.get(senderRef);
    const recipientSnap = await tx.get(recipientRef);
    const inboxSnap = await tx.get(inboxRef);

    if (inboxSnap.exists && inboxSnap.data()?.processed) {
      const senderBal = normalizeBlastBalances(senderSnap.exists ? senderSnap.data() : {});
      const recipientBal = normalizeBlastBalances(recipientSnap.exists ? recipientSnap.data() : {});
      return {
        ok: true,
        duplicate: true,
        sender: senderBal,
        recipient: recipientBal,
      };
    }

    const senderBal = normalizeBlastBalances(senderSnap.exists ? senderSnap.data() : {});
    const spent = applySpend(senderBal, coins, true);
    if (!spent.ok) {
      return { ok: false, error: spent.code || 'INSUFFICIENT', sender: senderBal };
    }

    const recipientNext = applyCreditEarned(
      normalizeBlastBalances(recipientSnap.exists ? recipientSnap.data() : {}),
      coins,
    );

    tx.set(
      senderRef,
      {
        firebaseUid: senderUid,
        ...firestoreBalancePatch(spent.balances),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    tx.set(
      recipientRef,
      {
        firebaseUid: recipientUid,
        ...firestoreBalancePatch(recipientNext),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    tx.set(
      inboxRef,
      {
        senderUid,
        senderName: input.senderName || null,
        recipientUid,
        giftId: input.giftId || null,
        giftName: input.giftName || null,
        emoji: input.emoji || null,
        coins,
        multiplier: Math.max(1, Math.floor(Number(input.multiplier) || 1)),
        postId: input.postId || null,
        roomName: input.roomName || null,
        clientId: clientId || inboxRef.id,
        source: input.source || 'gift',
        contentType: input.contentType || null,
        processed: true,
        processedAtMs: Date.now(),
        createdAt: FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
      },
      { merge: true },
    );

    return {
      ok: true,
      duplicate: false,
      sender: spent.balances,
      recipient: recipientNext,
    };
  });
}

function serializeWithdrawalDoc(id, data) {
  const raw = data && typeof data === 'object' ? data : {};
  const createdAt =
    raw.createdAt && typeof raw.createdAt.toDate === 'function'
      ? raw.createdAt.toDate().toISOString()
      : raw.createdAtMs
        ? new Date(Number(raw.createdAtMs)).toISOString()
        : raw.createdAt || null;
  const updatedAt =
    raw.updatedAt && typeof raw.updatedAt.toDate === 'function'
      ? raw.updatedAt.toDate().toISOString()
      : raw.updatedAt || null;
  return {
    id: String(id),
    uid: String(raw.uid || ''),
    displayName: String(raw.displayName || ''),
    username: String(raw.username || ''),
    email: String(raw.email || ''),
    coins: Math.max(0, Math.floor(Number(raw.coins) || 0)),
    amountCop: Math.max(0, Math.floor(Number(raw.amountCop) || 0)),
    payoutMethod: String(raw.payoutMethod || ''),
    accountNumber: String(raw.accountNumber || ''),
    accountType: String(raw.accountType || ''),
    documentId: String(raw.documentId || ''),
    fullName: String(raw.fullName || raw.displayName || ''),
    status: String(raw.status || 'pending'),
    source: String(raw.source || 'earned'),
    reviewNote: String(raw.reviewNote || ''),
    reviewedByEmail: raw.reviewedByEmail ? String(raw.reviewedByEmail) : null,
    createdAt,
    createdAtMs: Number(raw.createdAtMs) || (createdAt ? Date.parse(createdAt) : 0),
    updatedAt,
  };
}

async function createWithdrawalRequest(uid, payload) {
  const {
    normalizeBlastBalances,
    applyWithdrawEarned,
    firestoreBalancePatch,
  } = require('./blastBalances');
  const coins = Math.max(0, Math.floor(Number(payload.coins) || 0));
  const id = String(payload.id || '').trim();
  if (!uid || !id || coins <= 0) {
    return { ok: false, error: 'invalid' };
  }

  const db = getAdminDb();
  const userRef = db.collection('users').doc(String(uid));
  const reqRef = db.collection('withdrawalRequests').doc(id);

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(reqRef);
    if (existing.exists) {
      const userSnap = await tx.get(userRef);
      return {
        ok: true,
        duplicate: true,
        withdrawal: serializeWithdrawalDoc(existing.id, existing.data()),
        balances: normalizeBlastBalances(userSnap.exists ? userSnap.data() : {}),
      };
    }

    const userSnap = await tx.get(userRef);
    const current = normalizeBlastBalances(userSnap.exists ? userSnap.data() : {});
    const withdrawn = applyWithdrawEarned(current, coins);
    if (!withdrawn.ok) {
      return {
        ok: false,
        error: 'INSUFFICIENT_EARNED',
        available: withdrawn.available,
        balances: current,
      };
    }

    const profile = publicUserFields(userSnap.exists ? userSnap.data() : {}, uid);
    const nowMs = Date.now();
    const record = {
      uid: String(uid),
      displayName: String(payload.fullName || profile.displayName || profile.username || ''),
      fullName: String(payload.fullName || profile.displayName || ''),
      username: profile.username,
      email: profile.email,
      coins,
      amountCop: Math.max(0, Math.floor(Number(payload.amountCop) || 0)),
      coinToCop: Number(payload.coinToCop) || 0,
      payoutMethod: String(payload.payoutMethod || ''),
      accountNumber: String(payload.accountNumber || ''),
      accountType: String(payload.accountType || 'ahorros'),
      documentId: String(payload.documentId || ''),
      status: 'pending',
      source: 'earned',
      sourceNote: 'Solo Blast ganados por regalos, llamadas y videollamadas',
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    };

    tx.set(
      userRef,
      {
        firebaseUid: String(uid),
        ...firestoreBalancePatch(withdrawn.balances),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    tx.set(reqRef, record);

    return {
      ok: true,
      duplicate: false,
      withdrawal: serializeWithdrawalDoc(id, { ...record, createdAt: new Date(nowMs).toISOString() }),
      balances: withdrawn.balances,
    };
  });
}

async function listWithdrawalRequests({ uid, limit = 80 } = {}) {
  const db = getAdminDb();
  const cap = Math.min(200, Math.max(1, Math.floor(Number(limit) || 80)));
  let snap;
  if (uid) {
    snap = await db
      .collection('withdrawalRequests')
      .where('uid', '==', String(uid))
      .orderBy('createdAtMs', 'desc')
      .limit(cap)
      .get();
  } else {
    snap = await db
      .collection('withdrawalRequests')
      .orderBy('createdAtMs', 'desc')
      .limit(cap)
      .get();
  }
  return snap.docs.map((docSnap) => serializeWithdrawalDoc(docSnap.id, docSnap.data()));
}

async function updateWithdrawalRequest(id, { status, reviewNote, reviewedByEmail }) {
  const {
    normalizeBlastBalances,
    applyRestoreEarned,
    firestoreBalancePatch,
  } = require('./blastBalances');
  const nextStatus = String(status || '').trim();
  if (!['pending', 'paid', 'rejected'].includes(nextStatus)) {
    return { ok: false, error: 'invalid_status' };
  }
  const db = getAdminDb();
  const reqRef = db.collection('withdrawalRequests').doc(String(id));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(reqRef);
    if (!snap.exists) return { ok: false, error: 'not_found' };
    const current = snap.data() || {};
    const prevStatus = String(current.status || 'pending');
    if (prevStatus === nextStatus) {
      return { ok: true, duplicate: true, withdrawal: serializeWithdrawalDoc(snap.id, current) };
    }

    let balances = null;
    if (prevStatus === 'pending' && nextStatus === 'rejected') {
      const uid = String(current.uid || '');
      const coins = Math.max(0, Math.floor(Number(current.coins) || 0));
      if (uid && coins > 0) {
        const userRef = db.collection('users').doc(uid);
        const userSnap = await tx.get(userRef);
        balances = applyRestoreEarned(
          normalizeBlastBalances(userSnap.exists ? userSnap.data() : {}),
          coins,
        );
        tx.set(
          userRef,
          {
            firebaseUid: uid,
            ...firestoreBalancePatch(balances),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
    }

    const patch = {
      status: nextStatus,
      reviewNote: String(reviewNote || current.reviewNote || ''),
      reviewedByEmail: reviewedByEmail ? String(reviewedByEmail) : current.reviewedByEmail || null,
      updatedAt: FieldValue.serverTimestamp(),
      resolvedAtMs: Date.now(),
    };
    tx.set(reqRef, patch, { merge: true });
    return {
      ok: true,
      duplicate: false,
      withdrawal: serializeWithdrawalDoc(snap.id, { ...current, ...patch, updatedAt: new Date().toISOString() }),
      balances,
    };
  });
}

async function readSuperAdminEmails() {
  try {
    const snap = await getAdminDb().collection('config').doc('superAdmins').get();
    const emails = Array.isArray(snap.data()?.emails) ? snap.data().emails : [];
    return emails.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

module.exports = {
  firestoreConfigured,
  hasAdminCredentials,
  savePaymentOrder,
  readPaymentOrder,
  findPaymentOrderByLinkId,
  readUserCoinsBalance,
  readUserBlastBalances,
  completePaymentOrder,
  completePaymentOrderByLinkId,
  getAdminDb,
  resolveUidByUsername,
  transferGiftBlast,
  createWithdrawalRequest,
  listWithdrawalRequests,
  updateWithdrawalRequest,
  readSuperAdminEmails,
};
