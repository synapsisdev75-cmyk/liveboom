/**
 * LiveBoom Wallet engine (pure).
 * BLAST comprados != BLAST ganados. Solo ganados son retirables.
 * No toca I/O: las transacciones atómicas viven en walletService.
 */

function floorNonNeg(n) {
  return Math.max(0, Math.floor(Number(n) || 0));
}

const TX = {
  RECHARGE: 'RECHARGE',
  EARNING_GIFT: 'EARNING_GIFT',
  EARNING_CALL: 'EARNING_CALL',
  EARNING_VIDEO_CALL: 'EARNING_VIDEO_CALL',
  EARNING_LIVE: 'EARNING_LIVE',
  EARNING_PRIVATE: 'EARNING_PRIVATE',
  EARNING_SUBSCRIPTION: 'EARNING_SUBSCRIPTION',
  SPEND: 'SPEND',
  WITHDRAWAL_REQUEST: 'WITHDRAWAL_REQUEST',
  WITHDRAWAL_PAID: 'WITHDRAWAL_PAID',
  WITHDRAWAL_REJECTED: 'WITHDRAWAL_REJECTED',
  REFUND: 'REFUND',
  ADJUSTMENT: 'ADJUSTMENT',
};

const BUCKET = {
  PURCHASED: 'PURCHASED',
  EARNED: 'EARNED',
};

const DIRECTION = {
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT',
};

const FILTER_GROUP = {
  RECHARGE: 'recharge',
  EARNING: 'earning',
  SPEND: 'spend',
  WITHDRAWAL: 'withdrawal',
  REFUND: 'refund',
  ADJUSTMENT: 'adjustment',
};

const WITHDRAWAL_STATUS = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  PROCESSING: 'PROCESSING',
  PAID: 'PAID',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
};

function normalizeWithdrawalStatus(status) {
  const s = String(status || '').trim().toUpperCase();
  if (s === 'PENDING' || s === 'REQUESTED') return WITHDRAWAL_STATUS.REQUESTED;
  if (s === 'APPROVED' || s === 'APROBADO') return WITHDRAWAL_STATUS.APPROVED;
  if (s === 'PROCESSING' || s === 'IN_PROCESS' || s === 'EN PROCESO') {
    return WITHDRAWAL_STATUS.PROCESSING;
  }
  if (s === 'PAID' || s === 'COMPLETED' || s === 'COMPLETE') return WITHDRAWAL_STATUS.PAID;
  if (s === 'REJECTED') return WITHDRAWAL_STATUS.REJECTED;
  if (s === 'CANCELLED' || s === 'CANCELED' || s === 'ANULADO') {
    return WITHDRAWAL_STATUS.CANCELLED;
  }
  return WITHDRAWAL_STATUS.REQUESTED;
}

function filterGroupForType(type) {
  const t = String(type || '');
  if (t === TX.RECHARGE) return FILTER_GROUP.RECHARGE;
  if (t.startsWith('EARNING_')) return FILTER_GROUP.EARNING;
  if (t === TX.SPEND) return FILTER_GROUP.SPEND;
  if (t.startsWith('WITHDRAWAL_')) return FILTER_GROUP.WITHDRAWAL;
  if (t === TX.REFUND) return FILTER_GROUP.REFUND;
  return FILTER_GROUP.ADJUSTMENT;
}

/**
 * Legado: solo coinsBalance → comprados (origen desconocido; no se inventa "ganado").
 * earnedBlastBalance = disponible (no incluye reserved).
 */
