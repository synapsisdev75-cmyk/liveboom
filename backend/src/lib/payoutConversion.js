/**
 * Retiro del creador: conversión privada BLAST ganados → COP.
 * Única fuente de verdad de la tasa. Nunca se envía al cliente.
 */

const { MIN_WITHDRAW_COINS } = require('./coinPackages');

/** 1 BLAST ganado disponible = 15 COP. No aplicar a BLAST comprados. */
const CREATOR_BLAST_COP_RATE = 15;
const WALLET_RULES_VERSION = 'creator-blast-15-cop-v1';

const RATE_LEAK_KEYS = new Set([
  'blastRate',
  'creatorRate',
  'internalRate',
  'platformMargin',
  'conversionFactor',
  'coinToCop',
  'COIN_TO_COP',
  'CREATOR_BLAST_COP_RATE',
  'creatorBlastCopRate',
]);

function earnedBlastOf(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function blastToMoneyCop(blastAmount) {
  return earnedBlastOf(blastAmount) * CREATOR_BLAST_COP_RATE;
}

/** Compat: string entero de pesos, sin decimales. */
function blastToMoneyExact(blastAmount) {
  return String(blastToMoneyCop(blastAmount));
}

function moneyAmountCopOf(row) {
  if (row && row.moneyAmountCOP != null && Number.isFinite(Number(row.moneyAmountCOP))) {
    return Math.max(0, Math.floor(Number(row.moneyAmountCOP)));
  }
  const exact = String(row?.moneyAmountExact || '').trim();
  if (exact) {
    const whole = exact.split('.')[0];
    const n = Math.floor(Number(whole) || 0);
    if (n > 0 || exact === '0' || exact.startsWith('0.')) return Math.max(0, n);
  }
  return blastToMoneyCop(row?.earnedBlastAmount ?? row?.coins);
}

function publicPayoutFields(withdrawableBlast) {
  const blast = earnedBlastOf(withdrawableBlast);
  return {
    earnedBlastAvailable: blast,
    withdrawableAmount: blastToMoneyCop(blast),
    currency: 'COP',
    minWithdrawBlast: MIN_WITHDRAW_COINS,
    minWithdrawAmount: blastToMoneyCop(MIN_WITHDRAW_COINS),
  };
}

function quoteWithdrawal(blastAmount, availableBlast) {
  const requested = earnedBlastOf(blastAmount);
  const available = earnedBlastOf(availableBlast);
  if (requested <= 0) {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }
  if (requested > available) {
    return {
      ok: false,
      code: 'PURCHASED_NOT_WITHDRAWABLE',
      availableBlast: available,
      earnedBlastAvailable: available,
      withdrawableAmount: blastToMoneyCop(available),
      currency: 'COP',
    };
  }
  const moneyAmountCOP = blastToMoneyCop(requested);
  return {
    ok: true,
    earnedBlastAmount: requested,
    moneyAmountCOP,
    moneyAmountExact: String(moneyAmountCOP),
    withdrawableAmount: moneyAmountCOP,
    currency: 'COP',
  };
}

function publicWalletSummary(summary) {
  const earnedAvailable = earnedBlastOf(summary?.earnedAvailable);
  const withdrawableBalance = earnedBlastOf(
    summary?.withdrawableBalance != null ? summary.withdrawableBalance : earnedAvailable,
  );
  const payout = publicPayoutFields(earnedAvailable);
  return {
    purchasedBalance: summary.purchasedBalance,
    earnedAvailable,
    earnedBlastAvailable: earnedAvailable,
    earnedReserved: summary.earnedReserved,
    earnedTotal: summary.earnedTotal,
    totalAvailable: summary.totalAvailable,
    withdrawableBalance,
    coinsBalance: summary.coinsBalance,
    purchasedBlastBalance: summary.purchasedBlastBalance ?? summary.purchasedBalance,
    earnedBlastBalance: summary.earnedBlastBalance ?? earnedAvailable,
    earnedBlastReserved: summary.earnedBlastReserved ?? summary.earnedReserved,
    ...payout,
  };
}

function publicWithdrawalRecord(row) {
  if (!row || typeof row !== 'object') return row;
  const earnedBlastAmount = earnedBlastOf(row.earnedBlastAmount ?? row.coins);
  const moneyAmountCOP = moneyAmountCopOf({ ...row, earnedBlastAmount });
  return {
    withdrawalId: row.withdrawalId || row.id || row.reference || null,
    userId: row.userId || null,
    earnedBlastAmount,
    moneyAmountCOP,
    moneyAmountExact: String(moneyAmountCOP),
    currency: row.currency || 'COP',
    status: row.status || 'REQUESTED',
    requestedAt: row.requestedAt || row.createdAt || null,
    processedAt: row.processedAt || null,
    paymentReference: row.paymentReference || row.reference || row.id || null,
    walletRulesVersion: row.walletRulesVersion || WALLET_RULES_VERSION,
  };
}

function hasLeakedRate(payload) {
  if (!payload || typeof payload !== 'object') return false;
  return Object.keys(payload).some((key) => RATE_LEAK_KEYS.has(key));
}

function stripLeakedRate(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const next = { ...payload };
  for (const key of Object.keys(next)) {
    if (RATE_LEAK_KEYS.has(key)) delete next[key];
  }
  return next;
}

module.exports = {
  CREATOR_BLAST_COP_RATE,
  WALLET_RULES_VERSION,
  INTERNAL_CREATOR_RATE_EXACT: String(CREATOR_BLAST_COP_RATE),
  blastToMoneyCop,
  blastToMoneyUnits: blastToMoneyCop,
  blastToMoneyExact,
  moneyAmountCopOf,
  publicPayoutFields,
  quoteWithdrawal,
  publicWalletSummary,
  publicWithdrawalRecord,
  hasLeakedRate,
  stripLeakedRate,
};
module.exports.default = module.exports;
