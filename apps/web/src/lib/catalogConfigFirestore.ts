import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from './firebase';
import { COIN_PACKAGES } from './coinPackages';
import { RETIRED_GIFT_IDS } from './retiredGifts';
import {
  FACE_GIFT_PROPS,
  type FaceGiftProp,
} from './faceGiftAnchors';
import {
  LIVEBOOM_GIFTS,
  clampGiftAnimScale,
  giftLevelFromCoins,
  type GiftLevel,
  type LiveGift,
} from './liveboomGifts';
import { normalizeGiftLayout, serializeGiftLayout } from './giftLayout';
import { normalizeGiftMedia, serializeGiftMedia } from './giftMedia';

export type GiftPlacement = 'live' | 'post' | 'boom_clip' | 'flashboom' | 'call' | 'chat';

export const ALL_GIFT_PLACEMENTS: GiftPlacement[] = [
  'live',
  'post',
  'boom_clip',
  'flashboom',
  'call',
  'chat',
];

export type EditableGift = LiveGift & {
  enabled: boolean;
  placements: GiftPlacement[];
  face?: FaceGiftProp | null;
};

export type EditableCoinPackage = {
  id: string;
  name: string;
  coins: number;
  amountInCop: number;
  popular: boolean;
  bestValue: boolean;
  artUrl: string;
  enabled: boolean;
};

export type GiftsCatalogDoc = {
  version: number;
  updatedBy?: string;
  gifts: EditableGift[];
};

export type CoinPackagesDoc = {
  version: number;
  updatedBy?: string;
  packages: EditableCoinPackage[];
};

const GIFTS_PATH = 'config/giftsCatalog';
const PACKS_PATH = 'config/coinPackages';

function defaultPlacements(gift: LiveGift): GiftPlacement[] {
  if (gift.liveOnly) return ['live'];
  return ['live', 'post', 'boom_clip', 'flashboom', 'call', 'chat'];
}

export function buildDefaultGiftsCatalog(): GiftsCatalogDoc {
  return {
    version: 1,
    gifts: LIVEBOOM_GIFTS.map((gift) => ({
      ...gift,
      enabled: true,
      placements: defaultPlacements(gift),
      face: FACE_GIFT_PROPS[gift.id] ? { ...FACE_GIFT_PROPS[gift.id]! } : null,
    })),
  };
}

export function buildDefaultCoinPackages(): CoinPackagesDoc {
  return {
    version: 1,
    packages: COIN_PACKAGES.map((pack) => ({
      id: pack.id,
      name: pack.name,
      coins: pack.coins,
      amountInCop: pack.amountInCop,
      popular: pack.popular,
      bestValue: pack.bestValue,
      artUrl: pack.artUrl,
      enabled: true,
    })),
  };
}

