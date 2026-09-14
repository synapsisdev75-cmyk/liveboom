/**
 * Blast balances: purchased vs earned.
 * coinsBalance always mirrors purchased + earned (compat).
 */

function floorNonNeg(n) {
  return Math.max(0, Math.floor(Number(n) || 0));
}

/**
 * @param {Record<string, unknown>|null|undefined} data
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

  if (!hasPurchased && !hasEarned) {
    purchased = coins;
    earned = 0;
  } else if (!hasPurchased && hasEarned) {
    purchased = Math.max(0, coins - earned);
  } else if (hasPurchased && !hasEarned) {
    earned = Math.max(0, coins - purchased);
  }

  const total = purchased + earned;
  return {
    purchasedBlastBalance: purchased,
    earnedBlastBalance: earned,
    coinsBalance: total,
    earnedBlastSpent: earnedSpent,
    earnedBlastWithdrawn: earnedWithdrawn,
    availableEarnedBlast: earned,
    totalBlastBalance: total,
  };
}

/**
 * Prefer purchased; earned only if allowEarned.
 * Supports partial spend when balance < amount (returns ok with smaller charge).
 */
function applySpend(balances, amount, allowEarned) {
  const need = floorNonNeg(amount);
  const purchased = balances.purchasedBlastBalance;
  const earned = balances.earnedBlastBalance;
  if (need <= 0) {
    return {
      ok: true,
      balances,
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
      if (usePurchased > 0) {
        // Cobro parcial con comprados; luego pedir ganados o cortar.
        const next = normalizeBlastBalances({
          purchasedBlastBalance: purchased - usePurchased,
          earnedBlastBalance: earned,
          earnedBlastSpent: balances.earnedBlastSpent,
          earnedBlastWithdrawn: balances.earnedBlastWithdrawn,
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
        return {
          ok: false,
          code: 'NEEDS_EARNED_AUTH',
          balances,
          chargedPurchased: 0,
          chargedEarned: 0,
          remainingCharge: remaining,
        };
      }
      return {
        ok: false,
        code: 'INSUFFICIENT',
        balances,
        chargedPurchased: 0,
        chargedEarned: 0,
        remainingCharge: remaining,
      };
    }
    useEarned = Math.min(earned, remaining);
    remaining -= useEarned;
  }

  if (usePurchased + useEarned <= 0) {
    return {
      ok: false,
      code: 'INSUFFICIENT',
      balances,
      chargedPurchased: 0,
      chargedEarned: 0,
      remainingCharge: need,
    };
  }

  const next = normalizeBlastBalances({
    purchasedBlastBalance: purchased - usePurchased,
    earnedBlastBalance: earned - useEarned,
    earnedBlastSpent: balances.earnedBlastSpent + useEarned,
    earnedBlastWithdrawn: balances.earnedBlastWithdrawn,
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
  return normalizeBlastBalances({
    ...balances,
    purchasedBlastBalance: balances.purchasedBlastBalance + add,
  });
}

function applyCreditEarned(balances, amount) {
  const add = floorNonNeg(amount);
  return normalizeBlastBalances({
    ...balances,
    earnedBlastBalance: balances.earnedBlastBalance + add,
  });
}

function firestoreBalancePatch(balances) {
  return {
    purchasedBlastBalance: balances.purchasedBlastBalance,
    earnedBlastBalance: balances.earnedBlastBalance,
    coinsBalance: balances.coinsBalance,
    earnedBlastSpent: balances.earnedBlastSpent,
    earnedBlastWithdrawn: balances.earnedBlastWithdrawn,
  };
}

module.exports = {
  normalizeBlastBalances,
  applySpend,
  applyCreditPurchased,
  applyCreditEarned,
  firestoreBalancePatch,
  floorNonNeg,
};
