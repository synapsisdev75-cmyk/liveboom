/** Catálogo oficial Liveboom — precios y media desde config/giftsCatalog (Super Admin). */

import type { CallFilterId } from './deepar';
import type { GiftLayoutMap } from './giftLayout';
import type { GiftMediaInfo } from './giftMedia';
import { runtimeAllLiveGifts, runtimeCatalogLoaded, runtimeFindGift, runtimeGiftsFor } from './catalogRuntime';
import { RETIRED_GIFT_IDS } from './retiredGifts';

export type GiftLevel = 1 | 2 | 3 | 4 | 5;

export type LiveGift = {
  id: string;
  name: string;
  emoji: string;
  /** PNG con fondo transparente en /gifts (si existe). */
  image?: string;
  /** WebM con alpha para animación al enviar el regalo. */
  video?: string;
  coins: number;
  level: GiftLevel;
  /** Descripción corta de la animación (UI). */
  animation: string;
  /** Escala de la animación en pantalla (0.2–1).
   * 1 = casi pantalla completa; se edita en Super Admin y aplica en móvil/tablet/PC.
   */
  animScale?: number;
  /** Layout por dispositivo × formato LIVE. Si falta, se usa animScale. */
  giftLayout?: GiftLayoutMap;
  /** Original + procesado, audio y volumen. */
  media?: GiftMediaInfo;
  /** Solo aparece y se puede comprar en LIVE (no posts / clips / flash). */
  liveOnly?: boolean;
  /** Filtro DeepAR aplicado en la cámara del host. */
  deeparFilter?: Exclude<CallFilterId, 'none'>;
};

export function giftLevelFromCoins(coins: number): GiftLevel {
  if (coins <= 40) return 1;
  if (coins <= 600) return 2;
  if (coins <= 5000) return 3;
  if (coins <= 25000) return 4;
  return 5;
}

/** Duración, tamaño de pantalla y estilo por nivel. */
export const GIFT_LEVEL_FX: Record<
  GiftLevel,
  { duration: number; screenPct: number; label: string }
> = {
  1: { duration: 2, screenPct: 20, label: 'Básico' },
  2: { duration: 3.2, screenPct: 32, label: 'Popular' },
  3: { duration: 5, screenPct: 52, label: 'Especial' },
  4: { duration: 7, screenPct: 72, label: 'Premium' },
  5: { duration: 10, screenPct: 95, label: 'Legendario' },
};

/** Escala normalizada de animación en viewport (0.2–1). */
export function clampGiftAnimScale(value: unknown, level: GiftLevel = 1): number {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return Math.min(1, Math.max(0.2, n));
  const fromLevel = (GIFT_LEVEL_FX[level]?.screenPct ?? 32) / 100;
  return Math.min(1, Math.max(0.2, Math.round(fromLevel * 100) / 100));
}

/**
 * Sin semillas comerciales. El catálogo activo solo viene de Firestore
 * (Super Admin → Guardar y publicar).
 */
export const LIVEBOOM_GIFTS: LiveGift[] = [];

function asCatalogGift(g: LiveGift): LiveGift {
  return {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    image: g.image,
    video: g.video,
    coins: g.coins,
    level: g.level,
    animation: g.animation,
    animScale: g.animScale,
    giftLayout: g.giftLayout,
    media: g.media,
    liveOnly: g.liveOnly,
    deeparFilter: g.deeparFilter,
  };
}

export function findLiveGift(giftId: string | undefined | null): LiveGift | null {
  if (!giftId || RETIRED_GIFT_IDS.has(giftId)) return null;
  const remote = runtimeFindGift(giftId);
  if (!remote) return null;
  return asCatalogGift({
    id: remote.id,
    name: remote.name,
    emoji: remote.emoji,
    image: remote.image,
    video: remote.video,
    coins: remote.coins,
    level: remote.level,
    animation: remote.animation,
    animScale: remote.animScale,
    giftLayout: remote.giftLayout,
    media: remote.media,
    liveOnly: remote.liveOnly,
    deeparFilter: remote.deeparFilter,
  });
}

export function isDeeparLiveGift(giftId: string | undefined | null): boolean {
  return Boolean(findLiveGift(giftId)?.deeparFilter);
}

/** Catálogo para publicaciones / clips / flash — sin filtros DeepAR. */
export function sortedLiveboomGiftCatalog(): LiveGift[] {
  if (!runtimeCatalogLoaded()) return [];
  const remote = runtimeGiftsFor('post');
  const fromClip = runtimeGiftsFor('boom_clip');
  const fromFlash = runtimeGiftsFor('flashboom');
  const map = new Map<string, LiveGift>();
  for (const g of [...remote, ...fromClip, ...fromFlash]) {
    if (g.deeparFilter || RETIRED_GIFT_IDS.has(g.id)) continue;
    if (g.coins < 1) continue;
    map.set(g.id, asCatalogGift(g));
  }
  return [...map.values()].sort((a, b) => a.coins - b.coins);
}

/**
 * Catálogo de chat / llamada privada (placements `chat` + `call`).
 * Sin DeepAR ni liveOnly.
 */
export function sortedPrivateGiftCatalog(): LiveGift[] {
  if (!runtimeCatalogLoaded()) return [];
  const fromChat = runtimeGiftsFor('chat');
  const fromCall = runtimeGiftsFor('call');
  const map = new Map<string, LiveGift>();
  for (const g of [...fromChat, ...fromCall]) {
    if (g.deeparFilter || g.liveOnly || RETIRED_GIFT_IDS.has(g.id)) continue;
    if (g.coins < 1) continue;
    map.set(g.id, asCatalogGift(g));
  }
  return [...map.values()].sort((a, b) => a.coins - b.coins);
}

/** Catálogo completo del LIVE (incluye regalos DeepAR). */
export function sortedLiveGiftCatalog(): LiveGift[] {
  if (!runtimeCatalogLoaded()) return [];
  return runtimeAllLiveGifts()
    .filter((g) => !RETIRED_GIFT_IDS.has(g.id) && g.coins >= 1)
    .map((g) => asCatalogGift(g))
    .sort((a, b) => a.coins - b.coins);
}

export function giftsByLevel(level: GiftLevel) {
  return sortedLiveGiftCatalog().filter((g) => g.level === level);
}
