import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
  type Unsubscribe,
  onSnapshot,
} from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { firebaseApp } from './firebase';
import type { PromoKind, RegionId } from './promoRegions';

const db = getFirestore(firebaseApp);

export type PromotionAd = {
  id: string;
  kind: PromoKind;
  title: string;
  mediaUrl: string;
  linkUrl: string;
  regionId: RegionId | string;
  regionLabel: string;
  ownerUid: string;
  ownerUsername: string;
  ownerDisplayName: string;
  ownerAvatarUrl: string | null;
  coinsPaid: number;
  expiresAtMs: number;
  active: boolean;
};

function mapAd(id: string, data: Record<string, unknown>): PromotionAd {
  return {
    id,
    kind: (String(data.kind || 'marketing') as PromoKind) || 'marketing',
    title: String(data.title || 'Promoción'),
    mediaUrl: String(data.mediaUrl || ''),
    linkUrl: String(data.linkUrl || ''),
    regionId: String(data.regionId || 'nacional'),
    regionLabel: String(data.regionLabel || 'Colombia'),
    ownerUid: String(data.ownerUid || ''),
    ownerUsername: String(data.ownerUsername || ''),
    ownerDisplayName: String(data.ownerDisplayName || data.ownerUsername || ''),
    ownerAvatarUrl: (data.ownerAvatarUrl as string | null) ?? null,
    coinsPaid: Number(data.coinsPaid || 0),
    expiresAtMs: Number(data.expiresAtMs || 0),
    active: data.active !== false,
  };
}

export function listenActivePromotions(
  regionId: string | null | undefined,
  onChange: (ads: PromotionAd[]) => void,
): Unsubscribe {
  const col = collection(db, 'promotions');
  const q = query(col, where('active', '==', true), limit(80));
  return onSnapshot(
    q,
    (snap) => {
      const now = Date.now();
      const region = String(regionId || '').trim();
      const ads = snap.docs
        .map((item) => mapAd(item.id, item.data() as Record<string, unknown>))
        .filter((ad) => ad.expiresAtMs > now)
        .filter((ad) => {
          if (!region || region === 'nacional') return true;
          return ad.regionId === region || ad.regionId === 'nacional';
        })
        .sort((a, b) => b.coinsPaid - a.coinsPaid || b.expiresAtMs - a.expiresAtMs)
        .slice(0, 24);
      onChange(ads);
    },
    () => onChange([]),
  );
}

export async function createPromotion(input: {
  kind: PromoKind;
  title: string;
  mediaUrl: string;
  linkUrl: string;
  regionId: string;
  regionLabel: string;
  ownerUid: string;
  ownerUsername: string;
  ownerDisplayName: string;
  ownerAvatarUrl: string | null;
  coinsPaid: number;
  hours: number;
}) {
  const expiresAtMs = Date.now() + Math.max(1, input.hours) * 3600_000;
  const ref = await addDoc(collection(db, 'promotions'), {
    kind: input.kind,
    title: input.title.slice(0, 80),
    mediaUrl: input.mediaUrl.slice(0, 500),
    linkUrl: input.linkUrl.slice(0, 500),
    regionId: input.regionId,
    regionLabel: input.regionLabel,
    ownerUid: input.ownerUid,
    ownerUsername: input.ownerUsername,
    ownerDisplayName: input.ownerDisplayName,
    ownerAvatarUrl: input.ownerAvatarUrl,
    coinsPaid: input.coinsPaid,
    hours: input.hours,
    expiresAtMs,
    active: true,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
  return { id: ref.id, expiresAtMs };
}

/** Fallback one-shot si el listener falla. */
export async function listActivePromotions(regionId?: string) {
  const snap = await getDocs(query(collection(db, 'promotions'), where('active', '==', true), limit(80)));
  const now = Date.now();
  const region = String(regionId || '').trim();
  return snap.docs
    .map((item) => mapAd(item.id, item.data() as Record<string, unknown>))
    .filter((ad) => ad.expiresAtMs > now)
    .filter((ad) => {
      if (!region || region === 'nacional') return true;
      return ad.regionId === region || ad.regionId === 'nacional';
    })
    .slice(0, 24);
}
