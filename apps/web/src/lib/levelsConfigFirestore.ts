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
import { DEFAULT_TIER_SEEDS, seedToUrls, type DefaultTierSeed } from './defaultLevelTiers';

const DOC_PATH = 'config/levels';

export type RemoteTierConfig = DefaultTierSeed & {
  frameImageUrl: string;
  badgeImageUrl: string;
  badgeAnimWebm?: string | null;
  badgeAnimMp4?: string | null;
};

export type LevelsConfigDoc = {
  version: number;
  updatedBy?: string;
  tiers: RemoteTierConfig[];
};

export type AvatarLayout = {
  top: string;
  left: string;
  width: string;
  height: string;
};

export type InsigniaSize = {
  mobile: { width: number; height: number };
  desktop: { width: number; height: number };
};

export function buildDefaultConfig(): LevelsConfigDoc {
  return {
    version: 1,
    tiers: DEFAULT_TIER_SEEDS.map((seed) => ({
      ...seed,
      ...seedToUrls(seed),
    })),
  };
}

export function avatarLayoutFromTier(tier: RemoteTierConfig): AvatarLayout {
  return {
    top: `${tier.avatarTop}%`,
    left: `${tier.avatarLeft}%`,
    width: `${tier.avatarWidth}%`,
    height: `${tier.avatarHeight}%`,
  };
}

export function insigniaSizeFromTier(tier: RemoteTierConfig): InsigniaSize {
  return {
    mobile: { width: tier.insigniaWidthMobile, height: tier.insigniaHeightMobile },
    desktop: { width: tier.insigniaWidthDesktop, height: tier.insigniaHeightDesktop },
  };
}

export function imageWithVersion(url: string, version: number): string {
  if (!url) return url;
  if (url.includes('firebasestorage.googleapis.com')) return url;
  const base = url.split('?')[0]!;
  return `${base}?v=${version}`;
}

export async function fetchLevelsConfig(): Promise<LevelsConfigDoc | null> {
  const snap = await getDoc(doc(db, DOC_PATH));
  if (!snap.exists()) return null;
  return snap.data() as LevelsConfigDoc;
}

export function listenLevelsConfig(onChange: (config: LevelsConfigDoc | null) => void): Unsubscribe {
  return onSnapshot(doc(db, DOC_PATH), (snap) => {
    onChange(snap.exists() ? (snap.data() as LevelsConfigDoc) : null);
  });
}

export async function saveLevelsConfig(
  config: LevelsConfigDoc,
  updatedBy: string,
): Promise<void> {
  await setDoc(doc(db, DOC_PATH), {
    ...config,
    version: Math.max(1, Math.floor(Number(config.version) || 1)),
    updatedBy,
    updatedAt: serverTimestamp(),
  });
}

export async function uploadLevelAsset(
  slug: string,
  kind: 'frame' | 'badge',
  file: Blob,
): Promise<string> {
  const safeSlug = slug.replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'level';
  const objectRef = ref(storage, `admin/levels/${safeSlug}/${kind}.png`);
  await uploadBytes(objectRef, file, { contentType: 'image/png' });
  return getDownloadURL(objectRef);
}
