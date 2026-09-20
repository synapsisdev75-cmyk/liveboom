/**
 * WalletService — única fuente financiera de BLAST.
 * Otros módulos no deben mutar coinsBalance / purchased / earned directamente.
 */

const { FieldValue } = require('firebase-admin/firestore');
const engine = require('./walletEngine');
const wf = require('./walletFirestore');
const { firestoreConfigured, getAdminDb } = require('./firestoreAdmin');
const walletMemory = require('./walletMemory');

const OWNER_EMAIL = 'synapsisdev75@gmail.com';

function isOwnerEmail(email) {
  return String(email || '').trim().toLowerCase() === OWNER_EMAIL;
}

function syncMemory(uid, balances) {
  walletMemory.setBalances(uid, balances);
}

async function syncPrismaCoins(uid, coinsBalance) {
  try {
    const { prisma, hasDatabase } = require('./prisma');
    if (!hasDatabase || !prisma) return;
    await prisma.user.update({
      where: { firebaseUid: String(uid) },
      data: { coinsBalance: Math.max(0, Math.floor(Number(coinsBalance) || 0)) },
    });
  } catch (error) {
    console.warn('[wallet] prisma sync:', error.message);
  }
}

async function getSummary(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return engine.toSummary({});
  if (firestoreConfigured()) {
    try {
      const db = getAdminDb();
      const snap = await db.collection('users').doc(uid).get();
      const balances = engine.normalizeBlastBalances(snap.exists ? snap.data() : {});
      syncMemory(uid, balances);
      return engine.toSummary(balances);
    } catch (error) {
      console.warn('[wallet] getSummary firestore:', error.message);
    }
  }
  return engine.toSummary(walletMemory.getBalances(uid));
}

async function runMutation(uid, idempotencyKey, mutator, options = {}) {
  const userId = String(uid || '').trim();
  const fingerprint = options.fingerprint ? String(options.fingerprint) : '';
  if (!userId) {
    return { ok: false, code: 'NO_USER' };
  }

  if (!firestoreConfigured()) {
    if (idempotencyKey) {
      const memKey = `idemp:${idempotencyKey}`;
      if (!runMutation._mem) runMutation._mem = new Map();
      if (runMutation._mem.has(memKey)) {
        const existing = runMutation._mem.get(memKey);
        if (fingerprint && existing.fingerprint && existing.fingerprint !== fingerprint) {
          return { ok: false, code: 'IDEMPOTENCY_CONFLICT' };
        }
        return { ok: true, duplicate: true, ...existing };
      }
    }
    const current = engine.normalizeBlastBalances(walletMemory.getBalances(userId));
    const result = mutator({ current, duplicate: false });
    if (result?.ok && result.balances) {
      syncMemory(userId, result.balances);
      result.summary = engine.toSummary(result.balances);
    }
    if (result?.ok && idempotencyKey) {
      runMutation._mem = runMutation._mem || new Map();
      runMutation._mem.set(`idemp:${idempotencyKey}`, {
        summary: result.summary,
        balances: result.balances,
        extra: result.extra || null,
        fingerprint: fingerprint || null,
      });
    }
    return result;
  }

  const db = getAdminDb();
  const out = await db.runTransaction(async (tx) => {
    const claimed = await wf.claimIdempotency(tx, db, idempotencyKey);
    if (claimed.duplicate) {
      const existingFp = claimed.existing?.fingerprint || claimed.existing?.extra?.fingerprint;
      if (fingerprint && existingFp && existingFp !== fingerprint) {
        return { ok: false, code: 'IDEMPOTENCY_CONFLICT' };
      }
      return {
        ok: true,
        duplicate: true,
        summary: claimed.existing.summary || engine.toSummary({}),
        balances: claimed.existing.balances || null,
        extra: claimed.existing.extra || null,
      };
    }
    const userRef = db.collection('users').doc(userId);
    const userSnap = await tx.get(userRef);
    const current = wf.balancesFromSnap(userSnap);
    const result = mutator({ tx, db, userRef, userSnap, current, duplicate: false });
    if (!result?.ok) return result;
    wf.patchUserBalances(tx, userRef, userSnap, result.balances);
    if (result.ledger) {
      wf.writeLedgerEntries(tx, db, result.ledger);
    }
    const summary = engine.toSummary(result.balances);
    wf.storeIdempotency(tx, claimed.ref, {
      userId,
      key: idempotencyKey || null,
      fingerprint: fingerprint || null,
      summary,
      extra: result.extra || null,
    });
    return { ...result, ok: true, duplicate: false, summary };
  });

  if (out?.ok && out.balances) {
    syncMemory(userId, out.balances);
    void syncPrismaCoins(userId, out.summary.coinsBalance);
    try {
      const { emitWalletUpdated } = require('./socket');
      emitWalletUpdated(userId, out.summary);
    } catch {
      /* realtime opcional */
    }
  }
  return out;
}

