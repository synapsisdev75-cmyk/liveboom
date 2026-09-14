import { findLiveGift, sortedLiveboomGiftCatalog, type LiveGift } from './liveboomGifts';

/** Tarifas fijas de llamadas privadas (Blast/min). Cambiar solo aquí. */
export const CALL_PRICING = {
  voice: 9,
  video_720: 18,
  video_1080: 32,
} as const;

/** Valor estimado COP por Blast ganado por el receptor/creador. */
export const CREATOR_VALUE_PER_BLAST = 15;

/** Segundos conectados por debajo de este umbral ⇒ cobro 0. */
export const BILLING_GRACE_SECONDS = 10;

export type PlatformCallType = keyof typeof CALL_PRICING;

export const ALLOWED_CALL_GIFT_VALUES = [
  1, 2, 5, 8, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150,
] as const;

export const MAX_CALL_RATE_BLASTS = 150;

export type AllowedCallGiftValue = (typeof ALLOWED_CALL_GIFT_VALUES)[number];

export type CallRateSnapshot = {
  giftId: string;
  giftName: string;
  giftEmoji: string;
  giftImage?: string;
  rateBlasts: number;
  /** Clave de tarifa de plataforma (si aplica). */
  callType?: PlatformCallType;
};

export function normalizePlatformCallType(
  type?: string | null,
  quality?: string | null,
): PlatformCallType {
  const t = String(type || '').toLowerCase();
  const q = String(quality || '').toLowerCase();
  if (t === 'voice' || t === 'audio') return 'voice';
  if (t === 'video_1080' || q === '1080' || q === 'video_1080') return 'video_1080';
  if (t === 'video_720' || t === 'video' || q === '720') return 'video_720';
  return 'voice';
}

export function platformCallTypeForMedia(video: boolean, quality?: string | null): PlatformCallType {
  if (!video) return 'voice';
  return normalizePlatformCallType('video', quality);
}

export function blastPerMinute(callType: PlatformCallType | string): number {
  const key = normalizePlatformCallType(callType);
  return Math.max(0, Math.floor(Number(CALL_PRICING[key]) || 0));
}

/** totalBlastDue = ceil(connectedSeconds × rate / 60); 0 si < gracia. */
export function calculateBlastDue(connectedSeconds: number, callType: PlatformCallType | string): number {
  const sec = Math.max(0, Math.floor(Number(connectedSeconds) || 0));
  if (sec < BILLING_GRACE_SECONDS) return 0;
  const rate = blastPerMinute(callType);
  if (rate <= 0) return 0;
  return Math.ceil((sec * rate) / 60);
}

export function creatorCopForBlast(blast: number): number {
  return Math.max(0, Math.floor(Number(blast) || 0)) * CREATOR_VALUE_PER_BLAST;
}

export function estimateRemainingSeconds(walletBlast: number, callType: PlatformCallType | string): number {
  const rate = blastPerMinute(callType);
  const bal = Math.max(0, Math.floor(Number(walletBlast) || 0));
  if (rate <= 0) return Infinity;
  return Math.floor((bal / rate) * 60);
}

export function pricingTitle(callType: PlatformCallType | string): string {
  const key = normalizePlatformCallType(callType);
  if (key === 'video_1080') return 'Video Premium';
  if (key === 'video_720') return 'Videollamada privada';
  return 'Llamada privada';
}

/** Snapshot de tarifa de plataforma (no depende del catálogo de regalos). */
export function platformRateSnapshot(
  video: boolean,
  quality?: string | null,
): CallRateSnapshot {
  const callType = platformCallTypeForMedia(video, quality);
  const rate = blastPerMinute(callType);
  return {
    giftId: `platform_${callType}`,
    giftName: pricingTitle(callType),
    giftEmoji: '🔥',
    rateBlasts: rate,
    callType,
  };
}

export function isAllowedCallGiftValue(value: number): value is AllowedCallGiftValue {
  const n = Math.floor(Number(value) || 0);
  return (ALLOWED_CALL_GIFT_VALUES as readonly number[]).includes(n) && n <= MAX_CALL_RATE_BLASTS;
}

export function isCallPricingGift(gift: LiveGift | null | undefined): boolean {
  if (!gift || gift.liveOnly) return false;
  return isAllowedCallGiftValue(gift.coins);
}

export function callPricingGifts(): LiveGift[] {
  return sortedLiveboomGiftCatalog().filter(isCallPricingGift);
}

export function giftsForCallRate(value: number): LiveGift[] {
  if (!isAllowedCallGiftValue(value)) return [];
  return callPricingGifts().filter((gift) => gift.coins === value);
}

export function snapshotFromGift(gift: LiveGift): CallRateSnapshot {
  return {
    giftId: gift.id,
    giftName: gift.name,
    giftEmoji: gift.emoji,
    giftImage: gift.image,
    rateBlasts: gift.coins,
  };
}

export function validateCallGiftId(giftId: string): CallRateSnapshot {
  const gift = findLiveGift(giftId);
  if (!gift || !isCallPricingGift(gift)) {
    throw new Error('Elige un regalo válido de la tarifa de llamadas (máx. 150 Blasts).');
  }
  return snapshotFromGift(gift);
}

export function estimateCallMinutes(balance: number, rateBlasts: number) {
  const rate = Math.max(0, Math.floor(rateBlasts));
  const coins = Math.max(0, Math.floor(balance));
  if (rate <= 0) return Infinity;
  return Math.floor(coins / rate);
}

export function blocksForDurationSec(durationSec: number) {
  const sec = Math.max(0, Math.floor(durationSec));
  if (sec <= 0) return 0;
  return Math.ceil(sec / 60);
}

export function spendingLimitOptions(rateBlasts: number) {
  const rate = Math.max(0, Math.floor(rateBlasts));
  if (rate <= 0) return [];
  const blocks = [1, 2, 3, 5, 10];
  return blocks.map((n) => ({ blocks: n, blasts: n * rate }));
}
