import { useEffect, useState, type CSSProperties } from 'react';

/**
 * Estilo de texto elegido con el botón "Aa": Publicación, comentarios y chats
 * (Mensajes, Grupos, LIVE), Flash Boom y Boom Clip. `textStyle` es el estilo base del
 * texto; `textStyleRanges` guarda los fragmentos seleccionados con estilo propio.
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

function normalizePostTextStyle(raw: unknown): PostTextStyle | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const style: PostTextStyle = {
    font: postTextFont(typeof data.font === 'string' ? data.font : null).id,
    color: postTextColor(typeof data.color === 'string' ? data.color : null).id,
  };
  for (const flag of POST_TEXT_FLAGS) {
    if (data[flag.id] === true) style[flag.id] = true;
  }
  return style;
}

/** Normaliza `textStyle` (Firestore, LiveKit, borrador); null si falta, no es válido o es el estilo por defecto. */
export function parsePostTextStyle(raw: unknown): PostTextStyle | null {
  const style = normalizePostTextStyle(raw);
  return !style || isDefaultPostTextStyle(style) ? null : style;
}

export function samePostTextStyle(
  a: PostTextStyle | null | undefined,
  b: PostTextStyle | null | undefined,
): boolean {
  const x = a ?? DEFAULT_POST_TEXT_STYLE;
  const y = b ?? DEFAULT_POST_TEXT_STYLE;
  return (
    postTextFont(x.font).id === postTextFont(y.font).id &&
    postTextColor(x.color).id === postTextColor(y.color).id &&
    POST_TEXT_FLAGS.every((flag) => Boolean(x[flag.id]) === Boolean(y[flag.id]))
  );
}

/** Estilo de un fragmento `[start, end)` del texto (selección dentro del "Aa"). */
export type TextStyleRange = { start: number; end: number; style: PostTextStyle };

const MAX_TEXT_STYLE_RANGES = 120;

