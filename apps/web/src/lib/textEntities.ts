/** Extrae #hashtags y @menciones del texto plano. */

const HASHTAG_RE = /#([\p{L}\p{N}_]{2,32})/gu;
const MENTION_RE = /(^|[^A-Za-z0-9._])@([A-Za-z0-9._]{3,24})/g;

export type TextEntityKind = 'hashtag' | 'mention';

export type TextEntitySpan = {
  kind: TextEntityKind;
  start: number;
  end: number;
  value: string;
};

export function extractHashtagsFromText(text: string): string[] {
  const found = new Set<string>();
  const raw = String(text || '');
  HASHTAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HASHTAG_RE.exec(raw))) {
    const tag = String(match[1] || '').toLowerCase();
    if (tag) found.add(tag);
  }
  return [...found].slice(0, 12);
}

export function extractMentionHandles(text: string): string[] {
  const found = new Set<string>();
  const raw = String(text || '');
  MENTION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_RE.exec(raw))) {
    const handle = String(match[2] || '')
      .replace(/\.+$/, '')
      .toLowerCase();
    if (handle.length >= 3) found.add(handle);
  }
  return [...found].slice(0, 20);
}

export function listHashtagSpans(text: string): TextEntitySpan[] {
  const spans: TextEntitySpan[] = [];
  const raw = String(text || '');
  HASHTAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HASHTAG_RE.exec(raw))) {
    const value = String(match[1] || '').toLowerCase();
    if (!value) continue;
    spans.push({
      kind: 'hashtag',
      start: match.index,
      end: match.index + match[0].length,
      value,
    });
  }
  return spans;
}

export function listMentionSpans(text: string): TextEntitySpan[] {
  const spans: TextEntitySpan[] = [];
  const raw = String(text || '');
  MENTION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_RE.exec(raw))) {
    const prefix = match[1] || '';
    const handle = String(match[2] || '').replace(/\.+$/, '');
    if (handle.length < 3) continue;
    const start = match.index + prefix.length;
    spans.push({
      kind: 'mention',
      start,
      end: start + 1 + handle.length,
      value: handle.toLowerCase(),
    });
  }
  return spans;
}

/** Detecta @query en el cursor para el autocompletado. */
export function mentionQueryAt(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const raw = String(text || '');
  const pos = Math.max(0, Math.min(caret, raw.length));
  const before = raw.slice(0, pos);
  const match = before.match(/(^|[\s([{¡¿])@([A-Za-z0-9._]{0,24})$/);
  if (!match) return null;
  const query = match[2] || '';
  return { start: pos - query.length - 1, query };
}
