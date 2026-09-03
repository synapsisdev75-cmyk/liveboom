export const BATTLE_DURATION_MS = 3 * 60 * 1000;

export const AGORA_APP_ID =
  String(import.meta.env.VITE_AGORA_APP_ID || 'b3d578c772e542ed8b63cb1782a0f262').trim();

/** Mismo hash que backend/src/lib/agora.js */
export function agoraUid(firebaseUid: string): number {
  const s = String(firebaseUid || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2147483646 || 1;
}

export function newBattleId(): string {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function battleChannel(battleId: string): string {
  return `lb_${battleId}`.slice(0, 64);
}
