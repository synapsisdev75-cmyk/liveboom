/** Meta colectiva de Boom por ronda en un LIVE. */
export const LIVE_BOOM_ROUND_GOAL = 300;

export function boomRoundProgress(count: number): number {
  return Math.min(Math.max(0, count) / LIVE_BOOM_ROUND_GOAL, 1);
}

export function boomRoundFillPercent(count: number): number {
  return boomRoundProgress(count) * 100;
}

/** Alinea ronda con total solo en salas sin el campo boomRoundCount. */
export function resolveBoomRoundCount(
  liveBoomCount: number,
  boomRoundCount: number | undefined | null,
  hasRoundField = true,
): number {
  if (hasRoundField) {
    return Math.min(Math.max(0, Number(boomRoundCount ?? 0)), LIVE_BOOM_ROUND_GOAL);
  }
  if (liveBoomCount > 0) {
    return liveBoomCount % LIVE_BOOM_ROUND_GOAL;
  }
  return 0;
}
