import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
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
  format?: string | null;
  packageId?: string | null;
  paymentStatus?: string | null;
  reviewStatus?: string | null;
  publishStatus?: string | null;
  startsAtMs?: number | null;
  impressions?: number;
  clicks?: number;
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
    coinsPaid: Number(data.amountPaidCop || data.coinsPaid || 0),
    expiresAtMs: Number(data.expiresAtMs || 0),
    active: data.active !== false,
    format: data.format ? String(data.format) : null,
    packageId: data.packageId ? String(data.packageId) : null,
    paymentStatus: data.paymentStatus ? String(data.paymentStatus) : null,
    reviewStatus: data.reviewStatus ? String(data.reviewStatus) : null,
    publishStatus: data.publishStatus ? String(data.publishStatus) : null,
    startsAtMs: data.startsAtMs == null ? null : Number(data.startsAtMs),
    impressions: Number(data.impressions || 0),
    clicks: Number(data.clicks || 0),
  };
}

export function isPromotionDeliverable(ad: PromotionAd, now = Date.now()) {
  if (!ad.active) return false;
  if (ad.expiresAtMs <= now) return false;
  if (ad.paymentStatus && !['paid', 'simulated'].includes(ad.paymentStatus)) return false;
  if (ad.reviewStatus && ad.reviewStatus !== 'approved') return false;
  return true;
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
        .filter((ad) => isPromotionDeliverable(ad, now))
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

export function listenMyPromotions(
  ownerUid: string | null | undefined,
  onChange: (ads: PromotionAd[]) => void,
): Unsubscribe {
  if (!ownerUid) {
    onChange([]);
    return () => undefined;
  }
  const q = query(collection(db, 'promotions'), where('ownerUid', '==', ownerUid), limit(40));
  return onSnapshot(
    q,
    (snap) => {
      const ads = snap.docs
        .map((item) => mapAd(item.id, item.data() as Record<string, unknown>))
        .sort((a, b) => Number(b.startsAtMs || b.expiresAtMs) - Number(a.startsAtMs || a.expiresAtMs));
      onChange(ads);
    },
    () => onChange([]),
  );
}

export async function updatePromotion(
  promoId: string,
  patch: Partial<Pick<PromotionAd, 'title' | 'linkUrl' | 'mediaUrl' | 'kind'>>,
) {
  const data: {
    title?: string;
    linkUrl?: string;
    mediaUrl?: string;
    kind?: PromoKind;
  } = {};
  if (patch.title !== undefined) data.title = patch.title.slice(0, 80);
  if (patch.linkUrl !== undefined) data.linkUrl = patch.linkUrl.slice(0, 500);
  if (patch.mediaUrl !== undefined) data.mediaUrl = patch.mediaUrl.slice(0, 500);
  if (patch.kind !== undefined) data.kind = patch.kind;
  if (Object.keys(data).length === 0) return;
  await updateDoc(doc(db, 'promotions', promoId), data);
}

export async function deactivatePromotion(promoId: string) {
  await updateDoc(doc(db, 'promotions', promoId), { active: false });
}

/** Fallback one-shot si el listener falla. */
export async function listActivePromotions(regionId?: string) {
  const snap = await getDocs(query(collection(db, 'promotions'), where('active', '==', true), limit(80)));
  const now = Date.now();
  const region = String(regionId || '').trim();
  return snap.docs
    .map((item) => mapAd(item.id, item.data() as Record<string, unknown>))
    .filter((ad) => isPromotionDeliverable(ad, now))
    .filter((ad) => {
      if (!region || region === 'nacional') return true;
      return ad.regionId === region || ad.regionId === 'nacional';
    })
    .slice(0, 24);
}
