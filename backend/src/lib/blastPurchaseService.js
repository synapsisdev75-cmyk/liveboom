/**
 * Persistencia + crédito atómico de compras BLAST (Wompi).
 */

const { FieldValue } = require('firebase-admin/firestore');
const {
  evaluateWompiSettlement,
  applyApprovedCredit,
  applyVoidCompensation,
  creditLedgerMetadata,
  catalogBlast,
  PURCHASE_STATUS,
  isCreditedStatus,
} = require('./blastPurchase');
const engine = require('./walletEngine');
const wf = require('./walletFirestore');
const money = require('./moneyDecimal');
const {
  firestoreConfigured,
  getAdminDb,
  readPaymentOrder,
  findPaymentOrderByLinkId,
} = require('./firestoreAdmin');

function notifyWallet(uid, summary) {
  try {
    const { emitWalletUpdated } = require('./socket');
    emitWalletUpdated(uid, summary);
  } catch {
    /* socket opcional */
  }
}

function purchasePatch(decision, txn, extra = {}) {
  const now = Date.now();
  return {
    purchaseId: decision.reference || extra.reference || null,
    userId: decision.orderUid || extra.uid || null,
    packageId: decision.packageId || extra.packageId || null,
    blastAmount: decision.blast || extra.blastAmount || null,
    priceCOP: extra.amountInCop || decision.paidAmount || null,
    currency: 'COP',
    wompiReference: decision.reference || txn?.reference || null,
    wompiTransactionId: decision.wompiTxnId || txn?.id || null,
    updatedAt: FieldValue.serverTimestamp(),
    updatedAtMs: now,
    ...extra,
  };
}

async function findOrder(txn) {
  const reference = String(txn?.reference || '').trim();
  const paymentLinkId = txn?.payment_link_id ? String(txn.payment_link_id) : '';
  if (reference) {
    const byRef = await readPaymentOrder(reference);
    if (byRef) return byRef;
  }
  if (paymentLinkId) {
    const byLink = await findPaymentOrderByLinkId(paymentLinkId);
    if (byLink) return byLink;
  }
  return null;
}

