import type { ChatFontChoice } from './types';

/** Familias de Google Fonts (Inter y Plus Jakarta Sans ya vienen en index.html). */
const GOOGLE_SPECS: Record<string, string> = {
  'Space Grotesk': 'Space+Grotesk:wght@400;500;600;700',
  Rajdhani: 'Rajdhani:wght@500;600;700',
  Manrope: 'Manrope:wght@400;500;600;700;800',
  'Barlow Condensed': 'Barlow+Condensed:wght@500;600;700',
  Archivo: 'Archivo:wght@400;500;600;700',
  'DM Sans': 'DM+Sans:wght@400;500;600;700',
  'Exo 2': 'Exo+2:wght@400;500;600;700',
  Oxanium: 'Oxanium:wght@400;500;600;700',
  'Cormorant Garamond': 'Cormorant+Garamond:wght@500;600;700',
  Nunito: 'Nunito:wght@400;600;700;800',
  Quicksand: 'Quicksand:wght@500;600;700',
  Sora: 'Sora:wght@400;500;600;700',
};

const SERIF = new Set(['Cormorant Garamond']);

export const LIVEBOOM_FONT_STACK = "Inter, 'Plus Jakarta Sans', system-ui, sans-serif";

export const CHAT_FONT_FAMILIES = Object.keys(GOOGLE_SPECS).concat('Inter').sort();

export function fontStack(family: string): string {
  if (!family || family === 'LiveBoom') return LIVEBOOM_FONT_STACK;
  const quoted = `'${family.replace(/'/g, '')}'`;
  return SERIF.has(family)
    ? `${quoted}, Georgia, 'Times New Roman', serif`
    : `${quoted}, Inter, system-ui, sans-serif`;
}

export const CHAT_FONT_CHOICES: Array<{ id: ChatFontChoice; label: string; family: string | null }> = [
  { id: 'theme', label: 'Fuente del tema', family: null },
  { id: 'liveboom', label: 'LiveBoom', family: 'LiveBoom' },
  { id: 'inter', label: 'Inter', family: 'Inter' },
  { id: 'sora', label: 'Sora', family: 'Sora' },
  { id: 'manrope', label: 'Manrope', family: 'Manrope' },
  { id: 'nunito', label: 'Nunito', family: 'Nunito' },
  { id: 'space-grotesk', label: 'Space Grotesk', family: 'Space Grotesk' },
];

export function familyForChoice(choice: ChatFontChoice): string | null {
  return CHAT_FONT_CHOICES.find((item) => item.id === choice)?.family ?? null;
}

const requested = new Set<string>();

/** Carga diferida: solo se piden las familias que se van a mostrar. */
export function ensureChatFonts(families: Array<string | null | undefined>) {
  if (typeof document === 'undefined') return;
  for (const family of families) {
    if (!family || requested.has(family)) continue;
    const spec = GOOGLE_SPECS[family];
    if (!spec) continue;
    requested.add(family);
    const id = `lb-chat-font-${family.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (document.getElementById(id)) continue;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
    document.head.appendChild(link);
  }
}
