/** Assets y precarga de la piel visual Batalla Boom. No altera lógica de scores ni streaming. */

export const BATTLE_SKIN_WEBM = '/battles/battle-vs-liveboom.webm';
export const BATTLE_SKIN_MP4 = '/battles/battle-vs-liveboom.mp4';
export const BATTLE_SKIN_STILL = '/reactions/vs-battle.png';

export type BattleSkinStatus = 'idle' | 'countdown' | 'active' | 'finished';
export type BattleSkinPerformance = 'auto' | 'full' | 'lite';

let preloadStarted = false;

export function preloadBattleSkinAssets() {
  if (preloadStarted || typeof document === 'undefined') return;
  preloadStarted = true;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = BATTLE_SKIN_MP4;
  video.load();
}

export function detectBattleFxLite(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  if (nav.connection?.saveData) return true;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return true;
  return false;
}

export function battleEnergyBand(host1Score: number, host2Score: number): 0 | 1 | 2 | 3 | 4 {
  const a = Math.max(0, host1Score);
  const b = Math.max(0, host2Score);
  const total = a + b;
  if (total <= 0) return 0;
  const leadShare = Math.max(a, b) / total;
  if (leadShare >= 0.99 || Math.max(a, b) >= Math.min(a, b) * 4) return 4;
  if (leadShare >= 0.75) return 3;
  if (leadShare >= 0.5) return 2;
  if (leadShare >= 0.25) return 1;
  return 0;
}
