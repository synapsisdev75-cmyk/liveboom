import { useEffect, type CSSProperties } from 'react';

/**
 * Estilo de texto elegido con el botón "Aa": Publicación, comentarios y chats
 * (Mensajes, Grupos, LIVE). Se aplica a todo el texto del mensaje.
 */

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

export const POST_TEXT_FLAGS = [
  { id: 'bold', label: 'Negrita' },
  { id: 'italic', label: 'Cursiva' },
  { id: 'underline', label: 'Subrayado' },
  { id: 'strike', label: 'Tachado' },
  { id: 'upper', label: 'Mayúsculas' },
  { id: 'highlight', label: 'Resaltado' },
  { id: 'neon', label: 'Neón' },
] as const;

export type PostTextFontId = (typeof POST_TEXT_FONTS)[number]['id'];
export type PostTextColorId = (typeof POST_TEXT_COLORS)[number]['id'];
export type PostTextFlagId = (typeof POST_TEXT_FLAGS)[number]['id'];
export type PostTextStyle = { font: PostTextFontId; color: PostTextColorId } & Partial<
  Record<PostTextFlagId, true>
>;

export const DEFAULT_POST_TEXT_STYLE: PostTextStyle = { font: 'clasica', color: 'auto' };

export function postTextFont(id: string | null | undefined) {
  return POST_TEXT_FONTS.find((font) => font.id === id) ?? POST_TEXT_FONTS[0];
}

export function postTextColor(id: string | null | undefined) {
  return POST_TEXT_COLORS.find((color) => color.id === id) ?? POST_TEXT_COLORS[0];
}

export function isDefaultPostTextStyle(style: PostTextStyle | null | undefined): boolean {
  if (!style) return true;
  return (
    postTextFont(style.font).family == null &&
    postTextColor(style.color).value == null &&
    !POST_TEXT_FLAGS.some((flag) => style[flag.id])
  );
}

/** Activa/desactiva un estilo sin dejar claves `false` (Firestore y comparaciones de borrador). */
export function togglePostTextFlag(style: PostTextStyle, flag: PostTextFlagId): PostTextStyle {
  const next = { ...style };
  if (next[flag]) delete next[flag];
  else next[flag] = true;
  return next;
}

/** Normaliza `textStyle` (Firestore, LiveKit, borrador); null si falta, no es válido o es el estilo por defecto. */
export function parsePostTextStyle(raw: unknown): PostTextStyle | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const style: PostTextStyle = {
    font: postTextFont(typeof data.font === 'string' ? data.font : null).id,
    color: postTextColor(typeof data.color === 'string' ? data.color : null).id,
  };
  for (const flag of POST_TEXT_FLAGS) {
    if (data[flag.id] === true) style[flag.id] = true;
  }
  return isDefaultPostTextStyle(style) ? null : style;
}

/**
 * Clases + variables para el contenedor del texto. Las reglas `.lb-ts*` de index.css
 * aplican el estilo a `.lb-emoji-text` y al campo de escritura que haya dentro.
 */
export function textStyleProps(style: PostTextStyle | null | undefined): {
  className: string;
  style: CSSProperties | undefined;
} {
  if (!style || isDefaultPostTextStyle(style)) return { className: '', style: undefined };
  const family = postTextFont(style.font).family;
  const color = postTextColor(style.color).value;
  const classes = ['lb-ts'];
  const vars: Record<string, string> = {};
  if (family) {
    classes.push('lb-ts-font');
    vars['--lb-ts-font'] = family;
  }
  if (color) {
    classes.push('lb-ts-colored');
    vars['--lb-post-text-color'] = color;
  }
  for (const flag of POST_TEXT_FLAGS) {
    if (style[flag.id]) classes.push(`lb-ts-${flag.id}`);
  }
  return {
    className: classes.join(' '),
    style: Object.keys(vars).length ? (vars as CSSProperties) : undefined,
  };
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

/** Carga las fuentes web solo si el estilo usa una. */
export function useTextStyleFonts(style: PostTextStyle | null | undefined) {
  usePostTextFonts(postTextFont(style?.font).family != null);
}

/** Igual que `useTextStyleFonts` para una lista (chats, comentarios). */
export function useTextStyleFontsIn(items: ReadonlyArray<{ textStyle?: PostTextStyle | null }>) {
  usePostTextFonts(items.some((item) => postTextFont(item.textStyle?.font).family != null));
}
