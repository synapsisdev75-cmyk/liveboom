import type { FaceGiftProp } from './faceGiftAnchors';
import type { LiveGift } from './liveboomGifts';
import type { GiftPlacement } from './catalogConfigFirestore';

type RuntimeGift = LiveGift & {
  enabled?: boolean;
  placements?: GiftPlacement[];
  face?: FaceGiftProp | null;
};

type RuntimePack = {
  id: string;
  name: string;
  coins: number;
  amountInCop: number;
  popular: boolean;
  bestValue: boolean;
  artUrl: string;
  enabled?: boolean;
};

let gifts: RuntimeGift[] | null = null;
let packs: RuntimePack[] | null = null;

export function setRuntimeGiftCatalog(next: RuntimeGift[] | null) {
  gifts = next;
}

export function runtimeCatalogLoaded(): boolean {
  return gifts != null;
}

export function setRuntimeCoinPackages(next: RuntimePack[] | null) {
  packs = next;
}

export function runtimeFindGift(giftId: string | null | undefined): RuntimeGift | null {
  if (!giftId || !gifts) return null;
  return gifts.find((g) => g.id === giftId && g.enabled !== false) ?? null;
}

export function runtimeGiftsFor(
  placement: GiftPlacement,
  opts?: { includeDeepar?: boolean },
): RuntimeGift[] {
  if (!gifts) return [];
  return gifts
    .filter((g) => g.enabled !== false)
    .filter((g) => (g.placements || []).includes(placement))
    .filter((g) => (opts?.includeDeepar ? true : !g.deeparFilter))
    .slice()
    .sort((a, b) => a.coins - b.coins);
}

export function runtimeAllLiveGifts(): RuntimeGift[] {
  return runtimeGiftsFor('live', { includeDeepar: true });
}

export function runtimeFaceProp(giftId: string | null | undefined): FaceGiftProp | null {
  if (!giftId || !gifts) return null;
  const gift = gifts.find((g) => g.id === giftId);
  return gift?.face ?? null;
}

export function runtimeCoinPackages(): RuntimePack[] {
  if (!packs) return [];
  return packs.filter((p) => p.enabled !== false);
}

export function runtimeCoinPackage(id: string): RuntimePack | null {
  return runtimeCoinPackages().find((p) => p.id === id) ?? null;
}