async function markPurchase(orderId, fields) {
  if (!firestoreConfigured() || !orderId) return;
  const db = getAdminDb();
  await db
    .collection('paymentOrders')
    .doc(String(orderId))
    .set({ ...fields, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function settleWompiTransaction(txn, { expectedUid, source } = {}) {
  if (!txn) return { ok: false, error: 'INVALID_EVENT' };

  if (!firestoreConfigured()) {
    const decision = evaluateWompiSettlement({ order: null, txn, expectedUid });
    return { ok: false, error: decision.code || 'NO_FIRESTORE', decision };
  }

  const order = await findOrder(txn);
  const decision = evaluateWompiSettlement({ order, txn, expectedUid });

  if (decision.action === 'unmatched') {
    return { ok: false, error: 'not_found', decision };
  }
  if (decision.action === 'reject') {
    if (order?.id) {
      await markPurchase(order.id, {
        status: PURCHASE_STATUS.ERROR,
        rejectCode: decision.code,
        wompiTransactionId: txn.id || null,
        source: source || 'wompi',
      });
    }
    return { ok: false, error: decision.code, decision };
  }
  if (decision.action === 'pending' || decision.action === 'ignore') {
    if (order?.id) {
      await markPurchase(order.id, { status: PURCHASE_STATUS.PENDING, source: source || 'wompi' });
    }
    return { ok: true, pending: true, decision, uid: decision.orderUid };
  }
  if (decision.action === 'mark') {
    if (order?.id) {
      await markPurchase(order.id, {
        status: decision.purchaseStatus,
        wompiTransactionId: txn.id || null,
        source: source || 'wompi',
      });
    }
    return { ok: true, marked: decision.purchaseStatus, decision, uid: decision.orderUid };
  }

  const db = getAdminDb();
  const orderRef = db.collection('paymentOrders').doc(String(order.id));
  const uid = String(order.uid || order.userId || '');
  const idempotencyKey = `RECHARGE:${order.id}`;
  const txnIdempotencyKey = txn.id ? `RECHARGE_TXN:${txn.id}` : null;

  const out = await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) return { ok: false, error: 'not_found' };
    const liveOrder = { id: orderSnap.id, ...orderSnap.data() };
    const liveDecision = evaluateWompiSettlement({ order: liveOrder, txn, expectedUid });
    const userRef = db.collection('users').doc(uid);
    const userSnap = await tx.get(userRef);

    if (liveDecision.action === 'duplicate') {
      const summary = engine.toSummary(wf.balancesFromSnap(userSnap));
      return { ok: true, duplicate: true, uid, coins: liveDecision.blast, summary };
    }

    if (liveDecision.action === 'void_compensating') {
      const voidKey = `VOID:${order.id}:${txn.id || 'x'}`;
      const claimedVoid = await wf.claimIdempotency(tx, db, voidKey);
      if (claimedVoid.duplicate) {
        return {
          ok: true,
          duplicate: true,
          voided: true,
          uid,
          summary: engine.toSummary(wf.balancesFromSnap(userSnap)),
          coins: 0,
        };
      }
      const current = wf.balancesFromSnap(userSnap);
      const voided = applyVoidCompensation(current, liveDecision.blast);
      if (voided.ok) {
        wf.patchUserBalances(tx, userRef, userSnap, voided.balances);
        wf.writeLedgerEntry(tx, db, {
          userId: uid,
          transactionType: engine.TX.ADJUSTMENT,
          bucket: engine.BUCKET.PURCHASED,
          amount: voided.chargedPurchased,
          direction: engine.DIRECTION.DEBIT,
          idempotencyKey: voidKey,
          referenceType: 'blast_purchase',
          referenceId: String(order.id),
          metadata: { reason: 'WOMPI_VOIDED', wompiTransactionId: txn.id || null },
        });
      }
      tx.set(
        orderRef,
        {
          status: PURCHASE_STATUS.VOIDED,
          voidedAt: FieldValue.serverTimestamp(),
          wompiTransactionId: txn.id || null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      wf.storeIdempotency(tx, claimedVoid.ref, { userId: uid, voided: true });
      const summary = engine.toSummary(voided.ok ? voided.balances : current);
      return { ok: true, voided: true, uid, summary, coins: 0 };
    }

    if (liveDecision.action !== 'credit') {
      return { ok: false, error: liveDecision.code, decision: liveDecision };
    }

    const claimed = await wf.claimIdempotency(tx, db, idempotencyKey);
    if (claimed.duplicate) {
      return {
        ok: true,
        duplicate: true,
        uid,
        coins: claimed.existing.coins || catalogBlast(liveOrder) || 0,
        summary: claimed.existing.summary || engine.toSummary(wf.balancesFromSnap(userSnap)),
      };
    }
    if (txnIdempotencyKey) {
      const claimedTxn = await wf.claimIdempotency(tx, db, txnIdempotencyKey);
      if (claimedTxn.duplicate) {
        return {
          ok: true,
          duplicate: true,
          uid,
          coins: claimedTxn.existing.coins || 0,
          summary: claimedTxn.existing.summary || engine.toSummary(wf.balancesFromSnap(userSnap)),
        };
      }
    }

    const current = wf.balancesFromSnap(userSnap);
    const blast = liveDecision.blast;
    const next = applyApprovedCredit(current, blast);
    wf.patchUserBalances(tx, userRef, userSnap, next);
    const meta = creditLedgerMetadata(liveDecision, txn);
    meta.moneyAmountExact = money.toExactString(money.fromWompiCents(liveDecision.paidAmount));
    wf.writeLedgerEntry(tx, db, {
      userId: uid,
      transactionType: engine.TX.RECHARGE,
      bucket: engine.BUCKET.PURCHASED,
      amount: blast,
      direction: engine.DIRECTION.CREDIT,
      idempotencyKey,
      referenceType: 'blast_purchase',
      referenceId: String(order.id),
      metadata: meta,
    });
    const nowMs = Date.now();
    tx.set(
      orderRef,
      {
        ...purchasePatch(liveDecision, txn, {
          uid,
          packageId: liveOrder.packageId,
          amountInCop: liveOrder.amountInCop,
        }),
        status: PURCHASE_STATUS.CREDITED,
        approvedAt: FieldValue.serverTimestamp(),
        creditedAt: FieldValue.serverTimestamp(),
        approvedAtMs: nowMs,
        creditedAtMs: nowMs,
        source: source || 'wompi',
      },
      { merge: true },
    );
    const summary = engine.toSummary(next);
    wf.storeIdempotency(tx, claimed.ref, { userId: uid, summary, coins: blast, extra: meta });
    if (txnIdempotencyKey) {
      const txnRef = db
        .collection('wallet_idempotency')
        .doc(wf.idempotencyDocId(txnIdempotencyKey));
      wf.storeIdempotency(tx, txnRef, { userId: uid, summary, coins: blast });
    }
    return {
      ok: true,
      duplicate: false,
      uid,
      coins: blast,
      coinsBalance: summary.coinsBalance,
      purchasedBlastBalance: summary.purchasedBalance,
      earnedBlastBalance: summary.earnedAvailable,
      earnedBlastReserved: summary.earnedReserved,
      withdrawableBalance: summary.withdrawableBalance,
      purchasedBalance: summary.purchasedBalance,
      earnedAvailable: summary.earnedAvailable,
      totalAvailable: summary.totalAvailable,
      summary,
    };
  });

  if (out?.ok && out.uid && out.summary) {
    notifyWallet(out.uid, out.summary);
    try {
      const { setBalances } = require('./walletMemory');
      setBalances(out.uid, {
        purchasedBlastBalance: out.summary.purchasedBalance,
        earnedBlastBalance: out.summary.earnedAvailable,
        earnedBlastReserved: out.summary.earnedReserved,
        coinsBalance: out.summary.coinsBalance,
      });
    } catch {
      /* memoria opcional */
    }
  }
  return out;
}

async function reconcileTransactionId(transactionId, expectedUid) {
  const { getWompiTransaction } = require('./wompi');
  const txn = await getWompiTransaction(transactionId);
  if (!txn) return { ok: false, error: 'wompi_not_found' };
  return settleWompiTransaction(txn, { expectedUid, source: 'reconcile' });
}

async function reconcileStalePending(limit = 20) {
  if (!firestoreConfigured()) return { scanned: 0, credited: 0 };
  const db = getAdminDb();
  const take = Math.min(40, Math.max(1, limit));
  const pending = await db.collection('paymentOrders').where('status', '==', 'pending').limit(take).get();
  const pendingUpper = await db.collection('paymentOrders').where('status', '==', 'PENDING').limit(take).get();
  const seen = new Set();
  const docs = [];
  for (const doc of [...pending.docs, ...pendingUpper.docs]) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    docs.push(doc);
  }
  let credited = 0;
  const { getWompiTransaction } = require('./wompi');
  for (const doc of docs) {
    const data = doc.data() || {};
    const txnId = String(data.wompiTransactionId || data.wompiTxnId || '').trim();
    if (!txnId) continue;
    try {
      const txn = await getWompiTransaction(txnId);
      if (!txn) continue;
      const result = await settleWompiTransaction(txn, { source: 'stale_reconcile' });
      if (result?.ok && !result.duplicate && result.coins) credited += 1;
    } catch (error) {
      console.warn('[blastPurchase] reconcile', doc.id, error.message);
    }
  }
  return { scanned: docs.length, credited };
}

module.exports = {
  settleWompiTransaction,
  reconcileTransactionId,
  reconcileStalePending,
  notifyWallet,
  PURCHASE_STATUS,
  isCreditedStatus,
};
module.exports.default = module.exports;