function normalizeBlastBalances(data) {
  const raw = data && typeof data === 'object' ? data : {};
  const hasPurchased = raw.purchasedBlastBalance != null && raw.purchasedBlastBalance !== '';
  const hasEarned = raw.earnedBlastBalance != null && raw.earnedBlastBalance !== '';
  const coins = floorNonNeg(raw.coinsBalance);
  let purchased = floorNonNeg(raw.purchasedBlastBalance);
  let earned = floorNonNeg(raw.earnedBlastBalance);
  const earnedSpent = floorNonNeg(raw.earnedBlastSpent);
  const earnedWithdrawn = floorNonNeg(raw.earnedBlastWithdrawn);
  const earnedReserved = floorNonNeg(raw.earnedBlastReserved);

  if (!hasPurchased && !hasEarned) {
    purchased = coins;
    earned = 0;
  } else if (!hasPurchased && hasEarned) {
    purchased = Math.max(0, coins - earned);
  } else if (hasPurchased && !hasEarned) {
    earned = Math.max(0, coins - purchased);
  }

  const spendable = purchased + earned;
  return {
    purchasedBlastBalance: purchased,
    earnedBlastBalance: earned,
    earnedBlastReserved: earnedReserved,
    coinsBalance: spendable,
    earnedBlastSpent: earnedSpent,
    earnedBlastWithdrawn: earnedWithdrawn,
    availableEarnedBlast: earned,
    totalBlastBalance: spendable,
    withdrawableBalance: earned,
  };
}

function toSummary(balances) {
  const b = normalizeBlastBalances(balances);
  const purchasedBalance = b.purchasedBlastBalance;
  const earnedAvailable = b.earnedBlastBalance;
  const earnedReserved = b.earnedBlastReserved;
  return {
    purchasedBalance,
    earnedAvailable,
    earnedReserved,
    earnedTotal: earnedAvailable + earnedReserved,
    totalAvailable: purchasedBalance + earnedAvailable,
    withdrawableBalance: earnedAvailable,
    coinsBalance: purchasedBalance + earnedAvailable,
    purchasedBlastBalance: purchasedBalance,
    earnedBlastBalance: earnedAvailable,
    earnedBlastReserved: earnedReserved,
    earnedBlastSpent: b.earnedBlastSpent,
    earnedBlastWithdrawn: b.earnedBlastWithdrawn,
  };
}

function firestoreBalancePatch(balances) {
  const b = normalizeBlastBalances(balances);
  return {
    purchasedBlastBalance: b.purchasedBlastBalance,
    earnedBlastBalance: b.earnedBlastBalance,
    earnedBlastReserved: b.earnedBlastReserved,
    coinsBalance: b.coinsBalance,
    earnedBlastSpent: b.earnedBlastSpent,
    earnedBlastWithdrawn: b.earnedBlastWithdrawn,
  };
}

function fail(code, balances, extra) {
  return {
    ok: false,
    code,
    balances: normalizeBlastBalances(balances),
    chargedPurchased: 0,
    chargedEarned: 0,
    remainingCharge: 0,
    ...extra,
  };
}

/**
 * Consume: 1) purchased  2) earnedAvailable. Nunca reserved. Nunca negativo.
 * @param {object} balances
 * @param {number} amount
 * @param {boolean|{allowEarned?: boolean, partial?: boolean, strict?: boolean}} [allowEarnedOrOpts]
 */
