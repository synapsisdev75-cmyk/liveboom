/**
 * Trofeos por nivel — 15 Blast. Solo el slug del remitente puede enviarlo.
 */

const LEVEL_TROPHY_COINS = 15;

/** Rangos alineados con defaultLevelTiers del frontend. */
const TIER_RANGES = [
  { slug: 'mecha', minXp: 0, maxXp: 100 },
  { slug: 'boom', minXp: 101, maxXp: 299 },
  { slug: 'fuego', minXp: 300, maxXp: 599 },
  { slug: 'impacto', minXp: 600, maxXp: 999 },
  { slug: 'estrella', minXp: 1000, maxXp: 1999 },
  { slug: 'corona', minXp: 2000, maxXp: 3499 },
  { slug: 'diamante', minXp: 3500, maxXp: 4999 },
  { slug: 'titan', minXp: 5000, maxXp: 7499 },
  { slug: 'leyenda', minXp: 7500, maxXp: 9999 },
  { slug: 'pro', minXp: 10000, maxXp: null },
];

const LEVEL_TROPHIES = [
  {
    id: 'trophy_mecha',
    slug: 'mecha',
    name: 'Trofeo Mecha',
    emoji: '🏆',
    image: '/gifts/trophy-mecha.png?v=1',
    animation: 'Trofeo de nivel MECHA',
  },
  {
    id: 'trophy_boom',
    slug: 'boom',
    name: 'Trofeo Boom',
    emoji: '🏆',
    image: '/gifts/trophy-boom.png?v=1',
    animation: 'Trofeo de nivel BOOM',
  },
  {
    id: 'trophy_fuego',
    slug: 'fuego',
    name: 'Trofeo Fuego',
    emoji: '🏆',
    image: '/gifts/trophy-fuego.png?v=1',
    animation: 'Trofeo de nivel FUEGO',
  },
  {
    id: 'trophy_impacto',
    slug: 'impacto',
    name: 'Trofeo Impacto',
    emoji: '🏆',
    image: '/gifts/trophy-impacto.png?v=1',
    animation: 'Trofeo de nivel IMPACTO',
  },
  {
    id: 'trophy_estrella',
    slug: 'estrella',
    name: 'Trofeo Estrella',
    emoji: '🏆',
    image: '/gifts/trophy-estrella.png?v=1',
    animation: 'Trofeo de nivel ESTRELLA',
  },
];

function levelSlugFromXp(xp) {
  const safe = Math.max(0, Math.floor(Number(xp) || 0));
  for (const tier of TIER_RANGES) {
    if (tier.maxXp == null) {
      if (safe >= tier.minXp) return tier.slug;
      continue;
    }
    if (safe >= tier.minXp && safe <= tier.maxXp) return tier.slug;
  }
  return 'mecha';
}

function trophyGiftPayload(def) {
  return {
    id: def.id,
    name: def.name,
    emoji: def.emoji,
    image: def.image,
    video: null,
    coins: LEVEL_TROPHY_COINS,
    level: 1,
    animation: def.animation,
    animScale: 0.55,
    liveOnly: false,
    deeparFilter: null,
    enabled: true,
    placements: ['live', 'post', 'boom_clip', 'flashboom', 'call', 'chat'],
    face: null,
    requiredLevelSlug: def.slug,
  };
}

function isLevelTrophyId(giftId) {
  const id = String(giftId || '')
    .trim()
    .toLowerCase();
  return LEVEL_TROPHIES.some((t) => t.id === id);
}

module.exports = {
  LEVEL_TROPHY_COINS,
  LEVEL_TROPHIES,
  TIER_RANGES,
  levelSlugFromXp,
  trophyGiftPayload,
  isLevelTrophyId,
};
