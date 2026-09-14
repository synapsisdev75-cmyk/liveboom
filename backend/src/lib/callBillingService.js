const { randomUUID } = require('crypto');
const persist = require('./persist');
const { setBalance, getBalance, debit, credit } = require('./walletMemory');
const {
  CALL_PRICING,
  CREATOR_VALUE_PER_BLAST,
  BILLING_GRACE_SECONDS,
  normalizeCallType,
  blastPerMinute,
  calculateBlastDue,
  creatorCopForBlast,
  estimateRemainingSeconds,
  pricingLabel,
} = require('./callBillingConfig');

/** @type {Map<string, object>} */
const memorySessions = new Map();
/** @type {Map<string, object>} */
const memoryCharges = new Map();

function hydrateMemory() {
  const data = persist.load('callBilling', { sessions: {}, charges: {} });
  for (const [id, row] of Object.entries(data.sessions || {})) {
    memorySessions.set(id, row);
  }
  for (const [id, row] of Object.entries(data.charges || {})) {
    memoryCharges.set(id, row);
  }
}

function flushMemory() {
  persist.debouncedSave('callBilling', {
    sessions: Object.fromEntries(memorySessions),
    charges: Object.fromEntries(memoryCharges),
  });
}

hydrateMemory();

function adminReady() {
  try {
    const { hasAdminCredentials, firestoreConfigured } = require('./firestoreAdmin');
    return Boolean(hasAdminCredentials() && firestoreConfigured());
  } catch {
    return false;
  }
}

function chargeDocId(callId, uptoBlast) {
  return `call_${String(callId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)}_upto_${Math.max(0, Math.floor(uptoBlast))}`;
}

function buildSession(input) {
  const callType = normalizeCallType(input.callType || (input.video ? 'video' : 'voice'), input.quality);
  return {
    callId: String(input.callId),
    chatId: String(input.chatId || ''),
    callerId: String(input.callerId),
    receiverId: String(input.receiverId),
    callType,
    video: Boolean(input.video) || callType !== 'voice',
    rateBlasts: blastPerMinute(callType),
    connectedAtMs: null,
    blastAlreadyCharged: 0,
    lastConnectedSeconds: 0,
    creatorValueCop: 0,
    status: 'pending',
    exhausted: false,
    updatedAtMs: Date.now(),
  };
}

async function readSession(callId) {
  const id = String(callId || '').trim();
  if (!id) return null;
  if (adminReady()) {
    const { getAdminDb } = require('./firestoreAdmin');
    const snap = await getAdminDb().collection('callBilling').doc(id).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() };
  }
  return memorySessions.get(id) || null;
}