function applySpend(balances, amount, allowEarnedOrOpts) {
  const opts =
    allowEarnedOrOpts && typeof allowEarnedOrOpts === 'object'
      ? allowEarnedOrOpts
      : { allowEarned: Boolean(allowEarnedOrOpts), partial: true };
  const allowEarned = opts.allowEarned !== false;
  const strict = Boolean(opts.strict) || opts.partial === false;
  const need = floorNonNeg(amount);
  const cur = normalizeBlastBalances(balances);
  const purchased = cur.purchasedBlastBalance;
  const earned = cur.earnedBlastBalance;

  if (need <= 0) {
    return {
      ok: true,
      balances: cur,
      chargedPurchased: 0,
      chargedEarned: 0,
      remainingCharge: 0,
      partial: false,
      needsEarnedAuth: false,
    };
  }

  const usePurchased = Math.min(purchased, need);
  let remaining = need - usePurchased;
  let useEarned = 0;

  if (remaining > 0) {
    if (!allowEarned) {
      if (usePurchased > 0 && !strict) {
        const next = normalizeBlastBalances({
          ...cur,
          purchasedBlastBalance: purchased - usePurchased,
          earnedBlastBalance: earned,
        });
        return {
          ok: true,
          balances: next,
          chargedPurchased: usePurchased,
          chargedEarned: 0,
          remainingCharge: remaining,
          partial: true,
          needsEarnedAuth: earned > 0,
          exhausted: earned <= 0,
        };
      }
      if (earned > 0) {
        return fail('NEEDS_EARNED_AUTH', cur, { remainingCharge: remaining });
      }
      return fail('INSUFFICIENT', cur, { remainingCharge: remaining });
    }
    useEarned = Math.min(earned, remaining);
    remaining -= useEarned;
  }

  if (strict && remaining > 0) {
    return fail('INSUFFICIENT', cur, { remainingCharge: remaining });
  }

  if (usePurchased + useEarned <= 0) {
    return fail('INSUFFICIENT', cur, { remainingCharge: need });
  }

  const next = normalizeBlastBalances({
    ...cur,
    purchasedBlastBalance: purchased - usePurchased,
    earnedBlastBalance: earned - useEarned,
    earnedBlastSpent: cur.earnedBlastSpent + useEarned,
    earnedBlastReserved: cur.earnedBlastReserved,
    earnedBlastWithdrawn: cur.earnedBlastWithdrawn,
  });

  return {
    ok: true,
    balances: next,
    chargedPurchased: usePurchased,
    chargedEarned: useEarned,
    remainingCharge: remaining,
    partial: remaining > 0,
    needsEarnedAuth: false,
    exhausted: remaining > 0,
  };
}

function applyCreditPurchased(balances, amount) {
  const add = floorNonNeg(amount);
  const cur = normalizeBlastBalances(balances);
  return normalizeBlastBalances({
    ...cur,
    purchasedBlastBalance: cur.purchasedBlastBalance + add,
  });
}

function applyCreditEarned(balances, amount) {
  const add = floorNonNeg(amount);
  const cur = normalizeBlastBalances(balances);
  return normalizeBlastBalances({
    ...cur,
    earnedBlastBalance: cur.earnedBlastBalance + add,
  });
}

function applyRequestWithdrawal(balances, amount) {
  const coins = floorNonNeg(amount);
  const cur = normalizeBlastBalances(balances);
  if (coins <= 0) return fail('INVALID_AMOUNT', cur);
  if (coins > cur.earnedBlastBalance) {
    return fail('PURCHASED_NOT_WITHDRAWABLE', cur, {
      withdrawableBalance: cur.earnedBlastBalance,
      requested: coins,
    });
  }
  const next = normalizeBlastBalances({
    ...cur,
    earnedBlastBalance: cur.earnedBlastBalance - coins,
    earnedBlastReserved: cur.earnedBlastReserved + coins,
  });
  return { ok: true, balances: next, amount: coins };
}

function applyConfirmWithdrawal(balances, amount) {
  const coins = floorNonNeg(amount);
  const cur = normalizeBlastBalances(balances);
  if (coins <= 0) return fail('INVALID_AMOUNT', cur);
  if (coins > cur.earnedBlastReserved) {
    return fail('INSUFFICIENT_RESERVED', cur, { requested: coins });
  }
  const next = normalizeBlastBalances({
    ...cur,
    earnedBlastReserved: cur.earnedBlastReserved - coins,
    earnedBlastWithdrawn: cur.earnedBlastWithdrawn + coins,
  });
  return { ok: true, balances: next, amount: coins };
}

