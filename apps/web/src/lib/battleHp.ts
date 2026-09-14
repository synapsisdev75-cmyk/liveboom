/** Motor de vida Batalla Boom 1v1. Regalo a A → daño a B (y viceversa). */

export const BATTLE_HP_MAX = 100;

/** Duraciones elegibles (ms). */
export const BATTLE_DURATION_OPTIONS = [
  { minutes: 3, ms: 3 * 60 * 1000, label: '3 min' },
  { minutes: 5, ms: 5 * 60 * 1000, label: '5 min' },
  { minutes: 8, ms: 8 * 60 * 1000, label: '8 min' },
] as const;

export type BattleDurationMinutes = (typeof BATTLE_DURATION_OPTIONS)[number]['minutes'];

export const DEFAULT_BATTLE_DURATION_MS = BATTLE_DURATION_OPTIONS[0].ms;

/** damage% = clamp(coins * k, minD, maxD) */
export const BATTLE_DAMAGE_K = 0.05;
export const BATTLE_DAMAGE_MIN_PCT = 0.5;
export const BATTLE_DAMAGE_MAX_PCT = 15;

export type BattleWinnerSide = 'a' | 'b' | 'draw';
export type BattleEndReason = 'timer' | 'ko' | 'forfeit';

export function normalizeBattleDurationMs(value: unknown): number {
  const n = Math.floor(Number(value) || 0);
  const hit = BATTLE_DURATION_OPTIONS.find((item) => item.ms === n);
  return hit ? hit.ms : DEFAULT_BATTLE_DURATION_MS;
}

export function durationMsFromMinutes(minutes: number): number {
  const hit = BATTLE_DURATION_OPTIONS.find((item) => item.minutes === minutes);
  return hit ? hit.ms : DEFAULT_BATTLE_DURATION_MS;
}

/** Porcentaje de daño según precio del regalo (coins). */
export function damagePercentFromGiftCoins(coins: number): number {
  const amount = Math.max(0, Number(coins) || 0);
  if (amount <= 0) return 0;
  const raw = amount * BATTLE_DAMAGE_K;
  return Math.min(BATTLE_DAMAGE_MAX_PCT, Math.max(BATTLE_DAMAGE_MIN_PCT, raw));
}

export function clampBattleHp(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return BATTLE_HP_MAX;
  return Math.min(BATTLE_HP_MAX, Math.max(0, n));
}

export function resolveBattleWinner(hpA: number, hpB: number): BattleWinnerSide {
  const a = clampBattleHp(hpA);
  const b = clampBattleHp(hpB);
  if (a > b) return 'a';
  if (b > a) return 'b';
  return 'draw';
}

export function applyGiftDamageToOpponent(input: {
  hpA: number;
  hpB: number;
  /** Quién recibió el regalo */
  receiver: 'a' | 'b';
  coins: number;
}): {
  hpA: number;
  hpB: number;
  damage: number;
  ko: boolean;
  winnerSide: BattleWinnerSide | null;
} {
  const damage = damagePercentFromGiftCoins(input.coins);
  let hpA = clampBattleHp(input.hpA);
  let hpB = clampBattleHp(input.hpB);
  if (input.receiver === 'a') {
    hpB = clampBattleHp(hpB - damage);
  } else {
    hpA = clampBattleHp(hpA - damage);
  }
  const ko = hpA <= 0 || hpB <= 0;
  return {
    hpA,
    hpB,
    damage,
    ko,
    winnerSide: ko ? resolveBattleWinner(hpA, hpB) : null,
  };
}
