/** Tiers por defecto (fallback si Firestore no tiene config). */
export const LEVEL_BADGE_VERSION = '13';

export type DefaultTierSeed = {
  tier: number;
  slug: string;
  title: string;
  minXp: number;
  maxXp: number | null;
  frameClass: string;
  entryEffect: boolean;
  avatarTop: number;
  avatarLeft: number;
  avatarWidth: number;
  avatarHeight: number;
  insigniaWidthMobile: number;
  insigniaHeightMobile: number;
  insigniaWidthDesktop: number;
  insigniaHeightDesktop: number;
};

function badgeUrl(slug: string) {
  return `/levels/${slug}.png?v=${LEVEL_BADGE_VERSION}`;
}

function frameUrl(slug: string) {
  return `/levels/frames/${slug}.png?v=${LEVEL_BADGE_VERSION}`;
}

/** Animación hover/toque (solo tiers con asset exportado). */
function badgeAnimUrls(slug: string): { badgeAnimWebm: string | null; badgeAnimMp4: string | null } {
  if (slug === 'leyenda') {
    return {
      badgeAnimWebm: `/levels/leyenda-anim.webm?v=${LEVEL_BADGE_VERSION}`,
      badgeAnimMp4: `/levels/leyenda-anim.mp4?v=${LEVEL_BADGE_VERSION}`,
    };
  }
  return { badgeAnimWebm: null, badgeAnimMp4: null };
}

const PLATED = { avatarTop: 19, avatarLeft: 19, avatarWidth: 63, avatarHeight: 61 };
const CLASSIC = { avatarTop: 8.5, avatarLeft: 18, avatarWidth: 64, avatarHeight: 64 };
const INSIGNIA = {
  insigniaWidthMobile: 76,
  insigniaHeightMobile: 92,
  insigniaWidthDesktop: 88,
  insigniaHeightDesktop: 108,
};

export const DEFAULT_TIER_SEEDS: DefaultTierSeed[] = [
  {
    tier: 0,
    slug: 'mecha',
    title: 'MECHA',
    minXp: 0,
    maxXp: 100,
    frameClass: 'ring-2 ring-amber-500/60',
    entryEffect: false,
    ...PLATED,
    ...INSIGNIA,
  },
  {
    tier: 1,
    slug: 'boom',
    title: 'BOOM',
    minXp: 101,
    maxXp: 299,
    frameClass: 'ring-2 ring-orange-400/70',
    entryEffect: false,
    ...PLATED,
    ...INSIGNIA,
  },
  {
    tier: 2,
    slug: 'fuego',
    title: 'FUEGO',
    minXp: 300,
    maxXp: 599,
    frameClass: 'ring-2 ring-red-400/75',
    entryEffect: true,
    ...CLASSIC,
    ...INSIGNIA,
  },
  {
    tier: 3,
    slug: 'impacto',
    title: 'IMPACTO',
    minXp: 600,
    maxXp: 999,
    frameClass: 'ring-2 ring-fuchsia-400/80 shadow-[0_0_12px_rgba(232,121,249,0.35)]',
    entryEffect: true,
    ...CLASSIC,
    ...INSIGNIA,
  },
  {
    tier: 4,
    slug: 'estrella',
    title: 'ESTRELLA',
    minXp: 1000,
    maxXp: 1999,
    frameClass: 'ring-2 ring-yellow-400/85 shadow-[0_0_12px_rgba(250,204,21,0.4)]',
    entryEffect: true,
    ...CLASSIC,
    ...INSIGNIA,
  },
  {
    tier: 5,
    slug: 'corona',
    title: 'CORONA',
    minXp: 2000,
    maxXp: 3499,
    frameClass: 'ring-2 ring-violet-400/85 shadow-[0_0_14px_rgba(167,139,250,0.45)]',
    entryEffect: true,
    ...CLASSIC,
    ...INSIGNIA,
  },
  {
    tier: 6,
    slug: 'diamante',
    title: 'DIAMANTE',
    minXp: 3500,
    maxXp: 4999,
    frameClass: 'ring-2 ring-cyan-400/85 shadow-[0_0_14px_rgba(34,211,238,0.45)]',
    entryEffect: true,
    ...CLASSIC,
    ...INSIGNIA,
  },
  {
    tier: 7,
    slug: 'titan',
    title: 'TITAN',
    minXp: 5000,
    maxXp: 7499,
    frameClass: 'ring-2 ring-emerald-400/85 shadow-[0_0_16px_rgba(52,211,153,0.5)]',
    entryEffect: true,
    ...CLASSIC,
    ...INSIGNIA,
  },
  {
    tier: 8,
    slug: 'leyenda',
    title: 'LEYENDA',
    minXp: 7500,
    maxXp: 9999,
    frameClass: 'ring-2 ring-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.55)]',
    entryEffect: true,
    ...CLASSIC,
    ...INSIGNIA,
  },
  {
    tier: 9,
    slug: 'pro',
    title: 'PRO',
    minXp: 10000,
    maxXp: null,
    frameClass:
      'ring-2 ring-gradient-to-r from-amber-300 via-fuchsia-400 to-cyan-400 shadow-[0_0_20px_rgba(0,240,255,0.55)]',
    entryEffect: true,
    ...CLASSIC,
    ...INSIGNIA,
  },
];

export function seedToUrls(seed: DefaultTierSeed) {
  return {
    frameImageUrl: frameUrl(seed.slug),
    badgeImageUrl: badgeUrl(seed.slug),
    ...badgeAnimUrls(seed.slug),
  };
}
