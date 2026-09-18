/**
 * Conversión privada BLAST ganados → COP.
 * La tasa NUNCA se envía al cliente. Solo montos finales en string 4 decimales.
 */

const { MIN_WITHDRAW_COINS, COIN_TO_COP } = require('./coinPackages');
const money = require('./moneyDecimal');

/** Tasa interna (pesos COP por 1 BLAST ganado). No exportar en APIs públicas. */
const INTERNAL_CREATOR_RATE_EXACT = `${Number(COIN_TO_COP) || 15}.0000`;

function blastToMoneyUnits(blastAmount) {
  const blast = Math.max(0, Math.floor(Number(blastAmount) || 0));
  return money.multiplyIntegerByRate(blast, INTERNAL_CREATOR_RATE_EXACT);
}

function blastToMoneyExact(blastAmount) {
  return money.toExactString(blastToMoneyUnits(blastAmount));
}

function publicPayoutFields(withdrawableBlast) {
  const blast = Math.max(0, Math.floor(Number(withdrawableBlast) || 0));
  return {
    withdrawableAmount: blastToMoneyExact(blast),
    currency: 'COP',
    minWithdrawBlast: MIN_WITHDRAW_COINS,
    minWithdrawAmount: blastToMoneyExact(MIN_WITHDRAW_COINS),
  };
}

function quoteWithdrawal(blastAmount, availableBlast) {
  const requested = Math.max(0, Math.floor(Number(blastAmount) || 0));
  const available = Math.max(0, Math.floor(Number(availableBlast) || 0));
  if (requested <= 0) {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }
  if (requested > available) {
    return {
      ok: false,
      code: 'PURCHASED_NOT_WITHDRAWABLE',
      availableBlast: available,
      withdrawableAmount: blastToMoneyExact(available),
      currency: 'COP',
    };
  }
  return {
    ok: true,
    earnedBlastAmount: requested,
    moneyAmountExact: blastToMoneyExact(requested),
    currency: 'COP',
  };
}

function publicWalletSummary(summary) {
  const withdrawableBalance = Math.max(0, Math.floor(Number(summary?.withdrawableBalance) || 0));
  const payout = publicPayoutFields(withdrawableBalance);
  return {
    purchasedBalance: summary.purchasedBalance,
    earnedAvailable: summary.earnedAvailable,
    earnedReserved: summary.earnedReserved,
    earnedTotal: summary.earnedTotal,
    totalAvailable: summary.totalAvailable,
    withdrawableBalance,
    coinsBalance: summary.coinsBalance,
    purchasedBlastBalance: summary.purchasedBlastBalance ?? summary.purchasedBalance,
    earnedBlastBalance: summary.earnedBlastBalance ?? summary.earnedAvailable,
    earnedBlastReserved: summary.earnedBlastReserved ?? summary.earnedReserved,
    ...payout,
  };
}

function publicWithdrawalRecord(row) {
  if (!row || typeof row !== 'object') return row;
  const earnedBlastAmount = Math.max(
    0,
    Math.floor(Number(row.earnedBlastAmount ?? row.coins) || 0),
  );
  const moneyAmountExact =
    row.moneyAmountExact != null
      ? String(row.moneyAmountExact)
      : blastToMoneyExact(earnedBlastAmount);
  return {
    withdrawalId: row.withdrawalId || row.id || row.reference || null,
    userId: row.userId || null,
    earnedBlastAmount,
    moneyAmountExact,
    currency: row.currency || 'COP',
    status: row.status || 'REQUESTED',
    requestedAt: row.requestedAt || row.createdAt || null,
    processedAt: row.processedAt || null,
    paymentReference: row.paymentReference || row.reference || row.id || null,
  };
}

function hasLeakedRate(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const keys = Object.keys(payload);
  return keys.some((key) =>
    /^(blastRate|creatorRate|internalRate|platformMargin|conversionFactor|coinToCop|COIN_TO_COP)$/i.test(
      key,
    ),
  );
}

module.exports = {
  INTERNAL_CREATOR_RATE_EXACT,
  blastToMoneyUnits,
  blastToMoneyExact,
  publicPayoutFields,
  quoteWithdrawal,
  publicWalletSummary,
  publicWithdrawalRecord,
  hasLeakedRate,
};
module.exports.default = module.exports;
