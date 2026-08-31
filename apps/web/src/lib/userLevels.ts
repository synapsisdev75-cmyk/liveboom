/** Niveles LiveBoom — progreso por XP (regalos enviados + recibidos). */

import {
  avatarLayoutFromTier,
  imageWithVersion,
  insigniaSizeFromTier,
  type RemoteTierConfig,
} from './levelsConfigFirestore';
import { getActiveTiers, getConfigVersion, getTierByXp } from '../store/levelsConfigStore';

export type UserLevelInfo = {
  tier: number;
  level: number;
  slug: string;
  title: string;
  image: string;
  frameClass: string;
  frameImage: string;
  entryEffect: boolean;
  badge: string;
  minXp: number;
  maxXp: number | null;
  rangeLabel: string;
  avatarLayout: ReturnType<typeof avatarLayoutFromTier>;
  insigniaSize: ReturnType<typeof insigniaSizeFromTier>;
};

function formatXp(n: number) {
  return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString('es-CO');
}

function rangeLabelFor(tier: RemoteTierConfig): string {
  if (tier.maxXp === null) return `${formatXp(tier.minXp)}+ XP`;
  if (tier.minXp === tier.maxXp) return `${formatXp(tier.minXp)} XP`;
  return `${formatXp(tier.minXp)} – ${formatXp(tier.maxXp)} XP`;
}

export function tierFromXp(xp: number): RemoteTierConfig {
  return getTierByXp(xp);
}

export function nextTierFromXp(xp: number): RemoteTierConfig | null {
  const current = tierFromXp(xp);
  const tiers = getActiveTiers();
  return tiers.find((row) => row.tier === current.tier + 1) ?? null;
}

export function xpNeededForNext(xp: number): number {
  const next = nextTierFromXp(xp);
  if (!next) return tierFromXp(xp).minXp;
  return next.minXp;
}

export function xpToNextLevel(xp: number): number {
  const nextAt = xpNeededForNext(xp);
  const safe = Math.max(0, Math.floor(Number(xp) || 0));
  if (nextAt <= safe) return 0;
  return nextAt - safe;
}

export function xpProgressInTier(xp: number): { pct: number; span: number; within: number } {
  const safe = Math.max(0, Math.floor(Number(xp) || 0));
  const tier = tierFromXp(safe);
  const next = nextTierFromXp(safe);
  if (!next) return { pct: 100, span: 0, within: safe - tier.minXp };
  const span = next.minXp - tier.minXp;
  const within = safe - tier.minXp;
  return { pct: span > 0 ? Math.min(100, Math.round((within / span) * 100)) : 100, span, within };
}

export function levelFromXp(xp: number): UserLevelInfo {
  const tier = tierFromXp(xp);
  const version = getConfigVersion();
  return {
    tier: tier.tier,
    level: tier.tier,
    slug: tier.slug,
    title: tier.title,
    image: imageWithVersion(tier.badgeImageUrl, version),
    frameClass: tier.frameClass,
    frameImage: imageWithVersion(tier.frameImageUrl, version),
    entryEffect: tier.entryEffect,
    badge: tier.title,
    minXp: tier.minXp,
    maxXp: tier.maxXp,
    rangeLabel: rangeLabelFor(tier),
    avatarLayout: avatarLayoutFromTier(tier),
    insigniaSize: insigniaSizeFromTier(tier),
  };
}