async function creditPurchased({ userId, amount, idempotencyKey, referenceType, referenceId, metadata }) {
  const coins = engine.floorNonNeg(amount);
  if (!coins) return { ok: false, code: 'INVALID_AMOUNT' };
  return runMutation(userId, idempotencyKey, ({ current }) => {
    const balances = engine.applyCreditPurchased(current, coins);
    return {
      ok: true,
      balances,
      ledger: [
        {
          userId,
          transactionType: engine.TX.RECHARGE,
          bucket: engine.BUCKET.PURCHASED,
          amount: coins,
          direction: engine.DIRECTION.CREDIT,
          idempotencyKey,
          referenceType: referenceType || 'recharge',
          referenceId: referenceId || null,
          metadata: metadata || null,
        },
      ],
    };
  });
}

async function creditEarned({
  userId,
  amount,
  idempotencyKey,
  earningType,
  referenceType,
  referenceId,
  metadata,
}) {
  const coins = engine.floorNonNeg(amount);
  if (!coins) return { ok: false, code: 'INVALID_AMOUNT' };
  const transactionType = earningType && String(earningType).startsWith('EARNING_')
    ? earningType
    : engine.TX.EARNING_GIFT;
  return runMutation(userId, idempotencyKey, ({ current }) => {
    const balances = engine.applyCreditEarned(current, coins);
    return {
      ok: true,
      balances,
      ledger: [
        {
          userId,
          transactionType,
          bucket: engine.BUCKET.EARNED,
          amount: coins,
          direction: engine.DIRECTION.CREDIT,
          idempotencyKey,
          referenceType: referenceType || transactionType,
          referenceId: referenceId || null,
          metadata: metadata || null,
        },
      ],
    };
  });
}

async function spend({
  userId,
  amount,
  idempotencyKey,
  allowEarned = true,
  strict = true,
  referenceType,
  referenceId,
  metadata,
}) {
  const coins = engine.floorNonNeg(amount);
  if (!coins) return { ok: false, code: 'INVALID_AMOUNT' };
  return runMutation(userId, idempotencyKey, ({ current }) => {
    const spent = engine.applySpend(current, coins, { allowEarned, strict });
    if (!spent.ok) return spent;
    return {
      ok: true,
      balances: spent.balances,
      chargedPurchased: spent.chargedPurchased,
      chargedEarned: spent.chargedEarned,
      extra: {
        chargedPurchased: spent.chargedPurchased,
        chargedEarned: spent.chargedEarned,
      },
      ledger: engine.spendLedgerEntries({
        userId,
        amountPurchased: spent.chargedPurchased,
        amountEarned: spent.chargedEarned,
        idempotencyKey,
        referenceType: referenceType || 'spend',
        referenceId,
        metadata,
      }),
    };
  });
}

async function refund({
  userId,
  purchased = 0,
  earned = 0,
  idempotencyKey,
  referenceType,
  referenceId,
  metadata,
}) {
  const p = engine.floorNonNeg(purchased);
  const e = engine.floorNonNeg(earned);
  if (p + e <= 0) return { ok: false, code: 'INVALID_AMOUNT' };
  return runMutation(userId, idempotencyKey, ({ current }) => {
    const next = engine.applyRefund(current, { purchased: p, earned: e });
    const ledger = [];
    if (p) {
      ledger.push({
        userId,
        transactionType: engine.TX.REFUND,
        bucket: engine.BUCKET.PURCHASED,
        amount: p,
        direction: engine.DIRECTION.CREDIT,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}:purchased` : null,
        referenceType: referenceType || 'refund',
        referenceId,
        metadata,
      });
    }
    if (e) {
      ledger.push({
        userId,
        transactionType: engine.TX.REFUND,
        bucket: engine.BUCKET.EARNED,
        amount: e,
        direction: engine.DIRECTION.CREDIT,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}:earned` : null,
        referenceType: referenceType || 'refund',
        referenceId,
        metadata,
      });
    }
    return { ok: true, balances: next.balances, ledger };
  });
}

