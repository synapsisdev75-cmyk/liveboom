const { randomUUID } = require('crypto');
const persist = require('./persist');
const {
  setBalance,
  getBalance,
  getBalances,
  setBalances,
  debitSplit,
  creditEarned,
} = require('./walletMemory');
const {
  normalizeBlastBalances,
  applySpend,
  applyCreditEarned,
  firestoreBalancePatch,
} = require('./blastBalances');
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
    allowEarnedBlastForCall: false,
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

async function readCallerBalances(uid) {
  if (adminReady()) {
    const { readUserBlastBalances } = require('./firestoreAdmin');
    const fsBal = await readUserBlastBalances(uid);
    const mem = getBalances(uid);
    // Prefer the higher total to avoid stale memory under-credit; keep split from Firestore when present.
    if (fsBal.coinsBalance >= mem.coinsBalance) {
      setBalances(uid, fsBal);
      return fsBal;
    }
    return mem;
  }
  return getBalances(uid);
}

async function readCallerBalance(uid) {
  return (await readCallerBalances(uid)).coinsBalance;
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

  const allowEarned = Boolean(input.allowEarnedBlastForCall);
  const existing = await readSession(callId);
  if (existing) {
    if (String(existing.callerId) !== callerId) {
      const err = new Error('No autorizado para este billing');
      err.code = 'CALL_BILLING_FORBIDDEN';
      throw err;
    }
    const next = {
      ...existing,
      status: existing.status === 'stopped' ? 'stopped' : 'active',
      connectedAtMs: existing.connectedAtMs || Date.now(),
      exhausted: existing.status === 'stopped' ? Boolean(existing.exhausted) : false,
      allowEarnedBlastForCall: allowEarned || Boolean(existing.allowEarnedBlastForCall),
    };
    if (existing.status !== 'stopped') {
      next.status = 'active';
      next.exhausted = false;
    }
    await writeSession(next);
    return publicSession(next, await readCallerBalances(callerId));
  }

  const session = buildSession({
    ...input,
    callId,
    callerId,
    receiverId,
  });
  session.status = 'active';
  session.connectedAtMs = Date.now();
  session.allowEarnedBlastForCall = allowEarned;
  await writeSession(session);
  return publicSession(session, await readCallerBalances(callerId));
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

function publicSession(session, balancesOrNumber) {
  const callType = normalizeCallType(session.callType);
  const connectedSeconds = Math.max(0, Math.floor(Number(session.lastConnectedSeconds) || 0));
  const rate = blastPerMinute(callType);
  const blastDue = calculateBlastDue(connectedSeconds, callType);
  const charged = Math.max(0, Math.floor(Number(session.blastAlreadyCharged) || 0));
  const balances =
    balancesOrNumber && typeof balancesOrNumber === 'object'
      ? normalizeBlastBalances(balancesOrNumber)
      : normalizeBlastBalances({ coinsBalance: balancesOrNumber });
  const remainingSeconds = estimateRemainingSeconds(balances.coinsBalance, callType);
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
    allowEarnedBlastForCall: Boolean(session.allowEarnedBlastForCall),
    callerBalance: balances.coinsBalance,
    purchasedBlastBalance: balances.purchasedBlastBalance,
    earnedBlastBalance: balances.earnedBlastBalance,
    totalBlastBalance: balances.totalBlastBalance,
    estimatedRemainingSeconds: Number.isFinite(remainingSeconds) ? remainingSeconds : null,
    isLowBalance: Number.isFinite(remainingSeconds) && remainingSeconds > 0 && remainingSeconds <= 120,
    CALL_PRICING,
  };
}

/**
 * Cobro atómico e idempotente por delta de Blast debidos.
 */
async function chargeDeltaInternal(session, connectedSeconds, allowEarnedOverride) {
  const callType = normalizeCallType(session.callType);
  const due = calculateBlastDue(connectedSeconds, callType);
  const already = Math.max(0, Math.floor(Number(session.blastAlreadyCharged) || 0));
  const delta = Math.max(0, due - already);
  const allowEarned =
    allowEarnedOverride != null
      ? Boolean(allowEarnedOverride)
      : Boolean(session.allowEarnedBlastForCall);
  const nextSessionBase = {
    ...session,
    allowEarnedBlastForCall: allowEarned || Boolean(session.allowEarnedBlastForCall),
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
      needsEarnedAuth: false,
      callerBalances: await readCallerBalances(session.callerId),
      chargedPurchased: 0,
      chargedEarned: 0,
    };
  }

  if (delta <= 0) {
    const saved = await writeSession(nextSessionBase);
    return {
      session: saved,
      chargedDelta: 0,
      duplicate: false,
      insufficient: false,
      needsEarnedAuth: false,
      callerBalances: await readCallerBalances(session.callerId),
      chargedPurchased: 0,
      chargedEarned: 0,
    };
  }

  const chargeId = chargeDocId(session.callId, due);

  if (adminReady()) {
    return chargeWithFirestore(
      nextSessionBase,
      due,
      already,
      delta,
      chargeId,
      connectedSeconds,
      allowEarned,
    );
  }
  return chargeWithMemory(
    nextSessionBase,
    due,
    already,
    delta,
    chargeId,
    connectedSeconds,
    allowEarned,
  );
}

