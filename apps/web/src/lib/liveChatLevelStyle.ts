import { levelFromXp } from './userLevels';

/** Avatar genérico LiveBoom cuando el usuario no tiene foto de perfil. */
export const LIVE_CHAT_DEFAULT_AVATAR = '/brand/icon-1024.png';

export type UserLevelStyle = {
  slug: string;
  title: string;
  primaryColor: string;
  secondaryColor: string;
  avatarBorder: string;
  usernameColor: string;
  badgeStyle: {
    background: string;
    border: string;
    color: string;
  };
  glow: string;
  badgeImage: string;
  premium: boolean;
};

type LevelPalette = {
  primary: string;
  secondary: string;
  glow: string;
};

/** Paleta alineada a los `frameClass` oficiales de `defaultLevelTiers`. */
const LEVEL_PALETTES: Record<string, LevelPalette> = {
  chispa: { primary: '#c4b5fd', secondary: '#a1a1aa', glow: 'rgba(196,181,253,0.28)' },
  mecha: { primary: '#f59e0b', secondary: '#fbbf24', glow: 'rgba(245,158,11,0.35)' },
  boom: { primary: '#fb923c', secondary: '#fdba74', glow: 'rgba(251,146,60,0.35)' },
  fuego: { primary: '#f87171', secondary: '#fb7185', glow: 'rgba(248,113,113,0.4)' },
  impacto: { primary: '#e879f9', secondary: '#f0abfc', glow: 'rgba(232,121,249,0.4)' },
  estrella: { primary: '#facc15', secondary: '#fde047', glow: 'rgba(250,204,21,0.45)' },
  corona: { primary: '#a78bfa', secondary: '#c4b5fd', glow: 'rgba(167,139,250,0.45)' },
  diamante: { primary: '#22d3ee', secondary: '#67e8f9', glow: 'rgba(34,211,238,0.45)' },
  titan: { primary: '#34d399', secondary: '#6ee7b7', glow: 'rgba(52,211,153,0.5)' },
  leyenda: { primary: '#fcd34d', secondary: '#fde68a', glow: 'rgba(252,211,77,0.55)' },
  pro: { primary: '#00f0ff', secondary: '#e879f9', glow: 'rgba(0,240,255,0.55)' },
};

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return `rgba(161,161,170,${alpha})`;
  const n = Number.parseInt(raw, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Estilo visual del chat en vivo según el XP/nivel real (no aleatorio, no por mensaje).
 */
export function getUserLevelStyle(levelXp: number | null | undefined): UserLevelStyle {
  const info = levelFromXp(Math.max(0, Math.floor(Number(levelXp) || 0)));
  const palette = LEVEL_PALETTES[info.slug] ?? LEVEL_PALETTES.mecha!;
  const premium = info.tier >= 8;
  return {
    slug: info.slug,
    title: info.title,
    primaryColor: palette.primary,
    secondaryColor: palette.secondary,
    avatarBorder: palette.primary,
    usernameColor: palette.primary,
    badgeStyle: {
      background: hexToRgba(palette.primary, 0.16),
      border: hexToRgba(palette.primary, 0.55),
      color: palette.primary,
    },
    glow: palette.glow,
    badgeImage: info.image,
    premium,
  };
}