function applyRejectWithdrawal(balances, amount) {
  const coins = floorNonNeg(amount);
  const cur = normalizeBlastBalances(balances);
  if (coins <= 0) return fail('INVALID_AMOUNT', cur);
  if (coins > cur.earnedBlastReserved) {
    return fail('INSUFFICIENT_RESERVED', cur, { requested: coins });
  }
  const next = normalizeBlastBalances({
    ...cur,
    earnedBlastBalance: cur.earnedBlastBalance + coins,
    earnedBlastReserved: cur.earnedBlastReserved - coins,
  });
  return { ok: true, balances: next, amount: coins };
}

function applyRefund(balances, split) {
  const purchased = floorNonNeg(split?.purchased);
  const earned = floorNonNeg(split?.earned);
  let next = normalizeBlastBalances(balances);
  if (purchased) next = applyCreditPurchased(next, purchased);
  if (earned) next = applyCreditEarned(next, earned);
  return { ok: true, balances: next, refundedPurchased: purchased, refundedEarned: earned };
}

/**
 * Débito administrativo de un solo bucket. Nunca cruza comprados/ganados ni toca reserved.
 */
function applyDebitPurchased(balances, amount) {
  const take = floorNonNeg(amount);
  const cur = normalizeBlastBalances(balances);
  if (take <= 0) return fail('INVALID_AMOUNT', cur);
  if (take > cur.purchasedBlastBalance) {
    return fail('INSUFFICIENT_PURCHASED', cur, { requested: take });
  }
  return {
    ok: true,
    balances: normalizeBlastBalances({
      ...cur,
      purchasedBlastBalance: cur.purchasedBlastBalance - take,
    }),
    amount: take,
  };
}

function applyDebitEarned(balances, amount) {
  const take = floorNonNeg(amount);
  const cur = normalizeBlastBalances(balances);
  if (take <= 0) return fail('INVALID_AMOUNT', cur);
  if (take > cur.earnedBlastBalance) {
    return fail('INSUFFICIENT_EARNED', cur, { requested: take });
  }
  return {
    ok: true,
    balances: normalizeBlastBalances({
      ...cur,
      earnedBlastBalance: cur.earnedBlastBalance - take,
      earnedBlastSpent: cur.earnedBlastSpent + take,
    }),
    amount: take,
  };
}

function spendLedgerEntries({ userId, amountPurchased, amountEarned, idempotencyKey, referenceType, referenceId, metadata }) {
  const entries = [];
  if (amountPurchased > 0) {
    entries.push({
      userId,
      transactionType: TX.SPEND,
      bucket: BUCKET.PURCHASED,
      amount: amountPurchased,
      direction: DIRECTION.DEBIT,
      idempotencyKey: idempotencyKey ? `${idempotencyKey}:purchased` : null,
      referenceType: referenceType || null,
      referenceId: referenceId || null,
      status: 'completed',
      metadata: metadata || null,
    });
  }
  if (amountEarned > 0) {
    entries.push({
      userId,
      transactionType: TX.SPEND,
      bucket: BUCKET.EARNED,
      amount: amountEarned,
      direction: DIRECTION.DEBIT,
      idempotencyKey: idempotencyKey ? `${idempotencyKey}:earned` : null,
      referenceType: referenceType || null,
      referenceId: referenceId || null,
      status: 'completed',
      metadata: metadata || null,
    });
  }
  return entries;
}

module.exports = {
  TX,
  BUCKET,
  DIRECTION,
  FILTER_GROUP,
  WITHDRAWAL_STATUS,
  normalizeWithdrawalStatus,
  floorNonNeg,
  filterGroupForType,
  normalizeBlastBalances,
  toSummary,
  firestoreBalancePatch,
  applySpend,
  applyCreditPurchased,
  applyCreditEarned,
  applyRequestWithdrawal,
  applyConfirmWithdrawal,
  applyRejectWithdrawal,
  applyRefund,
  applyDebitPurchased,
  applyDebitEarned,
  spendLedgerEntries,
};
module.exports.default = module.exports;