function normalizeGift(raw: Record<string, unknown>, fallback?: EditableGift): EditableGift | null {
  const id = String(raw.id || fallback?.id || '').trim();
  if (!id || RETIRED_GIFT_IDS.has(id)) return null;
  const coins = Math.max(0, Math.floor(Number(raw.coins ?? fallback?.coins) || 0));
  const level = (Math.min(5, Math.max(1, Math.floor(Number(raw.level) || giftLevelFromCoins(coins)))) ||
    1) as GiftLevel;
  const placementsRaw = Array.isArray(raw.placements) ? raw.placements : fallback?.placements;
  const placements = (placementsRaw || defaultPlacements(fallback || ({ liveOnly: false } as LiveGift)))
    .map((p) => String(p) as GiftPlacement)
    .filter((p) => ALL_GIFT_PLACEMENTS.includes(p));
  const faceRaw = raw.face && typeof raw.face === 'object' ? (raw.face as Record<string, unknown>) : null;
  let face: FaceGiftProp | null = fallback?.face ?? null;
  if (faceRaw) {
    const anchor = String(faceRaw.anchor || 'hat') as FaceGiftProp['anchor'];
    face = {
      emoji: String(faceRaw.emoji || fallback?.emoji || '🎁'),
      anchor: ['hat', 'crown', 'mask', 'glasses', 'kiss'].includes(anchor) ? anchor : 'hat',
      scale: Number(faceRaw.scale) || 1,
      offsetY: Number(faceRaw.offsetY) || 0,
    };
  } else if (raw.face === null) {
    face = null;
  }
  return {
    id,
    name: String(raw.name || fallback?.name || id),
    emoji: String(raw.emoji || fallback?.emoji || '🎁'),
    image: raw.image != null ? String(raw.image) : fallback?.image,
    video: String(raw.video || '').trim() || fallback?.video,
    coins,
    level,
    animation: String(raw.animation || fallback?.animation || ''),
    animScale: clampGiftAnimScale(
      raw.animScale != null ? raw.animScale : fallback?.animScale,
      level,
    ),
    giftLayout: normalizeGiftLayout(
      raw.giftLayout != null ? raw.giftLayout : fallback?.giftLayout,
      raw.animScale != null ? raw.animScale : fallback?.animScale,
    ),
    media: normalizeGiftMedia(raw.media != null ? raw.media : fallback?.media),
    liveOnly: placements.length === 1 && placements[0] === 'live',
    deeparFilter: (raw.deeparFilter as LiveGift['deeparFilter']) || fallback?.deeparFilter,
    enabled: raw.enabled === false ? false : true,
    placements: placements.length ? placements : ['live'],
    face,
  };
}

export function mergeGiftsCatalog(doc: GiftsCatalogDoc | null): EditableGift[] {
  const base = buildDefaultGiftsCatalog().gifts;
  if (!doc?.gifts?.length) return base;
  const byDefault = new Map(base.map((gift) => [gift.id, gift]));
  const merged: EditableGift[] = [];
  const seen = new Set<string>();
  for (const gift of doc.gifts) {
    const next = normalizeGift(gift as unknown as Record<string, unknown>, byDefault.get(gift.id));
    if (!next) continue;
    merged.push(next);
    seen.add(next.id);
  }
  for (const gift of base) {
    if (!seen.has(gift.id)) merged.push(gift);
  }
  return merged;
}

export function mergeCoinPackages(doc: CoinPackagesDoc | null): EditableCoinPackage[] {
  const base = buildDefaultCoinPackages().packages;
  if (!doc?.packages?.length) return base;
  const byId = new Map(doc.packages.map((p) => [p.id, p]));
  return base.map((pack) => {
    const override = byId.get(pack.id);
    if (!override) return pack;
    return {
      ...pack,
      name: String(override.name || pack.name),
      coins: Math.max(1, Math.floor(Number(override.coins) || pack.coins)),
      amountInCop: Math.max(100, Math.floor(Number(override.amountInCop) || pack.amountInCop)),
      popular: Boolean(override.popular),
      bestValue: Boolean(override.bestValue),
      artUrl: String(override.artUrl || pack.artUrl),
      enabled: override.enabled === false ? false : true,
    };
  });
}

export async function fetchGiftsCatalog(): Promise<GiftsCatalogDoc | null> {
  const snap = await getDoc(doc(db, GIFTS_PATH));
  if (!snap.exists()) return null;
  return snap.data() as GiftsCatalogDoc;
}

export async function fetchCoinPackagesConfig(): Promise<CoinPackagesDoc | null> {
  const snap = await getDoc(doc(db, PACKS_PATH));
  if (!snap.exists()) return null;
  return snap.data() as CoinPackagesDoc;
}

export function listenGiftsCatalog(onChange: (doc: GiftsCatalogDoc | null) => void): Unsubscribe {
  return onSnapshot(doc(db, GIFTS_PATH), (snap) => {
    onChange(snap.exists() ? (snap.data() as GiftsCatalogDoc) : null);
  });
}

export function listenCoinPackagesConfig(
  onChange: (doc: CoinPackagesDoc | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, PACKS_PATH), (snap) => {
    onChange(snap.exists() ? (snap.data() as CoinPackagesDoc) : null);
  });
}

