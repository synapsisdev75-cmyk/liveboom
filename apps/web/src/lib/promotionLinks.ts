import type { PromotionAd } from './promotionsFirestore';

export function promotionHref(ad: PromotionAd | { linkUrl: string; ownerUsername: string }) {
  const raw = String(ad.linkUrl || '').trim();
  if (!raw) return `/u/${encodeURIComponent(ad.ownerUsername)}`;
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) return raw;
  return `/${raw}`;
}

export function isPromotionVideoUrl(url: string) {
  return /\.(mp4|webm)(\?|$)/i.test(url) || url.includes('video');
}
