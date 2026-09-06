import type { AppearanceAccent, AppearanceTheme } from './appearance';

export type SemanticTokenName =
  | '--bg-primary'
  | '--bg-secondary'
  | '--bg-elevated'
  | '--surface-primary'
  | '--surface-secondary'
  | '--surface-hover'
  | '--surface-selected'
  | '--text-primary'
  | '--text-secondary'
  | '--text-muted'
  | '--text-disabled'
  | '--text-inverse'
  | '--accent-primary'
  | '--accent-secondary'
  | '--accent-soft'
  | '--accent-hover'
  | '--accent-active'
  | '--border-default'
  | '--border-soft'
  | '--border-strong'
  | '--link-default'
  | '--link-hover'
  | '--success'
  | '--warning'
  | '--error'
  | '--info'
  | '--focus-ring';

export type SemanticTokens = Record<SemanticTokenName, string>;

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

type Seed = {
  bg: string;
  bg2: string;
  elevated: string;
  surface: string;
  surface2: string;
  accent: string;
  accent2: string;
};

const ACCENT_SEEDS: Record<AppearanceAccent, { dark: Seed; light: Seed }> = {
  default: {
    dark: {
      bg: '#0a0a0b',
      bg2: '#0a0b10',
      elevated: '#131417',
      surface: '#15161e',
      surface2: '#1b1c26',
      accent: '#ec4899',
      accent2: '#22d3ee',
    },
    light: {
      bg: '#f3f4f7',
      bg2: '#f7f7fa',
      elevated: '#ffffff',
      surface: '#ffffff',
      surface2: '#eef0f4',
      accent: '#c026d3',
      accent2: '#0e7490',
    },
  },
  pink: {
    dark: {
      bg: '#0d090b',
      bg2: '#140c11',
      elevated: '#1a1116',
      surface: '#1e141a',
      surface2: '#271820',
      accent: '#f472b6',
      accent2: '#fb7185',
    },
    light: {
      bg: '#fdf4f8',
      bg2: '#fff7fb',
      elevated: '#ffffff',
      surface: '#ffffff',
      surface2: '#fce7f1',
      accent: '#be185d',
      accent2: '#9d174d',
    },
  },
  blue: {
    dark: {
      bg: '#080b0e',
      bg2: '#0b1218',
      elevated: '#101820',
      surface: '#12202a',
      surface2: '#17303c',
      accent: '#22d3ee',
      accent2: '#38bdf8',
    },
    light: {
      bg: '#f0f9fc',
      bg2: '#f5fbfe',
      elevated: '#ffffff',
      surface: '#ffffff',
      surface2: '#e0f2fe',
      accent: '#0369a1',
      accent2: '#0e7490',
    },
  },
  green: {
    dark: {
      bg: '#080c0a',
      bg2: '#0c1410',
      elevated: '#101a16',
      surface: '#13201a',
      surface2: '#173026',
      accent: '#34d399',
      accent2: '#2dd4bf',
    },
    light: {
      bg: '#f1faf6',
      bg2: '#f6fdf9',
      elevated: '#ffffff',
      surface: '#ffffff',
      surface2: '#d1fae5',
      accent: '#047857',
      accent2: '#0f766e',
    },
  },
  orange: {
    dark: {
      bg: '#0d0a07',
      bg2: '#16100b',
      elevated: '#1c1410',
      surface: '#221810',
      surface2: '#2c1e12',
      accent: '#fb923c',
      accent2: '#fbbf24',
    },
    light: {
      bg: '#fff7f1',
      bg2: '#fffaf5',
      elevated: '#ffffff',
      surface: '#ffffff',
      surface2: '#ffedd5',
      accent: '#c2410c',
      accent2: '#b45309',
    },
  },
  red: {
    dark: {
      bg: '#0e0909',
      bg2: '#160c0c',
      elevated: '#1c1010',
      surface: '#241414',
      surface2: '#2e1818',
      accent: '#f87171',
      accent2: '#fb7185',
    },
    light: {
      bg: '#fef6f6',
      bg2: '#fff8f8',
      elevated: '#ffffff',
      surface: '#ffffff',
      surface2: '#fee2e2',
      accent: '#b91c1c',
      accent2: '#be123c',
    },
  },
  gold: {
    dark: {
      bg: '#0c0b08',
      bg2: '#14130c',
      elevated: '#1a1810',
      surface: '#201c12',
      surface2: '#2a2416',
      accent: '#f5c84c',
      accent2: '#fbbf24',
    },
    light: {
      bg: '#faf7ef',
      bg2: '#fcfaf3',
      elevated: '#ffffff',
      surface: '#ffffff',
      surface2: '#fef3c7',
      accent: '#a16207',
      accent2: '#92400e',
    },
  },
  violet: {
    dark: {
      bg: '#0b0910',
      bg2: '#120e18',
      elevated: '#181422',
      surface: '#1c1628',
      surface2: '#261e34',
      accent: '#a855f7',
      accent2: '#c084fc',
    },
    light: {
      bg: '#f7f4fc',
      bg2: '#faf8fe',
      elevated: '#ffffff',
      surface: '#ffffff',
      surface2: '#ede9fe',
      accent: '#6d28d9',
      accent2: '#5b21b6',
    },
  },
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function parseHex(hex: string): Rgb {
  const raw = hex.replace('#', '').trim();
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : raw.padEnd(6, '0').slice(0, 6);
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function mix(a: string, b: string, t: number): string {
  const A = parseHex(a);
  const B = parseHex(b);
  return toHex({
    r: A.r + (B.r - A.r) * t,
    g: A.g + (B.g - A.g) * t,
    b: A.b + (B.b - A.b) * t,
  });
}

function srgbToLin(c: number) {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}

export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const S = s / 100;
  const L = l / 100;
  const C = (1 - Math.abs(2 * L - 1)) * S;
  const X = C * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - C / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = C;
    g = X;
  } else if (h < 120) {
    r = X;
    g = C;
  } else if (h < 180) {
    g = C;
    b = X;
  } else if (h < 240) {
    g = X;
    b = C;
  } else if (h < 300) {
    r = X;
    b = C;
  } else {
    r = C;
    b = X;
  }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function withLightness(hex: string, l: number): string {
  const hsl = rgbToHsl(parseHex(hex));
  return toHex(hslToRgb({ ...hsl, l: clamp(l, 4, 96) }));
}

export function surfaceKind(hex: string): 'dark' | 'light' | 'saturated' {
  const lum = relativeLuminance(hex);
  const { s } = rgbToHsl(parseHex(hex));
  if (s > 55 && lum > 0.18 && lum < 0.72) return 'saturated';
  return lum > 0.45 ? 'light' : 'dark';
}

export function textOnSurface(bg: string): string {
  const kind = surfaceKind(bg);
  const seed = kind === 'light' || (kind === 'saturated' && relativeLuminance(bg) > 0.42) ? '#18181b' : '#fafafa';
  return ensureContrast(seed, bg, 4.5);
}

export function ensureContrast(fg: string, bg: string, minRatio: number): string {
  if (contrastRatio(fg, bg) >= minRatio) return fg;
  const bgLum = relativeLuminance(bg);
  const hsl = rgbToHsl(parseHex(fg));
  const lighten = bgLum < 0.45;
  for (let step = 0; step < 28; step += 1) {
    hsl.l = clamp(hsl.l + (lighten ? 3.2 : -3.2), 4, 96);
    if (!lighten && hsl.s > 20) hsl.s = Math.max(18, hsl.s - 1.5);
    const next = toHex(hslToRgb(hsl));
    if (contrastRatio(next, bg) >= minRatio) return next;
  }
  return lighten ? '#fafafa' : '#18181b';
}

function alpha(hex: string, a: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(a, 0, 1)})`;
}

export const DEFAULT_INTENSITY = 50;

export function clampIntensity(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_INTENSITY;
  return Math.min(100, Math.max(0, n));
}

/** 50 = paleta LiveBoom. Oscuro: 0 carbón suave → 100 negro intenso. Claro: 0 gris suave → 100 blanco limpio. */
export function applyThemeIntensity(hex: string, theme: AppearanceTheme, intensity: number): string {
  const t = (clampIntensity(intensity) - DEFAULT_INTENSITY) / DEFAULT_INTENSITY;
  if (theme === 'dark') {
    if (t >= 0) return mix(hex, '#000000', t * 0.88);
    return mix(hex, '#4b4b53', -t * 0.58);
  }
  if (t >= 0) return mix(hex, '#ffffff', t * 0.92);
  return mix(hex, '#c5c5cc', -t * 0.5);
}

export function resolveSemanticTokens(
  theme: AppearanceTheme,
  accent: AppearanceAccent,
  intensity = 50,
): SemanticTokens {
  const seed = ACCENT_SEEDS[accent][theme];
  const dark = theme === 'dark';
  const level = clampIntensity(intensity);
  const bg = applyThemeIntensity(seed.bg, theme, level);
  const bg2 = applyThemeIntensity(seed.bg2, theme, level);
  const elevated = applyThemeIntensity(seed.elevated, theme, level);
  const surface = applyThemeIntensity(seed.surface, theme, level);
  const surface2 = applyThemeIntensity(seed.surface2, theme, level);

  const textPrimary = ensureContrast(dark ? '#f4f4f5' : '#18181b', bg, 7);
  const textSecondary = ensureContrast(dark ? '#d4d4d8' : '#3f3f46', bg, 4.6);
  const textMuted = ensureContrast(dark ? '#a1a1aa' : '#52525b', bg, 4.5);
  const textDisabled = ensureContrast(dark ? '#71717a' : '#a1a1aa', bg, 3);
  const accentPrimary = ensureContrast(seed.accent, bg, 3);
  const accentSecondary = ensureContrast(seed.accent2, bg, 3);
  const linkDefault = ensureContrast(seed.accent2, bg, 4.5);
  const linkHover = ensureContrast(mix(seed.accent2, dark ? '#ffffff' : '#000000', 0.22), bg, 4.5);
  const textInverse = textOnSurface(accentPrimary);
  const success = ensureContrast(dark ? '#34d399' : '#047857', bg, 4.5);
  const warning = ensureContrast(dark ? '#fbbf24' : '#b45309', bg, 4.5);
  const error = ensureContrast(dark ? '#f87171' : '#b91c1c', bg, 4.5);
  const info = ensureContrast(accentSecondary, bg, 4.5);

  return {
    '--bg-primary': bg,
    '--bg-secondary': bg2,
    '--bg-elevated': elevated,
    '--surface-primary': surface,
    '--surface-secondary': surface2,
    '--surface-hover': mix(surface, accentPrimary, dark ? 0.12 : 0.08),
    '--surface-selected': mix(surface, accentPrimary, dark ? 0.2 : 0.14),
    '--text-primary': textPrimary,
    '--text-secondary': textSecondary,
    '--text-muted': textMuted,
    '--text-disabled': textDisabled,
    '--text-inverse': textInverse,
    '--accent-primary': accentPrimary,
    '--accent-secondary': accentSecondary,
    '--accent-soft': alpha(accentPrimary, dark ? 0.18 : 0.12),
    '--accent-hover': withLightness(accentPrimary, rgbToHsl(parseHex(accentPrimary)).l + (dark ? 8 : -6)),
    '--accent-active': withLightness(accentPrimary, rgbToHsl(parseHex(accentPrimary)).l + (dark ? -6 : 6)),
    '--border-default': alpha(textPrimary, dark ? 0.12 : 0.14),
    '--border-soft': alpha(textPrimary, dark ? 0.08 : 0.1),
    '--border-strong': alpha(accentPrimary, 0.55),
    '--link-default': linkDefault,
    '--link-hover': linkHover,
    '--success': success,
    '--warning': warning,
    '--error': error,
    '--info': info,
    '--focus-ring': accentSecondary,
  };
}

const LEGACY_ALIASES: Record<string, SemanticTokenName> = {
  '--lb-bg': '--bg-primary',
  '--lb-bg-sidebar': '--bg-secondary',
  '--lb-surface': '--surface-primary',
  '--lb-surface-2': '--surface-secondary',
  '--lb-text': '--text-primary',
  '--lb-text-muted': '--text-muted',
  '--lb-line': '--border-default',
  '--lb-accent-primary': '--accent-primary',
  '--lb-accent-secondary': '--accent-secondary',
  '--lb-accent-mid': '--accent-primary',
  '--lb-accent-text': '--link-default',
  '--lb-accent-border': '--border-strong',
  '--lb-accent-soft': '--accent-soft',
  '--lb-nav-active-fill': '--surface-selected',
};

export function tokensToCssMap(tokens: SemanticTokens): Record<string, string> {
  const map: Record<string, string> = { ...tokens };
  for (const [alias, source] of Object.entries(LEGACY_ALIASES)) {
    map[alias] = tokens[source];
  }
  map['--lb-accent-glow'] = tokens['--accent-soft'];
  map['--text-on-accent'] = tokens['--text-inverse'];
  return map;
}

export function applySemanticTokens(target: HTMLElement, tokens: SemanticTokens) {
  const map = tokensToCssMap(tokens);
  for (const [name, value] of Object.entries(map)) {
    target.style.setProperty(name, value);
  }
}