function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) return value;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }
  // No tocar Timestamp / FieldValue / Date.
  const proto = Object.prototype.toString.call(value);
  if (proto !== '[object Object]') return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined) continue;
    out[key] = stripUndefinedDeep(entry);
  }
  return out as T;
}

/** Serializa un regalo sin campos `undefined` (Firestore los rechaza). */
export function serializeEditableGift(gift: EditableGift): Record<string, unknown> {
  const normalized =
    normalizeGift(gift as unknown as Record<string, unknown>) || gift;
  return {
    id: normalized.id,
    name: normalized.name,
    emoji: normalized.emoji,
    image: normalized.image ? String(normalized.image) : null,
    video: normalized.video ? String(normalized.video) : null,
    coins: normalized.coins,
    level: normalized.level,
    animation: normalized.animation || '',
    animScale: clampGiftAnimScale(normalized.animScale, normalized.level),
    giftLayout: serializeGiftLayout(normalized.giftLayout, normalized.animScale),
    media: serializeGiftMedia(normalized.media),
    liveOnly: Boolean(normalized.liveOnly),
    deeparFilter: normalized.deeparFilter || null,
    enabled: normalized.enabled !== false,
    placements: normalized.placements.length ? normalized.placements : ['live'],
    face: normalized.face
      ? {
          emoji: normalized.face.emoji,
          anchor: normalized.face.anchor,
          scale: Number(normalized.face.scale) || 1,
          offsetY: Number(normalized.face.offsetY) || 0,
        }
      : null,
  };
}

export async function saveGiftsCatalog(config: GiftsCatalogDoc, updatedBy: string) {
  const gifts = (config.gifts || [])
    .filter((gift) => !RETIRED_GIFT_IDS.has(gift.id))
    .map((gift) => serializeEditableGift(gift));
  await setDoc(
    doc(db, GIFTS_PATH),
    stripUndefinedDeep({
      version: Math.max(1, Math.floor(Number(config.version) || 1)),
      gifts,
      updatedBy: updatedBy || 'admin',
      updatedAt: serverTimestamp(),
    }),
    { merge: true },
  );
}

export async function saveCoinPackagesConfig(config: CoinPackagesDoc, updatedBy: string) {
  const packages = (config.packages || []).map((pack) => ({
    id: String(pack.id),
    name: String(pack.name || pack.id),
    coins: Math.max(1, Math.floor(Number(pack.coins) || 1)),
    amountInCop: Math.max(100, Math.floor(Number(pack.amountInCop) || 100)),
    popular: Boolean(pack.popular),
    bestValue: Boolean(pack.bestValue),
    artUrl: String(pack.artUrl || ''),
    enabled: pack.enabled !== false,
  }));
  await setDoc(
    doc(db, PACKS_PATH),
    stripUndefinedDeep({
      version: Math.max(1, Math.floor(Number(config.version) || 1)),
      packages,
      updatedBy: updatedBy || 'admin',
      updatedAt: serverTimestamp(),
    }),
    { merge: true },
  );
}

function catalogAssetContentType(file: File, ext: string): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    webm: 'video/webm',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
  };
  return map[ext] || 'application/octet-stream';
}

export async function uploadCatalogAsset(
  folder: 'gifts' | 'blast',
  id: string,
  file: File,
): Promise<string> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `config/${folder}/${id}-${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  try {
    await uploadBytes(storageRef, file, { contentType: catalogAssetContentType(file, ext) });
  } catch (err) {
    const code = String((err as { code?: string } | null)?.code || '');
    const raw = err instanceof Error ? err.message : String(err || '');
    if (code === 'storage/unauthorized' || /storage\/unauthorized/i.test(raw)) {
      throw new Error(
        'Storage no autorizó la subida. Con la bóveda abierta, vuelve a soltar el archivo.',
      );
    }
    throw err;
  }
  return getDownloadURL(storageRef);
}
