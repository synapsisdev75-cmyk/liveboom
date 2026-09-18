/**
 * Helpers de Blast comprados / ganados (frontend).
 * coinsBalance = purchased + earned (compat).
 */

export type BlastBalances = {
  purchasedBlastBalance: number;
  earnedBlastBalance: number;
  earnedBlastReserved: number;
  coinsBalance: number;
  earnedBlastSpent: number;
  earnedBlastWithdrawn: number;
  totalBlastBalance: number;
  withdrawableBalance: number;
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
  const earnedReserved = floorNonNeg(raw.earnedBlastReserved);

  if (!hasPurchased && !hasEarned) {
    // Legado: solo coinsBalance → se trata como comprados hasta que existan campos duales.
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
    earnedBlastReserved: earnedReserved,
    coinsBalance: total,
    earnedBlastSpent: earnedSpent,
    earnedBlastWithdrawn: earnedWithdrawn,
    totalBlastBalance: total,
    withdrawableBalance: earned,
  };
}