async function transferGift({
  senderUid,
  recipientUid,
  amount,
  idempotencyKey,
  earningType,
  referenceType,
  referenceId,
  metadata,
}) {
  const coins = engine.floorNonNeg(amount);
  const senderId = String(senderUid || '').trim();
  const recipientId = String(recipientUid || '').trim();
  if (!senderId || coins <= 0) return { ok: false, code: 'INVALID_AMOUNT' };
  if (recipientId && recipientId === senderId) {
    return { ok: false, code: 'SELF_GIFT' };
  }

  if (!firestoreConfigured()) {
    const spent = engine.applySpend(walletMemory.getBalances(senderId), coins, {
      allowEarned: true,
      strict: true,
    });
    if (!spent.ok) return spent;
    walletMemory.setBalances(senderId, spent.balances);
    let recipientBalances = null;
    if (recipientId) {
      recipientBalances = engine.applyCreditEarned(walletMemory.getBalances(recipientId), coins);
      walletMemory.setBalances(recipientId, recipientBalances);
    }
    return {
      ok: true,
      duplicate: false,
      senderSummary: engine.toSummary(spent.balances),
      recipientSummary: recipientBalances ? engine.toSummary(recipientBalances) : null,
      chargedPurchased: spent.chargedPurchased,
      chargedEarned: spent.chargedEarned,
    };
  }

  const db = getAdminDb();
  const out = await db.runTransaction(async (tx) => {
    const claimed = await wf.claimIdempotency(tx, db, idempotencyKey);
    if (claimed.duplicate) {
      return {
        ok: true,
        duplicate: true,
        senderSummary: claimed.existing.senderSummary || null,
        recipientSummary: claimed.existing.recipientSummary || null,
        chargedPurchased: claimed.existing.chargedPurchased || 0,
        chargedEarned: claimed.existing.chargedEarned || 0,
      };
    }
    // Firestore: todas las lecturas deben ir antes de cualquier escritura.
    const senderRef = db.collection('users').doc(senderId);
    const senderSnap = await tx.get(senderRef);
    let recipientRef = null;
    let recipientSnap = null;
    if (recipientId) {
      recipientRef = db.collection('users').doc(recipientId);
      recipientSnap = await tx.get(recipientRef);
    }

    const spent = engine.applySpend(wf.balancesFromSnap(senderSnap), coins, {
      allowEarned: true,
      strict: true,
    });
    if (!spent.ok) return spent;

    wf.patchUserBalances(tx, senderRef, senderSnap, spent.balances);
    wf.writeLedgerEntries(
      tx,
      db,
      engine.spendLedgerEntries({
        userId: senderId,
        amountPurchased: spent.chargedPurchased,
        amountEarned: spent.chargedEarned,
        idempotencyKey,
        referenceType: referenceType || 'gift',
        referenceId,
        metadata,
      }),
    );

    let recipientSummary = null;
    let recipientBalances = null;
    if (recipientRef) {
      recipientBalances = engine.applyCreditEarned(wf.balancesFromSnap(recipientSnap), coins);
      wf.patchUserBalances(tx, recipientRef, recipientSnap, recipientBalances);
      const txType =
        earningType && String(earningType).startsWith('EARNING_')
          ? earningType
          : engine.TX.EARNING_GIFT;
      wf.writeLedgerEntry(tx, db, {
        userId: recipientId,
        transactionType: txType,
        bucket: engine.BUCKET.EARNED,
        amount: coins,
        direction: engine.DIRECTION.CREDIT,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}:credit` : null,
        referenceType: referenceType || 'gift',
        referenceId,
        metadata,
      });
      recipientSummary = engine.toSummary(recipientBalances);
    }

    const senderSummary = engine.toSummary(spent.balances);
    wf.storeIdempotency(tx, claimed.ref, {
      userId: senderId,
      key: idempotencyKey || null,
      senderSummary,
      recipientSummary,
      chargedPurchased: spent.chargedPurchased,
      chargedEarned: spent.chargedEarned,
    });
    return {
      ok: true,
      duplicate: false,
      senderSummary,
      recipientSummary,
      senderBalances: spent.balances,
      recipientBalances,
      chargedPurchased: spent.chargedPurchased,
      chargedEarned: spent.chargedEarned,
    };
  });

  if (out?.ok && out.senderBalances) {
    syncMemory(senderId, out.senderBalances);
    void syncPrismaCoins(senderId, out.senderSummary.coinsBalance);
  }
  if (out?.ok && recipientId && out.recipientBalances) {
    syncMemory(recipientId, out.recipientBalances);
    void syncPrismaCoins(recipientId, out.recipientSummary.coinsBalance);
  }
  return out;
}

async function requestWithdrawal({
  userId,
  amount,
  idempotencyKey,
  payout,
  snapshot: snapshotInput,
  fingerprint,
}) {
  const coins = engine.floorNonNeg(amount);
  if (!coins) return { ok: false, code: 'INVALID_AMOUNT' };
  const uid = String(userId || '').trim();
  const withdrawalId = String(payout?.id || payout?.reference || idempotencyKey || '').trim();
  const { blastToMoneyCop, WALLET_RULES_VERSION } = require('./payoutConversion');
  const moneyAmountCOP = blastToMoneyCop(coins);
  const moneyAmountExact = String(moneyAmountCOP);

  const result = await runMutation(
    uid,
    idempotencyKey,
    ({ tx, db, current, userSnap }) => {
      const moved = engine.applyRequestWithdrawal(current, coins);
      if (!moved.ok) return moved;
      if (tx && db && withdrawalId) {
        const requestedAt = new Date().toISOString();
        const updatedAtMs = Date.now();
        const userData = userSnap && userSnap.exists ? userSnap.data() || {} : {};
        const snapshot = {
          displayName: String(snapshotInput?.displayName || userData.displayName || payout?.fullName || '').trim(),
          email: String(snapshotInput?.email || userData.email || '').trim(),
          username: String(snapshotInput?.username || userData.username || '')
            .replace(/^@/, '')
            .trim(),
        };
        const reviewFlags = [];
        if (!snapshot.displayName) reviewFlags.push('MISSING_NAME');
        if (!snapshot.email) reviewFlags.push('MISSING_EMAIL');
        const wd = {
          id: withdrawalId,
          withdrawalId,
          userId: uid,
          coins,
          earnedBlastAmount: coins,
          moneyAmountCOP,
          moneyAmountExact,
          currency: 'COP',
          status: engine.WITHDRAWAL_STATUS.REQUESTED,
          paymentReference: withdrawalId,
          disbursementReference: null,
          requestedAt,
          processedAt: null,
          paidAt: null,
          observations: '',
          fingerprint: fingerprint || null,
          snapshot,
          verification: snapshotInput?.verification || payout?.verification || null,
          reviewFlags,
          payout: payout
            ? {
                fullName: payout.fullName || null,
                documentId: payout.documentId || null,
                payoutMethod: payout.payoutMethod || null,
                accountNumber: payout.accountNumber == null ? null : String(payout.accountNumber),
                accountType: payout.accountType || null,
                verification: payout.verification || null,
              }
            : null,
          walletRulesVersion: WALLET_RULES_VERSION,
          statusRevision: 1,
          createdAtMs: updatedAtMs,
          updatedAtMs,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        tx.set(db.collection('wallet_withdrawals').doc(withdrawalId), wd, { merge: true });
        tx.set(db.collection('users').doc(uid).collection('walletWithdrawals').doc(withdrawalId), wd, {
          merge: true,
        });
        wf.enqueueWithdrawalOutbox(tx, db, {
          withdrawalId,
          status: engine.WITHDRAWAL_STATUS.REQUESTED,
          updatedAtMs,
        });
      }
      return {
        ok: true,
        balances: moved.balances,
        extra: {
          withdrawalId,
          coins,
          earnedBlastAmount: coins,
          moneyAmountCOP,
          currency: 'COP',
          fingerprint: fingerprint || null,
        },
        ledger: [
          {
            userId: uid,
            transactionType: engine.TX.WITHDRAWAL_REQUEST,
            bucket: engine.BUCKET.EARNED,
            amount: coins,
            direction: engine.DIRECTION.DEBIT,
            idempotencyKey,
            referenceType: 'withdrawal',
            referenceId: withdrawalId || null,
            metadata: {
              earnedBlastAmount: coins,
              moneyAmountCOP,
              currency: 'COP',
              status: engine.WITHDRAWAL_STATUS.REQUESTED,
            },
          },
        ],
      };
    },
    { fingerprint },
  );

  if (result?.ok) {
    walletMemory.addWithdrawal(uid, {
      id: withdrawalId,
      withdrawalId,
      reference: withdrawalId,
      coins,
      earnedBlastAmount: coins,
      moneyAmountCOP,
      moneyAmountExact,
      currency: 'COP',
      status: engine.WITHDRAWAL_STATUS.REQUESTED,
      requestedAt: new Date().toISOString(),
      paymentReference: withdrawalId,
      walletRulesVersion: WALLET_RULES_VERSION,
    });
    const { kickReportSync } = require('./withdrawalReport');
    kickReportSync();
  }
  return result;
}

async function confirmWithdrawal({
  userId,
  amount,
  withdrawalId,
  idempotencyKey,
  actorEmail,
  adminOverride,
  disbursementReference,
  observations,
}) {
  if (!adminOverride && actorEmail && !isOwnerEmail(actorEmail)) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  const uid = String(userId || '').trim();
  const coins = engine.floorNonNeg(amount);
  const result = await runMutation(
    uid,
    idempotencyKey || `WITHDRAWAL_PAID:${withdrawalId}`,
    ({ tx, db, current }) => {
      const moved = engine.applyConfirmWithdrawal(current, coins);
      if (!moved.ok) return moved;
      if (tx && db && withdrawalId) {
        const updatedAtMs = Date.now();
        const paidAt = new Date().toISOString();
        const patch = {
          status: engine.WITHDRAWAL_STATUS.PAID,
          processedAt: paidAt,
          paidAt,
          disbursementReference: disbursementReference ? String(disbursementReference).slice(0, 80) : null,
          updatedAtMs,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (observations != null) patch.observations = String(observations).slice(0, 500);
        tx.set(db.collection('wallet_withdrawals').doc(String(withdrawalId)), patch, { merge: true });
        tx.set(
          db.collection('users').doc(uid).collection('walletWithdrawals').doc(String(withdrawalId)),
          patch,
          { merge: true },
        );
        wf.enqueueWithdrawalOutbox(tx, db, {
          withdrawalId,
          status: engine.WITHDRAWAL_STATUS.PAID,
          updatedAtMs,
        });
      }
      return {
        ok: true,
        balances: moved.balances,
        ledger: [
          {
            userId: uid,
            transactionType: engine.TX.WITHDRAWAL_PAID,
            bucket: engine.BUCKET.EARNED,
            amount: coins,
            direction: engine.DIRECTION.DEBIT,
            idempotencyKey: idempotencyKey || `WITHDRAWAL_PAID:${withdrawalId}`,
            referenceType: 'withdrawal',
            referenceId: withdrawalId || null,
          },
        ],
      };
    },
  );
  const { kickReportSync } = require('./withdrawalReport');
  if (result?.ok) kickReportSync();
  return result;
}

async function rejectWithdrawal({
  userId,
  amount,
  withdrawalId,
  idempotencyKey,
  actorEmail,
  actorUid,
  adminOverride,
  finalStatus,
  observations,
}) {
  const uid = String(userId || '').trim();
  const self = actorUid && String(actorUid) === uid;
  if (!self && !adminOverride && actorEmail && !isOwnerEmail(actorEmail)) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  const coins = engine.floorNonNeg(amount);
  const status =
    engine.normalizeWithdrawalStatus(finalStatus || engine.WITHDRAWAL_STATUS.REJECTED) ===
    engine.WITHDRAWAL_STATUS.CANCELLED
      ? engine.WITHDRAWAL_STATUS.CANCELLED
      : engine.WITHDRAWAL_STATUS.REJECTED;
  const result = await runMutation(
    uid,
    idempotencyKey || `WITHDRAWAL_${status}:${withdrawalId}`,
    ({ tx, db, current }) => {
      const moved = engine.applyRejectWithdrawal(current, coins);
      if (!moved.ok) return moved;
      if (tx && db && withdrawalId) {
        const updatedAtMs = Date.now();
        const processedAt = new Date().toISOString();
        const patch = {
          status,
          processedAt,
          updatedAtMs,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (observations != null) patch.observations = String(observations).slice(0, 500);
        tx.set(db.collection('wallet_withdrawals').doc(String(withdrawalId)), patch, { merge: true });
        tx.set(
          db.collection('users').doc(uid).collection('walletWithdrawals').doc(String(withdrawalId)),
          patch,
          { merge: true },
        );
        wf.enqueueWithdrawalOutbox(tx, db, { withdrawalId, status, updatedAtMs });
      }
      return {
        ok: true,
        balances: moved.balances,
        ledger: [
          {
            userId: uid,
            transactionType: engine.TX.WITHDRAWAL_REJECTED,
            bucket: engine.BUCKET.EARNED,
            amount: coins,
            direction: engine.DIRECTION.CREDIT,
            idempotencyKey: idempotencyKey || `WITHDRAWAL_${status}:${withdrawalId}`,
            referenceType: 'withdrawal',
            referenceId: withdrawalId || null,
          },
        ],
      };
    },
  );
  if (result?.ok) {
    const { kickReportSync } = require('./withdrawalReport');
    kickReportSync();
  }
  return result;
}

function createdAtMsOf(data) {
  const n = Number(data?.createdAtMs || data?.creditedAtMs || data?.approvedAtMs || 0);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  const ts = data?.createdAt;
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts && typeof ts.toDate === 'function') return ts.toDate().getTime();
  const iso = Date.parse(String(data?.requestedAt || data?.createdAt || ''));
  return Number.isFinite(iso) ? iso : 0;
}

function publicLedgerRow(row) {
  const type = String(row.transactionType || 'ADJUSTMENT');
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: String(row.id || ''),
    transactionType: type,
    bucket: row.bucket || null,
    amount: Math.max(0, Math.floor(Number(row.amount) || 0)),
    direction: row.direction || null,
    filterGroup: String(row.filterGroup || engine.filterGroupForType(type)),
    status: String(row.status || 'completed'),
    createdAtMs: createdAtMsOf(row),
    packageId: meta.packageId || row.packageId || null,
    referenceType: row.referenceType || meta.referenceType || null,
  };
}

async function readDocs(query, label) {
  try {
    const snap = await query.get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.warn('[wallet] getTransactions', label, error.message);
    return [];
  }
}

async function getTransactions(userId, { filter, limit } = {}) {
  const uid = String(userId || '').trim();
  const take = Math.min(80, Math.max(1, Math.floor(Number(limit) || 40)));
  const group = String(filter || 'all').toLowerCase();
  const byId = new Map();
  const seen = new Set();

  function addRow(row) {
    const pub = publicLedgerRow(row);
    if (!pub.id || pub.amount <= 0) return;
    const ref = String(row.referenceId || pub.id || '').trim();
    const keys = [pub.id];
    if (ref && ref !== pub.id) keys.push(`${pub.transactionType}:${ref}`);
    if (pub.transactionType === engine.TX.RECHARGE) {
      keys.push(`recharge:${ref}`, `RECHARGE:${ref}`);
    }
    if (String(pub.transactionType).startsWith('WITHDRAWAL')) {
      keys.push(`withdrawal:${ref}`);
    }
    if (keys.some((key) => seen.has(key))) return;
    keys.forEach((key) => seen.add(key));
    const prev = byId.get(pub.id);
    if (!prev || pub.createdAtMs >= prev.createdAtMs) byId.set(pub.id, pub);
  }

  if (firestoreConfigured() && uid) {
    try {
      const db = getAdminDb();
      const userLedger = db.collection('users').doc(uid).collection('walletLedger');
      const [
        ledgerOrdered,
        rootLedger,
        ordersByUid,
        ordersByUser,
        userWithdrawals,
        rootWithdrawals,
      ] = await Promise.all([
        readDocs(userLedger.orderBy('createdAtMs', 'desc').limit(100), 'userLedger.orderBy'),
        readDocs(db.collection('wallet_ledger').where('userId', '==', uid).limit(100), 'wallet_ledger'),
        readDocs(db.collection('paymentOrders').where('uid', '==', uid).limit(100), 'paymentOrders.uid'),
        readDocs(db.collection('paymentOrders').where('userId', '==', uid).limit(100), 'paymentOrders.userId'),
        readDocs(
          db.collection('users').doc(uid).collection('walletWithdrawals').limit(50),
          'userWithdrawals',
        ),
        readDocs(
          db.collection('wallet_withdrawals').where('userId', '==', uid).limit(50),
          'wallet_withdrawals',
        ),
      ]);

      const ledgerRows = ledgerOrdered.length
        ? ledgerOrdered
        : await readDocs(userLedger.limit(100), 'userLedger');
      ledgerRows.forEach(addRow);
      rootLedger.forEach(addRow);

      const ordersById = new Map();
      for (const order of [...ordersByUid, ...ordersByUser]) {
        if (order?.id) ordersById.set(String(order.id), order);
      }
      for (const order of ordersById.values()) {
        const status = String(order.status || '').toUpperCase();
        const credited = status === 'CREDITED' || status === 'COMPLETED';
        const pending = status === 'PENDING' || status === 'APPROVED';
        if (!credited && !pending) continue;
        const amount = Math.max(
          0,
          Math.floor(Number(order.blastAmount || order.coins) || 0),
        );
        addRow({
          id: `recharge:${order.id}`,
          transactionType: engine.TX.RECHARGE,
          bucket: engine.BUCKET.PURCHASED,
          amount,
          direction: engine.DIRECTION.CREDIT,
          filterGroup: engine.FILTER_GROUP.RECHARGE,
          status: credited ? 'completed' : 'pending',
          createdAtMs: createdAtMsOf(order),
          packageId: order.packageId || null,
          referenceType: 'recharge',
          referenceId: order.id,
        });
      }

      const withdrawalsById = new Map();
      for (const wd of [...userWithdrawals, ...rootWithdrawals]) {
        if (wd?.id) withdrawalsById.set(String(wd.id), wd);
      }
      for (const wd of withdrawalsById.values()) {
        const status = engine.normalizeWithdrawalStatus(wd.status);
        const amount = Math.max(
          0,
          Math.floor(Number(wd.earnedBlastAmount || wd.coins || wd.amount) || 0),
        );
        addRow({
          id: `withdrawal:${wd.id}`,
          transactionType:
            status === engine.WITHDRAWAL_STATUS.PAID
              ? engine.TX.WITHDRAWAL_PAID
              : status === engine.WITHDRAWAL_STATUS.REJECTED
                ? engine.TX.WITHDRAWAL_REJECTED
                : engine.TX.WITHDRAWAL_REQUEST,
          bucket: engine.BUCKET.EARNED,
          amount,
          direction:
            status === engine.WITHDRAWAL_STATUS.REJECTED
              ? engine.DIRECTION.CREDIT
              : engine.DIRECTION.DEBIT,
          filterGroup: engine.FILTER_GROUP.WITHDRAWAL,
          status,
          createdAtMs: createdAtMsOf(wd),
          referenceType: 'withdrawal',
          referenceId: wd.id,
        });
      }
    } catch (error) {
      console.warn('[wallet] getTransactions:', error.message);
    }
  }

  if (!byId.size) {
    walletMemory.listWithdrawals(uid).forEach((w) => {
      addRow({
        id: w.id,
        transactionType: engine.TX.WITHDRAWAL_REQUEST,
        bucket: engine.BUCKET.EARNED,
        amount: w.coins,
        direction: engine.DIRECTION.DEBIT,
        filterGroup: engine.FILTER_GROUP.WITHDRAWAL,
        status: w.status,
        createdAtMs: Date.parse(w.createdAt) || Date.now(),
        referenceType: 'withdrawal',
        referenceId: w.id,
      });
    });
  }

  const rows = [...byId.values()].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  const filtered =
    !group || group === 'all' || group === 'todos'
      ? rows
      : rows.filter((row) => String(row.filterGroup || '') === group);
  return filtered.slice(0, take);
}

async function listWithdrawals(userId) {
  const uid = String(userId || '').trim();
  const { publicWithdrawalRecord } = require('./payoutConversion');
  if (firestoreConfigured()) {
    try {
      const db = getAdminDb();
      let snap = await db
        .collection('users')
        .doc(uid)
        .collection('walletWithdrawals')
        .limit(40)
        .get();
      if (snap.empty) {
        snap = await db.collection('wallet_withdrawals').where('userId', '==', uid).limit(40).get();
      }
      if (!snap.empty) {
        return snap.docs
          .map((d) => {
            const raw = { id: d.id, ...d.data() };
            return publicWithdrawalRecord({
              ...raw,
              status: engine.normalizeWithdrawalStatus(raw.status),
            });
          })
          .sort((a, b) => Date.parse(b.requestedAt || 0) - Date.parse(a.requestedAt || 0));
      }
    } catch (error) {
      console.warn('[wallet] listWithdrawals:', error.message);
    }
  }
  return walletMemory.listWithdrawals(uid).map((row) =>
    publicWithdrawalRecord({
      ...row,
      status: engine.normalizeWithdrawalStatus(row.status),
    }),
  );
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

async function listAllWithdrawals({ limit = 30, cursor = null } = {}) {
  const take = Math.min(50, Math.max(1, Math.floor(Number(limit) || 30)));
  const { adminWithdrawalRecord } = require('./payoutConversion');
  if (!firestoreConfigured()) return { withdrawals: [], nextCursor: null };
  try {
    const db = getAdminDb();
    let snap;
    try {
      let query = db.collection('wallet_withdrawals').orderBy('createdAtMs', 'desc').limit(take + 1);
      if (cursor) query = query.startAfter(Number(cursor));
      snap = await query.get();
    } catch {
      snap = await db.collection('wallet_withdrawals').limit(take + 1).get();
    }
    if (snap.empty) return { withdrawals: [], nextCursor: null };

    const docs = snap.docs.slice(0, take);
    const rawRows = docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        ...data,
        createdAtMs: Number(data.createdAtMs) || Date.parse(asIso(data.requestedAt) || '') || 0,
        requestedAt: asIso(data.requestedAt) || asIso(data.createdAt),
        processedAt: asIso(data.processedAt),
        paidAt: asIso(data.paidAt),
        status: engine.normalizeWithdrawalStatus(data.status),
      };
    });

    const uids = [...new Set(rawRows.map((row) => String(row.userId || '').trim()).filter(Boolean))];
    const usersById = {};
    await Promise.all(
      uids.map(async (uid) => {
        try {
          const userSnap = await db.collection('users').doc(uid).get();
          if (!userSnap.exists) return;
          const data = userSnap.data() || {};
          usersById[uid] = {
            displayName: data.displayName || null,
            username: data.username || data.handle || null,
            email: data.email || null,
          };
        } catch (error) {
          console.warn('[wallet] listAllWithdrawals user', uid, error.message);
        }
      }),
    );

    const withdrawals = rawRows.map((row) =>
      adminWithdrawalRecord({
        ...row,
        snapshot: row.snapshot || null,
        user: row.snapshot || usersById[String(row.userId || '')] || null,
        reviewFlags: row.snapshot ? row.reviewFlags || [] : ['PROFILE_NOT_FROZEN'],
      }),
    );
    const hasMore = snap.docs.length > take;
    const last = rawRows[rawRows.length - 1];
    return {
      withdrawals,
      nextCursor: hasMore && last?.createdAtMs ? String(last.createdAtMs) : null,
    };
  } catch (error) {
    console.warn('[wallet] listAllWithdrawals:', error.message);
    return { withdrawals: [], nextCursor: null };
  }
}

async function updateWithdrawalAdmin({
  withdrawalId,
  status,
  observations,
  disbursementReference,
  actorEmail,
  adminOverride,
}) {
  if (!adminOverride && actorEmail && !isOwnerEmail(actorEmail)) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  const current = await readWithdrawal(withdrawalId);
  if (!current) return { ok: false, code: 'NOT_FOUND' };
  const from = engine.normalizeWithdrawalStatus(current.status);
  const next = status ? engine.normalizeWithdrawalStatus(status) : from;
  const terminal = from === engine.WITHDRAWAL_STATUS.PAID;
  const closed =
    from === engine.WITHDRAWAL_STATUS.REJECTED || from === engine.WITHDRAWAL_STATUS.CANCELLED;

  if (next === engine.WITHDRAWAL_STATUS.PAID) {
    if (!String(disbursementReference || '').trim()) {
      return { ok: false, code: 'PAYMENT_REFERENCE_REQUIRED' };
    }
    return confirmWithdrawal({
      userId: current.userId,
      amount: current.earnedBlastAmount || current.coins,
      withdrawalId: current.id,
      actorEmail,
      adminOverride: true,
      disbursementReference,
      observations,
    });
  }
  if (next === engine.WITHDRAWAL_STATUS.REJECTED || next === engine.WITHDRAWAL_STATUS.CANCELLED) {
    if (terminal) return { ok: false, code: 'ALREADY_PAID' };
    return rejectWithdrawal({
      userId: current.userId,
      amount: current.earnedBlastAmount || current.coins,
      withdrawalId: current.id,
      actorEmail,
      adminOverride: true,
      finalStatus: next,
      observations,
    });
  }
  if (next === engine.WITHDRAWAL_STATUS.APPROVED || next === engine.WITHDRAWAL_STATUS.PROCESSING) {
    if (terminal) return { ok: false, code: 'ALREADY_PAID' };
    if (closed) return { ok: false, code: 'TERMINAL' };
  }

  if (!firestoreConfigured()) {
    return { ok: true, withdrawal: current };
  }
  const { kickReportSync } = require('./withdrawalReport');
  const db = getAdminDb();
  const updatedAtMs = Date.now();
  const patch = {
    updatedAtMs,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (status) patch.status = next;
  if (observations != null) patch.observations = String(observations).slice(0, 500);
  if (disbursementReference != null) {
    patch.disbursementReference = String(disbursementReference).slice(0, 80);
  }
  await db.runTransaction(async (tx) => {
    tx.set(db.collection('wallet_withdrawals').doc(String(withdrawalId)), patch, { merge: true });
    if (current.userId) {
      tx.set(
        db.collection('users').doc(String(current.userId)).collection('walletWithdrawals').doc(String(withdrawalId)),
        patch,
        { merge: true },
      );
    }
    wf.enqueueWithdrawalOutbox(tx, db, {
      withdrawalId,
      status: patch.status || from,
      updatedAtMs,
    });
  });
  kickReportSync();
  return { ok: true, withdrawal: { ...current, ...patch, updatedAt: undefined } };
}

async function readWithdrawal(withdrawalId) {
  const id = String(withdrawalId || '').trim();
  if (!id) return null;
  if (firestoreConfigured()) {
    const db = getAdminDb();
    const snap = await db.collection('wallet_withdrawals').doc(id).get();
    if (snap.exists) return { id: snap.id, ...snap.data() };
  }
  return null;
}

/**
 * Helpers para transacciones Firestore ya abiertas (call billing, recarga, privado).
 * No abrir otra transacción anidada.
 */
function applyInOpenTransaction(ctx) {
  return ctx;
}

module.exports = {
  getSummary,
  creditPurchased,
  creditEarned,
  spend,
  refund,
  transferGift,
  requestWithdrawal,
  confirmWithdrawal,
  rejectWithdrawal,
  getTransactions,
  listWithdrawals,
  listAllWithdrawals,
  updateWithdrawalAdmin,
  readWithdrawal,
  applyInOpenTransaction,
  isOwnerEmail,
  engine,
};
module.exports.default = module.exports;
