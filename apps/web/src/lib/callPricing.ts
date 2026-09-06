import { findLiveGift, sortedLiveboomGiftCatalog, type LiveGift } from './liveboomGifts';

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
};

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
