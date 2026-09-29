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
  {
    id: 'trophy_corona',
    slug: 'corona',
    name: 'Trofeo Corona',
    emoji: '🏆',
    image: '/gifts/trophy-corona.png?v=2',
    animation: 'Trofeo de nivel CORONA',
  },
  {
    id: 'trophy_diamante',
    slug: 'diamante',
    name: 'Trofeo Diamante',
    emoji: '🏆',
    image: '/gifts/trophy-diamante.png?v=2',
    animation: 'Trofeo de nivel DIAMANTE',
  },
  {
    id: 'trophy_titan',
    slug: 'titan',
    name: 'Trofeo Titán',
    emoji: '🏆',
    image: '/gifts/trophy-titan.png?v=2',
    animation: 'Trofeo de nivel TITAN',
  },
  {
    id: 'trophy_leyenda',
    slug: 'leyenda',
    name: 'Trofeo Leyenda',
    emoji: '🏆',
    image: '/gifts/trophy-leyenda.png?v=2',
    animation: 'Trofeo de nivel LEYENDA',
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
