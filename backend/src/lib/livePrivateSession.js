/** LIVE privado: sesión, hold/capture/refund y grants. Fuente de verdad en Firestore. */

const { randomUUID } = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');
const { getAdminDb, firestoreConfigured } = require('./firestoreAdmin');
const { findGift } = require('./gifts');
const liveLocks = require('./liveLocks');
const {
  getBalances,
  setBalances,
  credit,
} = require('./walletMemory');
const {
  normalizeBlastBalances,
  applySpend,
  applyCreditPurchased,
  applyCreditEarned,
  firestoreBalancePatch,
} = require('./blastBalances');

function roomKey(room) {
  return String(room || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
}

function logPrivate(event, extra) {
  const payload = extra && typeof extra === 'object' ? extra : {};
  console.log('[PRIVATE]', event, payload);
}

function newSessionId() {
  return `priv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function roomRef(db, roomName) {
  return db.collection('liveRooms').doc(roomKey(roomName));
}

function lockFromGift(gift, sessionId) {
  return liveLocks.buildLockEntry([
    {
      giftId: gift.id,
      giftName: gift.name,
      coins: gift.coins,
      emoji: gift.emoji || '🔒',
      quantity: 1,
    },
  ]);
}

function asLock(gift, sessionId, sealed = false) {
  const entry = lockFromGift(gift, sessionId);
  if (!entry) return null;
  entry.privateSessionId = sessionId;
  entry.sealed = Boolean(sealed);
  return entry;
}

function sessionIsOpen(room) {
  const status = String(room?.privateSessionStatus || '');
  const phase = String(room?.privatePhase || '');
  return (
    status === 'armed' ||
    status === 'active' ||
    phase === 'collecting' ||
    phase === 'private'
  );
}

function sessionIsSealed(room) {
  return (
    room?.privateSessionStatus === 'active' ||
    room?.privatePhase === 'private' ||
    room?.isPrivate === true
  );
}

async function hydrateLock(roomName) {
  const existing = liveLocks.getLock(roomName);
  if (!firestoreConfigured()) return existing || null;
  try {
    const db = getAdminDb();
    const snap = await roomRef(db, roomName).get();
    if (!snap.exists) return existing || null;
    const data = snap.data() || {};
    if (String(data.status || '') === 'ended' || Number(data.endedAtMs || 0) > 0) {
      liveLocks.clearLock(roomName);
      return null;
    }
    if (existing && existing.sealed) return existing;
    const giftId = String(data.requiredGiftId || data.lockGiftId || '');
    const sessionId = String(data.privateSessionId || '');
    if (!sessionIsOpen(data) || !giftId || !sessionId) return existing || null;
    const gift = findGift(giftId);
    if (!gift) return existing || null;
    const restored = liveLocks.restoreLock(roomName, {
      giftId: gift.id,
      giftName: gift.name,
      coins: gift.coins,
      emoji: gift.emoji,
      quantity: 1,
      privateSessionId: sessionId,
      sealed: sessionIsSealed(data),
    });
    if (existing && restored) {
      restored.sealed = restored.sealed || existing.sealed;
      if (existing.sealed) restored.sealed = true;
    }
    return restored;
  } catch (error) {
    console.warn('[PRIVATE] hydrate failed', error.message);
    return liveLocks.getLock(roomName);
  }
}

function mergeBalances(firestoreBal, memoryBal, floorFromClient) {
  const fs = normalizeBlastBalances(firestoreBal || {});
  const mem = normalizeBlastBalances(memoryBal || {});
  const floor = Math.max(0, Math.floor(Number(floorFromClient) || 0));
  const coins = Math.max(fs.coinsBalance, mem.coinsBalance, floor);
  if (coins <= fs.coinsBalance) return fs;
  const extra = coins - fs.coinsBalance;
  return normalizeBlastBalances({
    ...fs,
    purchasedBlastBalance: fs.purchasedBlastBalance + extra,
  });
}

async function startSession(roomName, { hostUid, giftId }) {
  const gift = findGift(giftId);
  if (!gift) {
    return { ok: false, status: 400, error: 'Regalo de candado inválido' };
  }
  await stopSession(roomName, { reason: 'restart' });
  const sessionId = newSessionId();
  const lock = asLock(gift, sessionId, false);
  liveLocks.setLock(roomName, {
    requirements: [
      {
        giftId: gift.id,
        giftName: gift.name,
        coins: gift.coins,
        emoji: gift.emoji,
        quantity: 1,
      },
    ],
    privateSessionId: sessionId,
    sealed: false,
  });

  if (firestoreConfigured()) {
    const db = getAdminDb();
    await roomRef(db, roomName).set(
      {
        privatePhase: 'collecting',
        privateSessionId: sessionId,
        privateSessionStatus: 'armed',
        requiredGiftId: gift.id,
        hostUid: String(hostUid || ''),
        isPrivate: false,
        lockGiftId: gift.id,
        privateRequirements: [
          { giftId: gift.id, requiredQuantity: 1, receivedQuantity: 0 },
        ],
        privatePendingRequirements: [{ giftId: gift.id, quantity: 1 }],
        privateStartsAtMs: null,
        countdownDurationMs: null,
        requirementsCompletedAtMs: null,
        privateActivatedAtMs: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  logPrivate('session-arm', { room: roomKey(roomName), sessionId, giftId: gift.id });
  return { ok: true, lock, privateSessionId: sessionId, isPrivate: false };
}

async function grantPendingOnSeal(roomName, sessionId, hostUid) {
  if (!firestoreConfigured() || !sessionId) return;
  const db = getAdminDb();
  const snap = await roomRef(db, roomName)
    .collection('privateRequests')
    .where('status', '==', 'pending')
    .get();
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (String(data.sessionId || '') !== sessionId) continue;
    await approveRequest(roomName, {
      actorUid: hostUid || null,
      viewerUid: String(data.uid || doc.id),
    }).catch(() => undefined);
  }
}

async function sealSession(roomName, { hostUid } = {}) {
  await hydrateLock(roomName);
  let lock = liveLocks.getLock(roomName);
  if (!lock) {
    return { ok: false, status: 409, error: 'Activa el candado y elige el regalo primero' };
  }
  if (lock.sealed) {
    return {
      ok: true,
      lock,
      isPrivate: true,
      privateSessionId: lock.privateSessionId || null,
      already: true,
    };
  }
  liveLocks.markSealed(roomName, true);
  lock = liveLocks.getLock(roomName);
  const sessionId = String(lock?.privateSessionId || '');
  if (firestoreConfigured()) {
    const db = getAdminDb();
    await roomRef(db, roomName).set(
      {
        privatePhase: 'private',
        privateSessionStatus: 'active',
        isPrivate: true,
        privateActivatedAtMs: Date.now(),
        privateStartsAtMs: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  await grantPendingOnSeal(roomName, sessionId, hostUid);
  logPrivate('session-seal', { room: roomKey(roomName), sessionId });
  return { ok: true, lock, privateSessionId: sessionId, isPrivate: true };
}

async function readViewerAccess(roomName, uid) {
  const sessionId = liveLocks.getLock(roomName)?.privateSessionId || '';
  if (!firestoreConfigured() || !uid) {
    return {
      requestStatus: liveLocks.isUnlocked(roomName, uid) ? 'approved' : 'outside',
      privateSessionId: sessionId || null,
    };
  }
  try {
    const db = getAdminDb();
    const roomSnap = await roomRef(db, roomName).get();
    const room = roomSnap.data() || {};
    const activeId = String(room.privateSessionId || sessionId || '');
    const grantSnap = await roomRef(db, roomName).collection('privateGrants').doc(String(uid)).get();
    const grant = grantSnap.exists ? grantSnap.data() || {} : {};
    if (activeId && String(grant.sessionId || '') === activeId && grant.accessGranted) {
      liveLocks.markUnlocked(roomName, uid);
      return { requestStatus: 'approved', privateSessionId: activeId };
    }
    const reqSnap = await roomRef(db, roomName).collection('privateRequests').doc(String(uid)).get();
    const req = reqSnap.exists ? reqSnap.data() || {} : {};
    if (activeId && String(req.sessionId || req.privateSessionId || '') === activeId) {
      if (req.status === 'pending') {
        return { requestStatus: 'pending', privateSessionId: activeId };
      }
      if (req.status === 'rejected') {
        return { requestStatus: 'rejected', privateSessionId: activeId };
      }
      if (req.status === 'approved') {
        liveLocks.markUnlocked(roomName, uid);
        return { requestStatus: 'approved', privateSessionId: activeId };
      }
    }
    return { requestStatus: 'outside', privateSessionId: activeId || null };
  } catch {
    return {
      requestStatus: liveLocks.isUnlocked(roomName, uid) ? 'approved' : 'outside',
      privateSessionId: sessionId || null,
    };
  }
}

async function requestAccess(roomName, payload) {
  const viewerUid = String(payload.viewerUid || '');
  const giftId = String(payload.giftId || '').trim();
  const clientId = String(payload.clientId || '').trim() || randomUUID();
  if (!viewerUid || !giftId) {
    return { ok: false, status: 400, error: 'roomName y giftId son obligatorios' };
  }
  if (!firestoreConfigured()) {
    return { ok: false, status: 503, error: 'Privado no disponible' };
  }

  await hydrateLock(roomName);
  const db = getAdminDb();
  const coinsGift = findGift(giftId);

  try {
    const result = await db.runTransaction(async (tx) => {
      const rRef = roomRef(db, roomName);
      const reqRef = rRef.collection('privateRequests').doc(viewerUid);
      const grantRef = rRef.collection('privateGrants').doc(viewerUid);
      const holdRef = rRef.collection('privateHolds').doc(clientId);
      const userRef = db.collection('users').doc(viewerUid);

      const [roomSnap, reqSnap, grantSnap, holdSnap, userSnap] = await Promise.all([
        tx.get(rRef),
        tx.get(reqRef),
        tx.get(grantRef),
        tx.get(holdRef),
        tx.get(userRef),
      ]);

      const room = roomSnap.data() || {};
      const sessionId = String(room.privateSessionId || '');
      if (!sessionIsOpen(room) || !sessionId) {
        const err = new Error('NO_SESSION');
        err.code = 'NO_SESSION';
        throw err;
      }
      const required = String(room.requiredGiftId || room.lockGiftId || '');
      if (required && required !== giftId) {
        const err = new Error('WRONG_GIFT');
        err.code = 'WRONG_GIFT';
        throw err;
      }
      const gift = coinsGift || findGift(required);
      if (!gift) {
        const err = new Error('BAD_GIFT');
        err.code = 'BAD_GIFT';
        throw err;
      }
      const coins = Math.max(1, Math.floor(Number(gift.coins) || 0));

      const grant = grantSnap.exists ? grantSnap.data() || {} : {};
      if (String(grant.sessionId || '') === sessionId && grant.accessGranted) {
        return { ok: true, unlocked: true, alreadyApproved: true, requestStatus: 'approved' };
      }

      const req = reqSnap.exists ? reqSnap.data() || {} : {};
      if (String(req.sessionId || '') === sessionId && req.status === 'pending') {
        return { ok: true, pending: true, duplicate: true, requestStatus: 'pending' };
      }

      const hold = holdSnap.exists ? holdSnap.data() || {} : {};
      if (hold.status === 'held' && String(hold.privateSessionId || '') === sessionId) {
        return { ok: true, pending: true, duplicate: true, requestStatus: 'pending' };
      }

      const current = mergeBalances(
        userSnap.exists ? userSnap.data() : {},
        getBalances(viewerUid),
        payload.currentBalance,
      );
      const spent = applySpend(current, coins, true);
      if (!spent.ok || spent.chargedPurchased + spent.chargedEarned < coins) {
        const err = new Error('INSUFFICIENT');
        err.code = 'INSUFFICIENT';
        err.requiredCoins = coins;
        err.balance = current.coinsBalance;
        throw err;
      }

      const now = Date.now();
      tx.set(
        userRef,
        {
          firebaseUid: viewerUid,
          ...firestoreBalancePatch(spent.balances),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.set(holdRef, {
        id: clientId,
        privateSessionId: sessionId,
        liveSessionId: sessionId,
        roomName: roomKey(roomName),
        viewerUid,
        viewerName: String(payload.viewerName || 'Liveboomer'),
        hostUid: String(room.hostUid || ''),
        giftId: gift.id,
        coins,
        chargedPurchased: spent.chargedPurchased,
        chargedEarned: spent.chargedEarned,
        status: 'held',
        createdAtMs: now,
        updatedAt: FieldValue.serverTimestamp(),
      });
      const { writeLedgerEntries } = require('./walletFirestore');
      const { spendLedgerEntries } = require('./walletEngine');
      writeLedgerEntries(
        tx,
        db,
        spendLedgerEntries({
          userId: viewerUid,
          amountPurchased: spent.chargedPurchased,
          amountEarned: spent.chargedEarned,
          idempotencyKey: `PRIVATE_HOLD:${clientId}`,
          referenceType: 'live_private',
          referenceId: sessionId,
        }),
      );
      tx.set(
        reqRef,
        {
          uid: viewerUid,
          requestId: clientId,
          giftTransactionId: clientId,
          giftId: gift.id,
          username: String(payload.viewerUsername || ''),
          displayName: String(payload.viewerName || 'Liveboomer'),
          avatarUrl: payload.viewerAvatarUrl || null,
          status: 'pending',
          sessionId,
          privateSessionId: sessionId,
          createdAtMs: now,
          updatedAtMs: now,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      return {
        ok: true,
        pending: true,
        requestStatus: 'pending',
        senderBalance: spent.balances.coinsBalance,
        balances: spent.balances,
        giftId: gift.id,
      };
    });

    if (result.balances) {
      setBalances(viewerUid, result.balances);
    }
    if (result.alreadyApproved) {
      liveLocks.markUnlocked(roomName, viewerUid);
    }
    if (result.pending && !result.duplicate) {
      logPrivate('request', { room: roomKey(roomName), viewerUid });
      logPrivate('hold', { room: roomKey(roomName), viewerUid });
    }
    return result;
  } catch (error) {
    if (error.code === 'INSUFFICIENT') {
      return {
        ok: false,
        status: 402,
        error: 'Saldo insuficiente',
        requiredCoins: error.requiredCoins,
        balance: error.balance,
      };
    }
    if (error.code === 'WRONG_GIFT') {
      return { ok: false, status: 400, error: 'Ese regalo no abre el privado' };
    }
    if (error.code === 'NO_SESSION') {
      return { ok: false, status: 409, error: 'El privado ya no está activo' };
    }
    console.error('[PRIVATE] request failed', error);
    return { ok: false, status: 500, error: 'No se pudo solicitar el acceso' };
  }
}

async function approveRequest(roomName, { actorUid, viewerUid }) {
  const uid = String(viewerUid || '');
  if (!uid) return { ok: false, status: 400, error: 'viewerUid es obligatorio' };
  if (!firestoreConfigured()) return { ok: false, status: 503, error: 'Privado no disponible' };
  const db = getAdminDb();

  try {
    const result = await db.runTransaction(async (tx) => {
      const rRef = roomRef(db, roomName);
      const reqRef = rRef.collection('privateRequests').doc(uid);
      const grantRef = rRef.collection('privateGrants').doc(uid);
      const roomSnap = await tx.get(rRef);
      const reqSnap = await tx.get(reqRef);
      const grantSnap = await tx.get(grantRef);
      const room = roomSnap.data() || {};
      if (String(room.hostUid || '') && actorUid && String(room.hostUid) !== String(actorUid)) {
        const err = new Error('FORBIDDEN');
        err.code = 'FORBIDDEN';
        throw err;
      }
      const sessionId = String(room.privateSessionId || '');
      const req = reqSnap.exists ? reqSnap.data() || {} : {};
      const grant = grantSnap.exists ? grantSnap.data() || {} : {};
      if (grant.accessGranted && String(grant.sessionId || '') === sessionId) {
        return { ok: true, duplicate: true, unlocked: true };
      }
      if (!reqSnap.exists || req.status !== 'pending' || String(req.sessionId || '') !== sessionId) {
        if (req.status === 'approved') return { ok: true, duplicate: true, unlocked: true };
        const err = new Error('NO_PENDING');
        err.code = 'NO_PENDING';
        throw err;
      }
      const holdId = String(req.giftTransactionId || req.requestId || '');
      const holdRef = rRef.collection('privateHolds').doc(holdId);
      const holdSnap = await tx.get(holdRef);
      const hold = holdSnap.exists ? holdSnap.data() || {} : {};
      if (hold.status === 'captured') {
        return { ok: true, duplicate: true, unlocked: true };
      }
      if (hold.status !== 'held') {
        const err = new Error('NO_HOLD');
        err.code = 'NO_HOLD';
        throw err;
      }
      const hostUid = String(room.hostUid || hold.hostUid || '');
      const coins = Math.max(0, Math.floor(Number(hold.coins) || 0));
      const hostRef = hostUid ? db.collection('users').doc(hostUid) : null;
      const hostSnap = hostRef ? await tx.get(hostRef) : null;
      if (hostRef && hostSnap) {
        const current = normalizeBlastBalances(hostSnap.exists ? hostSnap.data() : {});
        const next = applyCreditEarned(current, coins);
        tx.set(
          hostRef,
          {
            firebaseUid: hostUid,
            ...firestoreBalancePatch(next),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        const { writeLedgerEntry } = require('./walletFirestore');
        const { TX, BUCKET, DIRECTION } = require('./walletEngine');
        writeLedgerEntry(tx, db, {
          userId: hostUid,
          transactionType: TX.EARNING_PRIVATE,
          bucket: BUCKET.EARNED,
          amount: coins,
          direction: DIRECTION.CREDIT,
          idempotencyKey: `PRIVATE_CAPTURE:${holdId}`,
          referenceType: 'live_private',
          referenceId: sessionId,
        });
      }
      tx.set(
        holdRef,
        {
          status: 'captured',
          resolvedAtMs: Date.now(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.set(
        reqRef,
        {
          status: 'approved',
          updatedAtMs: Date.now(),
          resolvedAtMs: Date.now(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.set(
        grantRef,
        {
          uid,
          sessionId,
          privateSessionId: sessionId,
          requestId: holdId,
          accessGranted: true,
          source: 'host',
          grantedAtMs: Date.now(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return { ok: true, unlocked: true, hostUid, coins };
    });

    liveLocks.markUnlocked(roomName, uid);
    if (result.hostUid && result.coins && !result.duplicate) {
      credit(result.hostUid, result.coins);
    }
    if (!result.duplicate) {
      logPrivate('approve', { room: roomKey(roomName), viewerUid: uid });
      logPrivate('capture', { room: roomKey(roomName), viewerUid: uid });
    }
    return result;
  } catch (error) {
    if (error.code === 'FORBIDDEN') {
      return { ok: false, status: 403, error: 'Solo el anfitrión puede aceptar solicitudes' };
    }
    if (error.code === 'NO_PENDING' || error.code === 'NO_HOLD') {
      return { ok: false, status: 409, error: 'No hay solicitud pendiente' };
    }
    console.error('[PRIVATE] approve failed', error);
    return { ok: false, status: 500, error: 'No se pudo aceptar' };
  }
}

async function rejectRequest(roomName, { actorUid, viewerUid }) {
  const uid = String(viewerUid || '');
  if (!uid) return { ok: false, status: 400, error: 'viewerUid es obligatorio' };
  if (!firestoreConfigured()) return { ok: false, status: 503, error: 'Privado no disponible' };
  const db = getAdminDb();
  try {
    const result = await db.runTransaction(async (tx) => {
      const rRef = roomRef(db, roomName);
      const reqRef = rRef.collection('privateRequests').doc(uid);
      const roomSnap = await tx.get(rRef);
      const reqSnap = await tx.get(reqRef);
      const room = roomSnap.data() || {};
      if (String(room.hostUid || '') && actorUid && String(room.hostUid) !== String(actorUid)) {
        const err = new Error('FORBIDDEN');
        err.code = 'FORBIDDEN';
        throw err;
      }
      const sessionId = String(room.privateSessionId || '');
      const req = reqSnap.exists ? reqSnap.data() || {} : {};
      if (!reqSnap.exists || String(req.sessionId || '') !== sessionId) {
        const err = new Error('NO_PENDING');
        err.code = 'NO_PENDING';
        throw err;
      }
      if (req.status === 'rejected') {
        return { ok: true, duplicate: true, requestStatus: 'rejected' };
      }
      if (req.status !== 'pending') {
        const err = new Error('NO_PENDING');
        err.code = 'NO_PENDING';
        throw err;
      }
      const holdId = String(req.giftTransactionId || req.requestId || '');
      const holdRef = rRef.collection('privateHolds').doc(holdId);
      const userRef = db.collection('users').doc(uid);
      const [holdSnap, userSnap] = await Promise.all([tx.get(holdRef), tx.get(userRef)]);
      const hold = holdSnap.exists ? holdSnap.data() || {} : {};
      if (hold.status === 'refunded') {
        tx.set(
          reqRef,
          { status: 'rejected', updatedAtMs: Date.now(), updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
        return { ok: true, duplicate: true, requestStatus: 'rejected' };
      }
      if (hold.status === 'captured') {
        const err = new Error('CAPTURED');
        err.code = 'CAPTURED';
        throw err;
      }
      const purchased = Math.max(0, Math.floor(Number(hold.chargedPurchased ?? hold.coins) || 0));
      const earned = Math.max(0, Math.floor(Number(hold.chargedEarned) || 0));
      let next = normalizeBlastBalances(userSnap.exists ? userSnap.data() : {});
      if (purchased) next = applyCreditPurchased(next, purchased);
      if (earned) next = applyCreditEarned(next, earned);
      tx.set(
        userRef,
        {
          firebaseUid: uid,
          ...firestoreBalancePatch(next),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      const { writeLedgerEntries } = require('./walletFirestore');
      const { TX, BUCKET, DIRECTION } = require('./walletEngine');
      const refundLedger = [];
      if (purchased) {
        refundLedger.push({
          userId: uid,
          transactionType: TX.REFUND,
          bucket: BUCKET.PURCHASED,
          amount: purchased,
          direction: DIRECTION.CREDIT,
          idempotencyKey: `PRIVATE_REFUND:${holdId}:purchased`,
          referenceType: 'live_private',
          referenceId: sessionId,
        });
      }
      if (earned) {
        refundLedger.push({
          userId: uid,
          transactionType: TX.REFUND,
          bucket: BUCKET.EARNED,
          amount: earned,
          direction: DIRECTION.CREDIT,
          idempotencyKey: `PRIVATE_REFUND:${holdId}:earned`,
          referenceType: 'live_private',
          referenceId: sessionId,
        });
      }
      writeLedgerEntries(tx, db, refundLedger);
      tx.set(
        holdRef,
        {
          status: 'refunded',
          resolvedAtMs: Date.now(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.set(
        reqRef,
        {
          status: 'rejected',
          updatedAtMs: Date.now(),
          resolvedAtMs: Date.now(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return { ok: true, requestStatus: 'rejected', senderBalance: next.coinsBalance, balances: next };
    });

    if (result.balances) setBalances(uid, result.balances);
    if (!result.duplicate) {
      logPrivate('reject', { room: roomKey(roomName), viewerUid: uid });
      logPrivate('refund', { room: roomKey(roomName), viewerUid: uid });
    }
    return result;
  } catch (error) {
    if (error.code === 'FORBIDDEN') {
      return { ok: false, status: 403, error: 'Solo el anfitrión puede rechazar solicitudes' };
    }
    if (error.code === 'NO_PENDING') {
      return { ok: false, status: 409, error: 'No hay solicitud pendiente' };
    }
    console.error('[PRIVATE] reject failed', error);
    return { ok: false, status: 500, error: 'No se pudo rechazar' };
  }
}

async function refundPendingForSession(roomName, sessionId) {
  if (!firestoreConfigured() || !sessionId) return;
  const db = getAdminDb();
  const snap = await roomRef(db, roomName)
    .collection('privateRequests')
    .where('status', '==', 'pending')
    .get();
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (String(data.sessionId || '') !== sessionId) continue;
    const result = await rejectRequest(roomName, {
      actorUid: null,
      viewerUid: String(data.uid || doc.id),
    });
    if (!result.ok) {
      try {
        const holdId = String(data.giftTransactionId || data.requestId || '');
        if (holdId) {
          await roomRef(db, roomName)
            .collection('privateHolds')
            .doc(holdId)
            .set(
              { status: 'refund_pending', updatedAt: FieldValue.serverTimestamp() },
              { merge: true },
            );
        }
      } catch {
        /* reintento posterior */
      }
    }
  }
}

async function stopSession(roomName, { reason } = {}) {
  const prev = liveLocks.getLock(roomName);
  let sessionId = prev?.privateSessionId || '';
  if (firestoreConfigured()) {
    const db = getAdminDb();
    const snap = await roomRef(db, roomName).get();
    const data = snap.exists ? snap.data() || {} : {};
    sessionId = String(data.privateSessionId || sessionId || '');
    const wasActive = sessionIsOpen(data) || Boolean(prev);
    if (wasActive && sessionId) {
      await refundPendingForSession(roomName, sessionId);
    }
    await resetLiveRoomSessionArtifacts(roomName, {
      includeWishlist: reason === 'live_stop',
    });
  }
  liveLocks.clearLock(roomName);
  if (sessionId) logPrivate('session-stop', { room: roomKey(roomName), reason: reason || 'stop' });
  return { ok: true, isPrivate: false, lock: null };
}

async function deleteRoomSubcollection(rRef, name) {
  const db = rRef.firestore;
  for (;;) {
    const snap = await rRef.collection(name).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
}

async function resetLiveRoomSessionArtifacts(roomName, { includeWishlist } = {}) {
  if (!firestoreConfigured()) return;
  const db = getAdminDb();
  const rRef = roomRef(db, roomName);
  await rRef.set(
    {
      ...(includeWishlist
        ? {
            wishlist: [],
            wishlistItems: [],
            wishlistCompleted: [],
            wishlistGiftEvents: [],
          }
        : {}),
      privatePhase: null,
      privateSessionId: null,
      privateSessionStatus: 'ended',
      isPrivate: false,
      lockGiftId: null,
      requiredGiftId: null,
      privateStartsAtMs: null,
      privatePendingRequirements: null,
      privateRequirements: null,
      privateActivatedAtMs: null,
      countdownDurationMs: null,
      requirementsCompletedAtMs: null,
      qualifiedViewerUids: [],
      privateGiftEvents: [],
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await deleteRoomSubcollection(rRef, 'privateRequests');
  await deleteRoomSubcollection(rRef, 'privateGrants');
  await deleteRoomSubcollection(rRef, 'privateHolds');
}

module.exports = {
  hydrateLock,
  startSession,
  sealSession,
  stopSession,
  requestAccess,
  approveRequest,
  rejectRequest,
  readViewerAccess,
  newSessionId,
};
