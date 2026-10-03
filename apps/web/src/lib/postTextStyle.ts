import { useEffect, type CSSProperties } from 'react';

/** Tipografía y color del texto de una Publicación (contentType post). */

const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Anton&family=Bangers&family=Lobster&family=Pacifico&family=Permanent+Marker&display=swap';
const FONT_LINK_ID = 'lb-post-text-fonts';

export const POST_TEXT_FONTS = [
  { id: 'clasica', label: 'Clásica', family: null },
  { id: 'impacto', label: 'Impacto', family: '"Anton", Impact, "Arial Black", sans-serif' },
  { id: 'comic', label: 'Cómic', family: '"Bangers", "Comic Sans MS", cursive' },
  { id: 'manuscrita', label: 'Manuscrita', family: '"Pacifico", "Brush Script MT", cursive' },
  { id: 'elegante', label: 'Elegante', family: '"Lobster", Georgia, serif' },
  { id: 'marcador', label: 'Marcador', family: '"Permanent Marker", "Comic Sans MS", cursive' },
  { id: 'maquina', label: 'Máquina', family: '"Courier New", ui-monospace, monospace' },
] as const;

/** Tonos medios: legibles sobre fondo claro y oscuro. `auto` = color del tema. */
export const POST_TEXT_COLORS = [
  { id: 'auto', label: 'Automático', value: null },
  { id: 'rojo', label: 'Rojo', value: '#dc2626' },
  { id: 'naranja', label: 'Naranja', value: '#ea580c' },
  { id: 'ambar', label: 'Ámbar', value: '#d97706' },
  { id: 'verde', label: 'Verde', value: '#16a34a' },
  { id: 'cian', label: 'Cian', value: '#0891b2' },
  { id: 'azul', label: 'Azul', value: '#2563eb' },
  { id: 'violeta', label: 'Violeta', value: '#9333ea' },
  { id: 'rosa', label: 'Rosa', value: '#db2777' },
] as const;

export type PostTextFontId = (typeof POST_TEXT_FONTS)[number]['id'];
export type PostTextColorId = (typeof POST_TEXT_COLORS)[number]['id'];
export type PostTextStyle = { font: PostTextFontId; color: PostTextColorId };

export const DEFAULT_POST_TEXT_STYLE: PostTextStyle = { font: 'clasica', color: 'auto' };

export function postTextFont(id: string | null | undefined) {
  return POST_TEXT_FONTS.find((font) => font.id === id) ?? POST_TEXT_FONTS[0];
}

export function postTextColor(id: string | null | undefined) {
  return POST_TEXT_COLORS.find((color) => color.id === id) ?? POST_TEXT_COLORS[0];
}

export function isDefaultPostTextStyle(style: PostTextStyle | null | undefined): boolean {
  return !style || (postTextFont(style.font).family == null && postTextColor(style.color).value == null);
}

/** Lee `textStyle` de Firestore; devuelve null si falta, no es válido o es el estilo por defecto. */
export function parsePostTextStyle(raw: unknown): PostTextStyle | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const style: PostTextStyle = {
    font: postTextFont(typeof data.font === 'string' ? data.font : null).id,
    color: postTextColor(typeof data.color === 'string' ? data.color : null).id,
  };
  return isDefaultPostTextStyle(style) ? null : style;
}

/** Estilo inline: fuente heredable + `--lb-post-text-color` (las reglas CSS hacen fallback al tema). */
export function postTextStyleCss(style: PostTextStyle | null | undefined): CSSProperties | undefined {
  if (isDefaultPostTextStyle(style)) return undefined;
  const family = postTextFont(style?.font).family;
  const color = postTextColor(style?.color).value;
  const css: Record<string, string> = {};
  if (family) css.fontFamily = family;
  if (color) css['--lb-post-text-color'] = color;
  return css as CSSProperties;
}

export function ensurePostTextFonts() {
  if (typeof document === 'undefined' || document.getElementById(FONT_LINK_ID)) return;
  const link = document.createElement('link');
  link.id = FONT_LINK_ID;
  link.rel = 'stylesheet';
  link.href = FONT_CSS;
  document.head.appendChild(link);
}

export function usePostTextFonts(active: boolean) {
  useEffect(() => {
    if (active) ensurePostTextFonts();
  }, [active]);
}