/** Valida `textStyleRanges`: dentro del texto, ordenados y sin solaparse. */
export function parseTextStyleRanges(raw: unknown, textLength: number): TextStyleRange[] {
  if (!Array.isArray(raw) || textLength <= 0) return [];
  const items: TextStyleRange[] = [];
  for (const item of raw.slice(0, MAX_TEXT_STYLE_RANGES)) {
    if (!item || typeof item !== 'object') continue;
    const data = item as Record<string, unknown>;
    const start = Math.max(0, Math.floor(Number(data.start)));
    const end = Math.min(textLength, Math.floor(Number(data.end)));
    const style = normalizePostTextStyle(data.style);
    if (!style || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    items.push({ start, end, style });
  }
  items.sort((a, b) => a.start - b.start);
  const out: TextStyleRange[] = [];
  let last = 0;
  for (const item of items) {
    if (item.start < last) continue;
    out.push(item);
    last = item.end;
  }
  return out;
}

/** Ajusta los fragmentos cuando el texto cambia (escribir, borrar, pegar, emoji). */
export function shiftTextStyleRanges(
  prev: string,
  next: string,
  ranges: TextStyleRange[],
): TextStyleRange[] {
  if (!ranges.length || prev === next) return ranges;
  const limit = Math.min(prev.length, next.length);
  let head = 0;
  while (head < limit && prev.charCodeAt(head) === next.charCodeAt(head)) head += 1;
  let tail = 0;
  while (
    tail < limit - head &&
    prev.charCodeAt(prev.length - 1 - tail) === next.charCodeAt(next.length - 1 - tail)
  ) {
    tail += 1;
  }
  const prevEnd = prev.length - tail;
  const delta = next.length - prev.length;
  const out: TextStyleRange[] = [];
  for (const range of ranges) {
    const start = range.start >= prevEnd ? range.start + delta : range.start <= head ? range.start : head;
    const end = range.end <= head ? range.end : range.end >= prevEnd ? range.end + delta : head;
    const clampedEnd = Math.min(end, next.length);
    if (clampedEnd > start) out.push({ ...range, start, end: clampedEnd });
  }
  return out;
}

/** Aplica `style` a `[start, end)`; si coincide con el estilo base el fragmento vuelve al base. */
export function applyTextStyleRange(
  ranges: TextStyleRange[],
  start: number,
  end: number,
  style: PostTextStyle,
  base: PostTextStyle | null | undefined,
): TextStyleRange[] {
  if (end <= start) return ranges;
  const pieces: TextStyleRange[] = [];
  for (const range of ranges) {
    if (range.end <= start || range.start >= end) {
      pieces.push(range);
      continue;
    }
    if (range.start < start) pieces.push({ ...range, end: start });
    if (range.end > end) pieces.push({ ...range, start: end });
  }
  if (!samePostTextStyle(style, base)) {
    pieces.push({ start, end, style: normalizePostTextStyle(style) ?? DEFAULT_POST_TEXT_STYLE });
  }
  pieces.sort((a, b) => a.start - b.start);
  const out: TextStyleRange[] = [];
  for (const piece of pieces) {
    const prev = out[out.length - 1];
    if (prev && prev.end === piece.start && samePostTextStyle(prev.style, piece.style)) {
      out[out.length - 1] = { ...prev, end: piece.end };
    } else {
      out.push(piece);
    }
  }
  return out.slice(0, MAX_TEXT_STYLE_RANGES);
}

export function textStyleAt(
  ranges: TextStyleRange[],
  pos: number,
  base: PostTextStyle | null | undefined,
): PostTextStyle {
  return (
    ranges.find((range) => range.start <= pos && pos < range.end)?.style ??
    base ??
    DEFAULT_POST_TEXT_STYLE
  );
}

/** Fragmentos de `raw` relativos al texto guardado (`raw.trim()` recortado a `maxLength`). */
export function textStyleRangesForTrimmed(
  raw: string,
  ranges: TextStyleRange[] | null | undefined,
  maxLength: number,
): TextStyleRange[] {
  if (!ranges?.length) return [];
  const lead = raw.length - raw.trimStart().length;
  const length = Math.min(raw.trim().length, maxLength);
  return parseTextStyleRanges(
    ranges.map((range) => ({ ...range, start: range.start - lead, end: range.end - lead })),
    length,
  );
}

/**
 * Fragmentos con estilo del borrador de un compositor. Se desplazan solos cuando cambia
 * `text` (escribir, borrar, emoji) y desaparecen al vaciarlo (enviar).
 * `forText`: texto al que corresponden `next` cuando se cargan junto con un texto nuevo (editar).
 */
export function useTextStyleRangesDraft(
  text: string,
): [TextStyleRange[], (next: TextStyleRange[], forText?: string) => void] {
  const [state, setState] = useState<{ text: string; ranges: TextStyleRange[] }>(() => ({ text, ranges: [] }));
  let current = state;
  if (state.text !== text) {
    current = { text, ranges: shiftTextStyleRanges(state.text, text, state.ranges) };
    setState(current);
  }
  return [current.ranges, (next, forText) => setState({ text: forText ?? text, ranges: next })];
}

export type StyledTextRun = { text: string; style: PostTextStyle | null };

/** Trozos consecutivos del texto con su estilo; null si no hay fragmentos con estilo propio. */
export function styledTextRuns(
  text: string,
  base: PostTextStyle | null | undefined,
  ranges: TextStyleRange[] | null | undefined,
): StyledTextRun[] | null {
  if (!ranges?.length || !text) return null;
  const runs: StyledTextRun[] = [];
  let pos = 0;
  for (const range of ranges) {
    const start = Math.max(pos, Math.min(range.start, text.length));
    const end = Math.min(range.end, text.length);
    if (end <= start) continue;
    if (start > pos) runs.push({ text: text.slice(pos, start), style: base ?? null });
    runs.push({ text: text.slice(start, end), style: range.style });
    pos = end;
  }
  if (pos < text.length) runs.push({ text: text.slice(pos), style: base ?? null });
  return runs.length ? runs : null;
}

/**
 * Clases + variables para el contenedor del texto. Las reglas `.lb-ts*` de index.css
 * aplican el estilo a `.lb-emoji-text` y al campo de escritura que haya dentro.
 * Con `ranges` el contenedor queda neutro: cada fragmento lleva su estilo (`StyledText`).
 */
export function textStyleProps(
  style: PostTextStyle | null | undefined,
  ranges?: TextStyleRange[] | null,
): {
  className: string;
  style: CSSProperties | undefined;
} {
  if (ranges?.length) return { className: '', style: undefined };
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

function usesWebFont(
  style: PostTextStyle | null | undefined,
  ranges?: TextStyleRange[] | null,
): boolean {
  return (
    postTextFont(style?.font).family != null ||
    Boolean(ranges?.some((range) => postTextFont(range.style.font).family != null))
  );
}

/** Carga las fuentes web solo si el estilo (o algún fragmento) usa una. */
export function useTextStyleFonts(
  style: PostTextStyle | null | undefined,
  ranges?: TextStyleRange[] | null,
) {
  usePostTextFonts(usesWebFont(style, ranges));
}

/** Igual que `useTextStyleFonts` para una lista (chats, comentarios). */
export function useTextStyleFontsIn(
  items: ReadonlyArray<{ textStyle?: PostTextStyle | null; textStyleRanges?: TextStyleRange[] | null }>,
) {
  usePostTextFonts(items.some((item) => usesWebFont(item.textStyle, item.textStyleRanges)));
}