async function chargeWithMemory(session, due, already, delta, chargeId, connectedSeconds, allowEarned) {
  if (memoryCharges.has(chargeId)) {
    const prev = memoryCharges.get(chargeId);
    const bal = getBalances(session.callerId);
    return {
      session: {
        ...session,
        blastAlreadyCharged: Math.max(already, Number(prev?.blastCharged) || already),
        lastConnectedSeconds: connectedSeconds,
      },
      chargedDelta: 0,
      duplicate: true,
      insufficient: false,
      needsEarnedAuth: false,
      callerBalances: bal,
      chargedPurchased: 0,
      chargedEarned: 0,
    };
  }

  const spent = debitSplit(session.callerId, delta, allowEarned);
  if (!spent.ok) {
    if (spent.code === 'NEEDS_EARNED_AUTH') {
      const saved = await writeSession({
        ...session,
        lastConnectedSeconds: connectedSeconds,
        exhausted: false,
      });
      return {
        session: saved,
        chargedDelta: 0,
        duplicate: false,
        insufficient: false,
        needsEarnedAuth: true,
        callerBalances: spent.balances || getBalances(session.callerId),
        chargedPurchased: 0,
        chargedEarned: 0,
      };
    }
    const saved = await writeSession({ ...session, exhausted: true, lastConnectedSeconds: connectedSeconds });
    return {
      session: saved,
      chargedDelta: 0,
      duplicate: false,
      insufficient: true,
      needsEarnedAuth: false,
      callerBalances: spent.balances || getBalances(session.callerId),
      chargedPurchased: 0,
      chargedEarned: 0,
    };
  }

  creditEarned(session.receiverId, delta);
  const creatorCop = creatorCopForBlast(delta);
  const charge = {
    id: chargeId,
    transactionId: chargeId,
    chargeSequence: due,
    call_id: session.callId,
    caller_id: session.callerId,
    receiver_id: session.receiverId,
    call_type: session.callType,
    seconds_connected: connectedSeconds,
    blast_due: due,
    blast_charged: delta,
    charged_purchased: spent.chargedPurchased,
    charged_earned: spent.chargedEarned,
    creator_blast: delta,
    creator_cop: creatorCop,
    balance_type: spent.chargedEarned > 0 ? 'mixed' : 'purchased',
    timestamp: new Date().toISOString(),
  };
  memoryCharges.set(chargeId, charge);
  const saved = await writeSession({
    ...session,
    blastAlreadyCharged: already + delta,
    allowEarnedBlastForCall: allowEarned,
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
    needsEarnedAuth: false,
    callerBalances: spent.balances,
    chargedPurchased: spent.chargedPurchased,
    chargedEarned: spent.chargedEarned,
    charge,
  };
}

async function chargeWithFirestore(session, due, already, delta, chargeId, connectedSeconds, allowEarned) {
  const { getAdminDb } = require('./firestoreAdmin');
  const { FieldValue } = require('firebase-admin/firestore');
  const db = getAdminDb();
  const billingRef = db.collection('callBilling').doc(String(session.callId));
  const chargeRef = db.collection('callCharges').doc(chargeId);
  const callerRef = db.collection('users').doc(String(session.callerId));
  const receiverRef = db.collection('users').doc(String(session.receiverId));
  const inboxRef = db.collection('users').doc(String(session.receiverId)).collection('giftInbox').doc(chargeId);
  const ledgerRef = db.collection('callLedger').doc(chargeId);
  const walletTxRef = db.collection('wallet_transactions').doc(chargeId);

  const result = await db.runTransaction(async (tx) => {
    const [billingSnap, chargeSnap, callerSnap, receiverSnap] = await Promise.all([
      tx.get(billingRef),
      tx.get(chargeRef),
      tx.get(callerRef),
      tx.get(receiverRef),
    ]);

    const live = billingSnap.exists ? { ...session, ...billingSnap.data() } : session;
    const liveAlready = Math.max(0, Math.floor(Number(live.blastAlreadyCharged) || 0));
    const liveDue = calculateBlastDue(
      Math.max(connectedSeconds, Math.floor(Number(live.lastConnectedSeconds) || 0)),
      live.callType || session.callType,
    );
    const liveDelta = Math.max(0, liveDue - liveAlready);
    const liveAllow = Boolean(allowEarned || live.allowEarnedBlastForCall);
    const callerBalances = normalizeBlastBalances(callerSnap.exists ? callerSnap.data() : {});

    if (chargeSnap.exists) {
      setBalances(session.callerId, callerBalances);
      return {
        session: {
          ...live,
          blastAlreadyCharged: Math.max(liveAlready, Number(chargeSnap.data()?.blast_due) || liveAlready),
          lastConnectedSeconds: Math.max(connectedSeconds, Math.floor(Number(live.lastConnectedSeconds) || 0)),
        },
        chargedDelta: 0,
        duplicate: true,
        insufficient: false,
        needsEarnedAuth: false,
        callerBalances,
        chargedPurchased: 0,
        chargedEarned: 0,
      };
    }

    if (live.status === 'stopped' || live.exhausted || liveDelta <= 0) {
      const next = {
        ...live,
        lastConnectedSeconds: Math.max(connectedSeconds, Math.floor(Number(live.lastConnectedSeconds) || 0)),
      };
      tx.set(billingRef, { ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      setBalances(session.callerId, callerBalances);
      return {
        session: next,
        chargedDelta: 0,
        duplicate: false,
        insufficient: false,
        needsEarnedAuth: false,
        callerBalances,
        chargedPurchased: 0,
        chargedEarned: 0,
      };
    }

    const spent = applySpend(callerBalances, liveDelta, liveAllow);
    if (!spent.ok) {
      if (spent.code === 'NEEDS_EARNED_AUTH') {
        const next = {
          ...live,
          lastConnectedSeconds: Math.max(connectedSeconds, Math.floor(Number(live.lastConnectedSeconds) || 0)),
          exhausted: false,
          updatedAtMs: Date.now(),
        };
        tx.set(billingRef, { ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        setBalances(session.callerId, callerBalances);
        return {
          session: next,
          chargedDelta: 0,
          duplicate: false,
          insufficient: false,
          needsEarnedAuth: true,
          callerBalances,
          chargedPurchased: 0,
          chargedEarned: 0,
        };
      }
      const next = {
        ...live,
        exhausted: true,
        lastConnectedSeconds: Math.max(connectedSeconds, Math.floor(Number(live.lastConnectedSeconds) || 0)),
        updatedAtMs: Date.now(),
      };
      tx.set(billingRef, { ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      setBalances(session.callerId, callerBalances);
      return {
        session: next,
        chargedDelta: 0,
        duplicate: false,
        insufficient: true,
        needsEarnedAuth: false,
        callerBalances,
        chargedPurchased: 0,
        chargedEarned: 0,
      };
    }

    const receiverBalances = applyCreditEarned(
      normalizeBlastBalances(receiverSnap.exists ? receiverSnap.data() : {}),
      liveDelta,
    );
    const creatorCop = creatorCopForBlast(liveDelta);
    const charge = {
      id: chargeId,
      transaction_id: chargeId,
      charge_sequence: liveDue,
      billing_version: 1,
      call_id: session.callId,
      caller_id: session.callerId,
      receiver_id: session.receiverId,
      call_type: normalizeCallType(live.callType || session.callType),
      seconds_connected: Math.max(connectedSeconds, Math.floor(Number(live.lastConnectedSeconds) || 0)),
      blast_due: liveDue,
      blast_charged: liveDelta,
      charged_purchased: spent.chargedPurchased,
      charged_earned: spent.chargedEarned,
      creator_blast: liveDelta,
      creator_cop: creatorCop,
      timestamp: new Date().toISOString(),
      createdAt: FieldValue.serverTimestamp(),
    };

    tx.set(callerRef, { ...firestoreBalancePatch(spent.balances), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(
      receiverRef,
      {
        ...firestoreBalancePatch(receiverBalances),
        callEarningsCop: FieldValue.increment(creatorCop),
        updatedAt: FieldValue.serverTimestamp(),
      },
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
        balanceType: 'earned',
        processed: true,
        processedAtMs: Date.now(),
        createdAt: FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
      },
      { merge: true },
    );
    tx.set(chargeRef, charge, { merge: true });
    tx.set(ledgerRef, charge, { merge: true });
    tx.set(
      walletTxRef,
      {
        transaction_id: chargeId,
        user_id: session.callerId,
        amount: liveDelta,
        charged_purchased: spent.chargedPurchased,
        charged_earned: spent.chargedEarned,
        balance_type: spent.chargedEarned > 0 ? 'mixed' : 'purchased',
        source: spent.chargedEarned > 0 ? 'call_spend_mixed' : 'call_spend_purchased',
        call_id: session.callId,
        status: 'completed',
        timestamp: new Date().toISOString(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const nextSession = {
      ...live,
      blastAlreadyCharged: liveAlready + liveDelta,
      allowEarnedBlastForCall: liveAllow,
      creatorValueCop: Math.max(0, Math.floor(Number(live.creatorValueCop) || 0)) + creatorCop,
      lastConnectedSeconds: Math.max(connectedSeconds, Math.floor(Number(live.lastConnectedSeconds) || 0)),
      status: 'active',
      exhausted: false,
      updatedAtMs: Date.now(),
    };
    tx.set(billingRef, { ...nextSession, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    setBalances(session.callerId, spent.balances);
    setBalances(session.receiverId, receiverBalances);
    return {
      session: nextSession,
      chargedDelta: liveDelta,
      duplicate: false,
      insufficient: false,
      needsEarnedAuth: false,
      callerBalances: spent.balances,
      chargedPurchased: spent.chargedPurchased,
      chargedEarned: spent.chargedEarned,
      creatorEarnedBlast: receiverBalances.earnedBlastBalance,
      charge,
    };
  });

  if (session.chatId && result.chargedDelta > 0) {
    try {
      const { getAdminDb: gdb } = require('./firestoreAdmin');
      const { FieldValue: FV } = require('firebase-admin/firestore');
      await gdb()
        .collection('chats')
        .doc(String(session.chatId))
        .update({
          'call.spentBlasts': Math.max(0, Math.floor(Number(result.session.blastAlreadyCharged) || 0)),
          'call.blastAlreadyCharged': Math.max(0, Math.floor(Number(result.session.blastAlreadyCharged) || 0)),
          'call.creatorValueCop': Math.max(0, Math.floor(Number(result.session.creatorValueCop) || 0)),
          'call.lastConnectedSeconds': Math.max(0, Math.floor(Number(result.session.lastConnectedSeconds) || 0)),
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
  if (input.allowEarnedBlastForCall === true) {
    session.allowEarnedBlastForCall = true;
    await writeSession(session);
  }
  const seconds = resolvedConnectedSeconds(session, input.connectedSeconds);
  const charged = await chargeDeltaInternal(
    session,
    seconds,
    input.allowEarnedBlastForCall === true ? true : undefined,
  );
  const pub = publicSession(charged.session, charged.callerBalances);
  return {
    ...pub,
    chargedDelta: charged.chargedDelta,
    chargedPurchased: charged.chargedPurchased || 0,
    chargedEarned: charged.chargedEarned || 0,
    duplicate: charged.duplicate,
    insufficient: charged.insufficient,
    needsEarnedAuth: Boolean(charged.needsEarnedAuth),
    shouldEnd: Boolean(charged.insufficient || charged.session.exhausted) && !charged.needsEarnedAuth,
    creatorEarnedBlast: charged.creatorEarnedBlast,
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
    const charged = await chargeDeltaInternal(session, seconds, Boolean(session.allowEarnedBlastForCall));
    session = charged.session;
  }

  session = await writeSession({
    ...session,
    status: 'stopped',
    allowEarnedBlastForCall: false,
    endedAtMs: Date.now(),
  });

  const bal = await readCallerBalances(session.callerId);
  return {
    ...publicSession(session, bal),
    stopped: true,
  };
}

async function checkBalance(uid, callType) {
  const balances = await readCallerBalances(uid);
  const rate = blastPerMinute(callType);
  const remainingSeconds = estimateRemainingSeconds(balances.coinsBalance, callType);
  return {
    balance: balances.coinsBalance,
    purchasedBlastBalance: balances.purchasedBlastBalance,
    earnedBlastBalance: balances.earnedBlastBalance,
    totalBlastBalance: balances.totalBlastBalance,
    rateBlasts: rate,
    enoughToStart: balances.coinsBalance >= rate && rate > 0,
    enoughPurchasedToStart: balances.purchasedBlastBalance >= rate && rate > 0,
    estimatedRemainingSeconds: Number.isFinite(remainingSeconds) ? remainingSeconds : null,
    estimatedMinutes: Number.isFinite(remainingSeconds) ? Math.floor(remainingSeconds / 60) : null,
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
