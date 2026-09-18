/**
 * Helpers de Blast comprados / ganados (frontend).
 * coinsBalance = purchased + earned (compat).
 */

export type BlastBalances = {
  purchasedBlastBalance: number;
  earnedBlastBalance: number;
  coinsBalance: number;
  earnedBlastSpent: number;
  earnedBlastWithdrawn: number;
  totalBlastBalance: number;
};

function floorNonNeg(n: unknown) {
  return Math.max(0, Math.floor(Number(n) || 0));
}

export function normalizeBlastBalances(data: Record<string, unknown> | null | undefined): BlastBalances {
  const raw = data && typeof data === 'object' ? data : {};
  const hasPurchased = raw.purchasedBlastBalance != null && raw.purchasedBlastBalance !== '';
  const hasEarned = raw.earnedBlastBalance != null && raw.earnedBlastBalance !== '';
  const coins = floorNonNeg(raw.coinsBalance);
  let purchased = floorNonNeg(raw.purchasedBlastBalance);
  let earned = floorNonNeg(raw.earnedBlastBalance);
  const earnedSpent = floorNonNeg(raw.earnedBlastSpent);
  const earnedWithdrawn = floorNonNeg(raw.earnedBlastWithdrawn);

  if (!hasPurchased && !hasEarned) {
    // Legado: solo coinsBalance → se trata como comprados hasta que existan campos duales.
    purchased = coins;
    earned = 0;
  } else if (!hasPurchased && hasEarned) {
    purchased = Math.max(0, coins - earned);
  } else if (hasPurchased && !hasEarned) {
    earned = Math.max(0, coins - purchased);
  } else if (purchased + earned === 0 && coins > 0) {
    // Campos duales en 0 pero hay total: no borrar el saldo; asignar a comprados.
    purchased = coins;
    earned = 0;
  }

  const total = purchased + earned;
  return {
    purchasedBlastBalance: purchased,
    earnedBlastBalance: earned,
    coinsBalance: total,
    earnedBlastSpent: earnedSpent,
    earnedBlastWithdrawn: earnedWithdrawn,
    totalBlastBalance: total,
  };
}

/** Solo Blast ganados (regalos / llamadas). Las recargas no se retiran. */
export function applyWithdrawEarned(
  balances: BlastBalances,
  amount: number,
): { ok: true; balances: BlastBalances; withdrawn: number } | { ok: false; available: number } {
  const need = floorNonNeg(amount);
  if (need <= 0) {
    return { ok: true, balances: normalizeBlastBalances(balances), withdrawn: 0 };
  }
  if (balances.earnedBlastBalance < need) {
    return { ok: false, available: balances.earnedBlastBalance };
  }
  return {
    ok: true,
    withdrawn: need,
    balances: normalizeBlastBalances({
      purchasedBlastBalance: balances.purchasedBlastBalance,
      earnedBlastBalance: balances.earnedBlastBalance - need,
      earnedBlastSpent: balances.earnedBlastSpent,
      earnedBlastWithdrawn: balances.earnedBlastWithdrawn + need,
    }),
  };
}