async function writeSession(session) {
  const id = String(session.callId);
  const row = { ...session, updatedAtMs: Date.now() };
  if (adminReady()) {
    const { getAdminDb } = require('./firestoreAdmin');
    const { FieldValue } = require('firebase-admin/firestore');
    await getAdminDb()
      .collection('callBilling')
      .doc(id)
      .set(
        {
          ...row,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    return row;
  }
  memorySessions.set(id, row);
  flushMemory();
  return row;
}

async function readCallerBalance(uid) {
  if (adminReady()) {
    const { readUserCoinsBalance } = require('./firestoreAdmin');
    const fsBal = await readUserCoinsBalance(uid);
    const mem = getBalance(uid);
    const bal = Math.max(fsBal, mem);
    if (bal !== mem) setBalance(uid, bal);
    return bal;
  }
  return getBalance(uid);
}

/**
 * Arranca billing cuando la llamada está realmente conectada/activa.
 * Idempotente: no reinicia connectedAtMs ni blastAlreadyCharged.
 */
async function startBilling(input) {
  const callId = String(input.callId || '').trim();
  const callerId = String(input.callerId || '').trim();
  const receiverId = String(input.receiverId || '').trim();
  if (!callId || !callerId || !receiverId || callerId === receiverId) {
    const err = new Error('Datos de billing inválidos');
    err.code = 'CALL_BILLING_BAD_INPUT';
    throw err;
  }

  const existing = await readSession(callId);
  if (existing) {
    if (String(existing.callerId) !== callerId) {
      const err = new Error('No autorizado para este billing');
      err.code = 'CALL_BILLING_FORBIDDEN';
      throw err;
    }
    const next = {
      ...existing,
      // Reanudación / re-mount: no reinicia cobros ni connectedAt.
      status: existing.status === 'stopped' ? 'stopped' : 'active',
      connectedAtMs: existing.connectedAtMs || Date.now(),
      exhausted: existing.status === 'stopped' ? Boolean(existing.exhausted) : false,
    };
    // Si aún no estaba detenida, asegurar active.
    if (existing.status !== 'stopped') {
      next.status = 'active';
      next.exhausted = false;
    }
    await writeSession(next);
    return publicSession(next, await readCallerBalance(callerId));
  }

  const session = buildSession({
    ...input,
    callId,
    callerId,
    receiverId,
  });
  session.status = 'active';
  session.connectedAtMs = Date.now();
  await writeSession(session);
  return publicSession(session, await readCallerBalance(callerId));
}

function resolvedConnectedSeconds(session, hintSeconds) {
  const now = Date.now();
  const fromClock =
    session.connectedAtMs && Number(session.connectedAtMs) > 0
      ? Math.max(0, Math.floor((now - Number(session.connectedAtMs)) / 1000))
      : 0;
  const hint = Math.max(0, Math.floor(Number(hintSeconds) || 0));
  // Backend clock is authority; hint only fills gaps (reconnect) without shrinking.
  const prev = Math.max(0, Math.floor(Number(session.lastConnectedSeconds) || 0));
  return Math.max(fromClock, hint, prev);
}

function publicSession(session, balance) {
  const callType = normalizeCallType(session.callType);
  const connectedSeconds = Math.max(0, Math.floor(Number(session.lastConnectedSeconds) || 0));
  const rate = blastPerMinute(callType);
  const blastDue = calculateBlastDue(connectedSeconds, callType);
  const charged = Math.max(0, Math.floor(Number(session.blastAlreadyCharged) || 0));
  const remainingSeconds = estimateRemainingSeconds(balance, callType);
  return {
    callId: session.callId,
    chatId: session.chatId || '',
    callerId: session.callerId,
    receiverId: session.receiverId,
    callType,
    rateBlasts: rate,
    pricingLabel: pricingLabel(callType),
    connectedSeconds,
    blastDue,
    blastAlreadyCharged: charged,
    creatorValueCop: Math.max(0, Math.floor(Number(session.creatorValueCop) || 0)),
    creatorValuePerBlast: CREATOR_VALUE_PER_BLAST,
    graceSeconds: BILLING_GRACE_SECONDS,
    status: session.status || 'pending',
    exhausted: Boolean(session.exhausted),
    callerBalance: Math.max(0, Math.floor(Number(balance) || 0)),
    estimatedRemainingSeconds: Number.isFinite(remainingSeconds) ? remainingSeconds : null,
    isLowBalance: Number.isFinite(remainingSeconds) && remainingSeconds > 0 && remainingSeconds <= 120,
    CALL_PRICING,
  };
}

/**
 * Cobro atómico e idempotente por delta de Blast debidos.
 */
async function chargeDeltaInternal(session, connectedSeconds) {
  const callType = normalizeCallType(session.callType);
  const due = calculateBlastDue(connectedSeconds, callType);
  const already = Math.max(0, Math.floor(Number(session.blastAlreadyCharged) || 0));
  const delta = Math.max(0, due - already);
  const nextSessionBase = {
    ...session,
    lastConnectedSeconds: Math.max(
      Math.max(0, Math.floor(Number(session.lastConnectedSeconds) || 0)),
      connectedSeconds,
    ),
  };

  if (session.status === 'stopped' || session.exhausted) {
    return {
      session: nextSessionBase,
      chargedDelta: 0,
      duplicate: false,
      insufficient: false,
      callerBalance: await readCallerBalance(session.callerId),
    };
  }

  if (delta <= 0) {
    const saved = await writeSession(nextSessionBase);
    return {
      session: saved,
      chargedDelta: 0,
      duplicate: false,
      insufficient: false,
      callerBalance: await readCallerBalance(session.callerId),
    };
  }

  const chargeId = chargeDocId(session.callId, due);

  if (adminReady()) {
    return chargeWithFirestore(nextSessionBase, due, already, delta, chargeId, connectedSeconds);
  }
  return chargeWithMemory(nextSessionBase, due, already, delta, chargeId, connectedSeconds);
}

async function chargeWithMemory(session, due, already, delta, chargeId, connectedSeconds) {
  if (memoryCharges.has(chargeId)) {
    const prev = memoryCharges.get(chargeId);
    const bal = getBalance(session.callerId);
    return {
      session: {
        ...session,
        blastAlreadyCharged: Math.max(already, Number(prev?.blastCharged) || already),
        lastConnectedSeconds: connectedSeconds,
      },
      chargedDelta: 0,
      duplicate: true,
      insufficient: false,
      callerBalance: bal,
    };
  }

  const bal = getBalance(session.callerId);
  if (bal < delta) {
    const saved = await writeSession({ ...session, exhausted: true, lastConnectedSeconds: connectedSeconds });
    return {
      session: saved,
      chargedDelta: 0,
      duplicate: false,
      insufficient: true,
      callerBalance: bal,
    };
  }

  const nextBal = debit(session.callerId, delta);
  if (nextBal == null) {
    const saved = await writeSession({ ...session, exhausted: true, lastConnectedSeconds: connectedSeconds });
    return {
      session: saved,
      chargedDelta: 0,
      duplicate: false,
      insufficient: true,
      callerBalance: getBalance(session.callerId),
    };
  }

  credit(session.receiverId, delta);
  const creatorCop = creatorCopForBlast(delta);
  const charge = {
    id: chargeId,
    transactionId: chargeId,
    call_id: session.callId,
    caller_id: session.callerId,
    receiver_id: session.receiverId,
    call_type: session.callType,
    seconds_connected: connectedSeconds,
    blast_due: due,
    blast_charged: delta,
    creator_blast: delta,
    creator_cop: creatorCop,
    timestamp: new Date().toISOString(),
  };
  memoryCharges.set(chargeId, charge);
  const saved = await writeSession({
    ...session,
    blastAlreadyCharged: already + delta,
    creatorValueCop: Math.max(0, Math.floor(Number(session.creatorValueCop) || 0)) + creatorCop,
    lastConnectedSeconds: connectedSeconds,
    status: 'active',
  });
  flushMemory();
  return {
    session: saved,
    chargedDelta: delta,
    duplicate: false,
    insufficient: false,
    callerBalance: nextBal,
    charge,
  };
}

async function chargeWithFirestore(session, due, already, delta, chargeId, connectedSeconds) {
  const { getAdminDb } = require('./firestoreAdmin');
  const { FieldValue } = require('firebase-admin/firestore');
  const db = getAdminDb();
  const billingRef = db.collection('callBilling').doc(String(session.callId));
  const chargeRef = db.collection('callCharges').doc(chargeId);
  const callerRef = db.collection('users').doc(String(session.callerId));
  const receiverRef = db.collection('users').doc(String(session.receiverId));
  const inboxRef = db.collection('users').doc(String(session.receiverId)).collection('giftInbox').doc(chargeId);
  const ledgerRef = db.collection('callLedger').doc(chargeId);

  const result = await db.runTransaction(async (tx) => {
    const [billingSnap, chargeSnap, callerSnap] = await Promise.all([
      tx.get(billingRef),
      tx.get(chargeRef),
      tx.get(callerRef),
    ]);

    const live = billingSnap.exists ? { ...session, ...billingSnap.data() } : session;
    const liveAlready = Math.max(0, Math.floor(Number(live.blastAlreadyCharged) || 0));
    const liveDue = calculateBlastDue(
      Math.max(connectedSeconds, Math.floor(Number(live.lastConnectedSeconds) || 0)),
      live.callType || session.callType,
    );
    const liveDelta = Math.max(0, liveDue - liveAlready);

    if (chargeSnap.exists) {
      const bal = callerSnap.exists ? Number(callerSnap.data()?.coinsBalance ?? 0) : 0;
      setBalance(session.callerId, bal);
      return {
        session: {
          ...live,
          blastAlreadyCharged: Math.max(liveAlready, Number(chargeSnap.data()?.blast_due) || liveAlready),
          lastConnectedSeconds: Math.max(
            connectedSeconds,
            Math.floor(Number(live.lastConnectedSeconds) || 0),
          ),
        },
        chargedDelta: 0,
        duplicate: true,
        insufficient: false,
        callerBalance: bal,
      };
    }

    if (live.status === 'stopped' || live.exhausted || liveDelta <= 0) {
      const bal = callerSnap.exists ? Number(callerSnap.data()?.coinsBalance ?? 0) : 0;
      const next = {
        ...live,
        lastConnectedSeconds: Math.max(
          connectedSeconds,
          Math.floor(Number(live.lastConnectedSeconds) || 0),
        ),
      };
      tx.set(billingRef, { ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      setBalance(session.callerId, bal);
      return {
        session: next,
        chargedDelta: 0,
        duplicate: false,
        insufficient: false,
        callerBalance: bal,
      };
    }

    const current = callerSnap.exists ? Number(callerSnap.data()?.coinsBalance ?? 0) : 0;
    if (current < liveDelta) {
      const next = {
        ...live,
        exhausted: true,
        lastConnectedSeconds: Math.max(
          connectedSeconds,
          Math.floor(Number(live.lastConnectedSeconds) || 0),
        ),
        updatedAtMs: Date.now(),
      };
      tx.set(billingRef, { ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      setBalance(session.callerId, current);
      return {
        session: next,
        chargedDelta: 0,
        duplicate: false,
        insufficient: true,
        callerBalance: current,
      };
    }

    const nextBal = current - liveDelta;
    const creatorCop = creatorCopForBlast(liveDelta);
    const charge = {
      id: chargeId,
      transaction_id: chargeId,
      call_id: session.callId,
      caller_id: session.callerId,
      receiver_id: session.receiverId,
      call_type: normalizeCallType(live.callType || session.callType),
      seconds_connected: Math.max(
        connectedSeconds,
        Math.floor(Number(live.lastConnectedSeconds) || 0),
      ),
      blast_due: liveDue,
      blast_charged: liveDelta,
      creator_blast: liveDelta,
      creator_cop: creatorCop,
      timestamp: new Date().toISOString(),
      createdAt: FieldValue.serverTimestamp(),
    };

    tx.set(
      callerRef,
      { coinsBalance: nextBal, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    tx.set(
      inboxRef,
      {
        senderUid: session.callerId,
        senderName: 'Llamada',
        recipientUid: session.receiverId,
        giftId: `call_${normalizeCallType(live.callType || session.callType)}`,
        giftName: pricingLabel(live.callType || session.callType),
        emoji: '🔥',
        coins: liveDelta,
        multiplier: 1,
        postId: null,
        clientId: chargeId,
        callId: session.callId,
        callCharge: true,
        creatorValueCop: creatorCop,
        processed: false,
        createdAt: FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
      },
      { merge: true },
    );
    tx.set(
      receiverRef,
      {
        callEarningsCop: FieldValue.increment(creatorCop),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    tx.set(chargeRef, charge, { merge: true });
    tx.set(ledgerRef, charge, { merge: true });

    const nextSession = {
      ...live,
      blastAlreadyCharged: liveAlready + liveDelta,
      creatorValueCop: Math.max(0, Math.floor(Number(live.creatorValueCop) || 0)) + creatorCop,
      lastConnectedSeconds: Math.max(
        connectedSeconds,
        Math.floor(Number(live.lastConnectedSeconds) || 0),
      ),
      status: 'active',
      exhausted: false,
      updatedAtMs: Date.now(),
    };
    tx.set(billingRef, { ...nextSession, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    setBalance(session.callerId, nextBal);
    return {
      session: nextSession,
      chargedDelta: liveDelta,
      duplicate: false,
      insufficient: false,
      callerBalance: nextBal,
      charge,
    };
  });

  // Chat merge above may overwrite nested call incorrectly with set merge on map —
  // use Field path updates outside if needed. Safer follow-up patch:
  if (session.chatId && result.chargedDelta > 0) {
    try {
      const { getAdminDb: gdb } = require('./firestoreAdmin');
      const { FieldValue: FV } = require('firebase-admin/firestore');
      await gdb()
        .collection('chats')
        .doc(String(session.chatId))
        .update({
          'call.spentBlasts': Math.max(0, Math.floor(Number(result.session.blastAlreadyCharged) || 0)),
          'call.blastAlreadyCharged': Math.max(
            0,
            Math.floor(Number(result.session.blastAlreadyCharged) || 0),
          ),
          'call.creatorValueCop': Math.max(0, Math.floor(Number(result.session.creatorValueCop) || 0)),
          'call.lastConnectedSeconds': Math.max(
            0,
            Math.floor(Number(result.session.lastConnectedSeconds) || 0),
          ),
          'call.billingCallType': normalizeCallType(result.session.callType),
          updatedAt: FV.serverTimestamp(),
        });
    } catch {
      /* chat may not exist locally */
    }
  }

  return result;
}

async function updateBilling(input) {
  const callId = String(input.callId || '').trim();
  const callerId = String(input.callerId || '').trim();
  const session = await readSession(callId);
  if (!session) {
    const err = new Error('Billing no iniciado');
    err.code = 'CALL_BILLING_NOT_STARTED';
    throw err;
  }
  if (String(session.callerId) !== callerId) {
    const err = new Error('No autorizado para este billing');
    err.code = 'CALL_BILLING_FORBIDDEN';
    throw err;
  }
  if (!session.connectedAtMs) {
    session.connectedAtMs = Date.now();
    session.status = 'active';
    await writeSession(session);
  }
  const seconds = resolvedConnectedSeconds(session, input.connectedSeconds);
  const charged = await chargeDeltaInternal(session, seconds);
  return {
    ...publicSession(charged.session, charged.callerBalance),
    chargedDelta: charged.chargedDelta,
    duplicate: charged.duplicate,
    insufficient: charged.insufficient,
    shouldEnd: Boolean(charged.insufficient || charged.session.exhausted),
  };
}

async function stopBilling(input) {
  const callId = String(input.callId || '').trim();
  const callerId = String(input.callerId || '').trim();
  let session = await readSession(callId);
  if (!session) {
    return {
      callId,
      blastAlreadyCharged: 0,
      creatorValueCop: 0,
      connectedSeconds: 0,
      stopped: true,
    };
  }
  if (callerId && String(session.callerId) !== callerId && String(session.receiverId) !== callerId) {
    const err = new Error('No autorizado para este billing');
    err.code = 'CALL_BILLING_FORBIDDEN';
    throw err;
  }

  if (String(session.callerId) === callerId || !callerId) {
    const seconds = resolvedConnectedSeconds(session, input.connectedSeconds);
    const charged = await chargeDeltaInternal(session, seconds);
    session = charged.session;
  }

  session = await writeSession({
    ...session,
    status: 'stopped',
    endedAtMs: Date.now(),
  });

  const bal = await readCallerBalance(session.callerId);
  return {
    ...publicSession(session, bal),
    stopped: true,
  };
}

async function checkBalance(uid, callType) {
  const balance = await readCallerBalance(uid);
  const rate = blastPerMinute(callType);
  const remainingSeconds = estimateRemainingSeconds(balance, callType);
  return {
    balance,
    rateBlasts: rate,
    enoughToStart: balance >= rate && rate > 0,
    estimatedRemainingSeconds: Number.isFinite(remainingSeconds) ? remainingSeconds : null,
    estimatedMinutes: rate > 0 ? Math.floor(balance / rate) : null,
    CALL_PRICING,
    creatorValuePerBlast: CREATOR_VALUE_PER_BLAST,
  };
}

module.exports = {
  CALL_PRICING,
  CREATOR_VALUE_PER_BLAST,
  BILLING_GRACE_SECONDS,
  startBilling,
  updateBilling,
  stopBilling,
  checkBalance,
  calculateBlastDue,
  blastPerMinute,
  normalizeCallType,
  creatorCopForBlast,
  estimateRemainingSeconds,
  pricingLabel,
  readSession,
};
