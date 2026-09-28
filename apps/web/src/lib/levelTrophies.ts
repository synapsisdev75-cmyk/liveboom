/** Trofeos por nivel LiveBoom — regalos a 15 Blast, solo el del nivel del remitente. */

export const LEVEL_TROPHY_COINS = 15;

export type LevelTrophyDef = {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  image: string;
  animation: string;
};

/** Solo niveles con asset publicado. */
export const LEVEL_TROPHIES: LevelTrophyDef[] = [
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

export function isLevelTrophyId(giftId: string | null | undefined): boolean {
  const id = String(giftId || '').trim().toLowerCase();
  return LEVEL_TROPHIES.some((t) => t.id === id);
}

export function trophyForLevelSlug(slug: string | null | undefined): LevelTrophyDef | null {
  const key = String(slug || '').trim().toLowerCase();
  return LEVEL_TROPHIES.find((t) => t.slug === key) ?? null;
}
