/**
 * Retiro del creador: conversión privada BLAST ganados → COP.
 * Única fuente de verdad de la tasa. Nunca se envía al cliente.
 */

/** 1 BLAST ganado disponible = 15 COP. No aplicar a BLAST comprados. */
const CREATOR_BLAST_COP_RATE = 15;
/** Mínimo de retiro en COP. El creador solo ve este monto, no la tasa. */
const MIN_WITHDRAW_COP = 315_000;
const MIN_WITHDRAW_COINS = Math.ceil(MIN_WITHDRAW_COP / CREATOR_BLAST_COP_RATE);
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
  'INTERNAL_CREATOR_RATE_EXACT',
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
    minWithdrawAmount: MIN_WITHDRAW_COP,
  };
}

function quoteWithdrawal(blastAmount, availableBlast) {
  const requested = earnedBlastOf(blastAmount);
  const available = earnedBlastOf(availableBlast);
  if (requested <= 0) {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }
  if (requested < MIN_WITHDRAW_COINS) {
    return {
      ok: false,
      code: 'BELOW_MINIMUM',
      minWithdrawAmount: MIN_WITHDRAW_COP,
      currency: 'COP',
    };
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

function adminPayoutSnapshot(payout) {
  if (!payout || typeof payout !== 'object') return null;
  const fullName = String(payout.fullName || '').trim() || null;
  const documentId = String(payout.documentId || '').trim() || null;
  const payoutMethod = String(payout.payoutMethod || '').trim() || null;
  const accountNumber = String(payout.accountNumber || '').trim() || null;
  const accountType = String(payout.accountType || '').trim() || null;
  if (!fullName && !documentId && !payoutMethod && !accountNumber) return null;
  return { fullName, documentId, payoutMethod, accountNumber, accountType };
}

function adminUserSnapshot(user) {
  if (!user || typeof user !== 'object') return null;
  const displayName = String(user.displayName || '').trim() || null;
  const username = String(user.username || user.handle || '')
    .replace(/^@/, '')
    .trim() || null;
  const email = String(user.email || '').trim() || null;
  if (!displayName && !username && !email) return null;
  return { displayName, username, email };
}

/** Panel Super Admin: datos para pagar, sin tasa interna. */
function adminWithdrawalRecord(row) {
  const pub = publicWithdrawalRecord(row);
  if (!pub || typeof pub !== 'object') return pub;
  return {
    ...pub,
    payout: adminPayoutSnapshot(row.payout),
    user: adminUserSnapshot(row.user),
  };
}

function hasLeakedRate(payload) {
  if (!payload || typeof payload !== 'object') return false;
  return Object.keys(payload).some((key) => RATE_LEAK_KEYS.has(key));
}

function stripLeakedRate(payload) {
  if (payload == null || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return payload.map(stripLeakedRate);
  const proto = Object.getPrototypeOf(payload);
  if (proto !== Object.prototype && proto !== null) return payload;
  const next = {};
  for (const [key, value] of Object.entries(payload)) {
    if (RATE_LEAK_KEYS.has(key)) continue;
    next[key] = stripLeakedRate(value);
  }
  return next;
}

module.exports = {
  CREATOR_BLAST_COP_RATE,
  MIN_WITHDRAW_COP,
  MIN_WITHDRAW_COINS,
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
  adminWithdrawalRecord,
  hasLeakedRate,
  stripLeakedRate,
};
module.exports.default = module.exports;
