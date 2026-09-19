/**
 * Compra de BLAST vía Wompi: una sola vía de acreditación.
 * Wompi confirma el dinero; el catálogo backend decide cuántos BLAST.
 * Nunca acredita earned. Nunca confía en el frontend.
 */

const { resolveCoinPackage } = require('./coinPackages');
const engine = require('./walletEngine');

const PURCHASE_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  CREDITED: 'CREDITED',
  DECLINED: 'DECLINED',
  ERROR: 'ERROR',
  VOIDED: 'VOIDED',
};

function normStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function isCreditedStatus(status) {
  const s = normStatus(status);
  return s === 'COMPLETED' || s === 'CREDITED';
}

function isPendingStatus(status) {
  const s = normStatus(status);
  return !s || s === 'PENDING' || s === 'pending';
}

function catalogBlast(order) {
  const packageId = String(order?.packageId || '').trim();
  if (packageId) {
    const resolved = resolveCoinPackage(packageId);
    if (!resolved.error) return resolved.pack.coins;
  }
  const frozen = Math.max(0, Math.floor(Number(order?.blastAmount || order?.coins) || 0));
  return frozen || null;
}

function amountsMatch(orderAmount, paidAmount) {
  const expected = Math.max(0, Math.floor(Number(orderAmount) || 0));
  const paid = Math.max(0, Math.floor(Number(paidAmount) || 0));
  if (!expected || !paid) return false;
  if (expected === paid) return true;
  if (expected * 100 === paid) return true;
  if (paid * 100 === expected) return true;
  return false;
}

/**
 * Decisión pura (testeable) antes de tocar saldos.
 * @param {{ order: object|null, txn: object, expectedUid?: string|null }}
 */
function evaluateWompiSettlement({ order, txn, expectedUid }) {
  if (!txn || typeof txn !== 'object') {
    return { action: 'reject', code: 'INVALID_EVENT' };
  }
  const status = normStatus(txn.status);
  const reference = String(txn.reference || '').trim();
  const currency = String(txn.currency || 'COP').trim().toUpperCase();
  const paidAmount = Math.max(0, Math.floor(Number(txn.amount_in_cents) || 0));
  const wompiTxnId = String(txn.id || '').trim();

  if (!order) {
    return { action: 'unmatched', code: 'NOT_FOUND', status, reference, wompiTxnId };
  }

  const orderRef = String(order.wompiReference || order.reference || order.id || '').trim();
  const orderUid = String(order.userId || order.uid || '');
  if (expectedUid && orderUid && String(expectedUid) !== orderUid) {
    return { action: 'reject', code: 'FORBIDDEN' };
  }
  if (reference && orderRef && reference !== orderRef) {
    return { action: 'reject', code: 'REFERENCE_MISMATCH', expected: orderRef, received: reference };
  }

  if (isCreditedStatus(order.status) && status === 'APPROVED') {
    return {
      action: 'duplicate',
      code: 'ALREADY_CREDITED',
      blast: catalogBlast(order),
      orderUid,
    };
  }

  if (status === 'PENDING') {
    return { action: 'pending', code: 'PENDING', orderUid };
  }
  if (status === 'DECLINED') {
    return { action: 'mark', code: 'DECLINED', purchaseStatus: PURCHASE_STATUS.DECLINED, orderUid };
  }
  if (status === 'ERROR') {
    return { action: 'mark', code: 'ERROR', purchaseStatus: PURCHASE_STATUS.ERROR, orderUid };
  }
  if (status === 'VOIDED') {
    if (isCreditedStatus(order.status)) {
      return {
        action: 'void_compensating',
        code: 'VOIDED_AFTER_CREDIT',
        blast: catalogBlast(order),
        orderUid,
      };
    }
    return { action: 'mark', code: 'VOIDED', purchaseStatus: PURCHASE_STATUS.VOIDED, orderUid };
  }
  if (status !== 'APPROVED') {
    return { action: 'ignore', code: 'NOT_APPROVED', status };
  }

  if (currency && currency !== 'COP') {
    return { action: 'reject', code: 'CURRENCY_MISMATCH', currency };
  }
  const expectedAmount = Math.max(0, Math.floor(Number(order.amountInCop || order.priceCOP || 0)));
  if (!amountsMatch(expectedAmount, paidAmount)) {
    return {
      action: 'reject',
      code: 'AMOUNT_MISMATCH',
      expected: expectedAmount,
      received: paidAmount,
    };
  }

  const blast = catalogBlast(order);
  if (!blast) {
    return { action: 'reject', code: 'PACKAGE_TAMPERED' };
  }

  return {
    action: 'credit',
    code: 'APPROVED',
    blast,
    orderUid,
    packageId: String(order.packageId || ''),
    paidAmount,
    currency: 'COP',
    wompiTxnId,
    reference: orderRef || reference,
  };
}

function creditLedgerMetadata(decision, txn) {
  return {
    purchaseId: decision.reference,
    packageId: decision.packageId || null,
    blastAmount: decision.blast,
    moneyAmount: decision.paidAmount,
    currency: 'COP',
    wompiReference: decision.reference,
    wompiTransactionId: decision.wompiTxnId || txn?.id || null,
    status: PURCHASE_STATUS.CREDITED,
  };
}

function applyApprovedCredit(balances, blast) {
  return engine.applyCreditPurchased(balances, blast);
}

function applyVoidCompensation(balances, blast) {
  const cur = engine.normalizeBlastBalances(balances);
  const need = engine.floorNonNeg(blast);
  const take = Math.min(cur.purchasedBlastBalance, need);
  if (take <= 0) {
    return { ok: false, code: 'NOTHING_TO_VOID', balances: cur, chargedPurchased: 0 };
  }
  const next = engine.normalizeBlastBalances({
    ...cur,
    purchasedBlastBalance: cur.purchasedBlastBalance - take,
  });
  return { ok: true, balances: next, chargedPurchased: take, shortfall: need - take };
}

module.exports = {
  PURCHASE_STATUS,
  evaluateWompiSettlement,
  catalogBlast,
  amountsMatch,
  creditLedgerMetadata,
  applyApprovedCredit,
  applyVoidCompensation,
  isCreditedStatus,
  isPendingStatus,
};
module.exports.default = module.exports;
