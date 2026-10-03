/** Búsqueda en LiveBoom: texto normalizado (sin tildes, plurales) para personas y publicaciones. */

const STOPWORDS = new Set([
  'a', 'al', 'con', 'de', 'del', 'el', 'en', 'es', 'la', 'las', 'lo', 'los', 'mi', 'mis', 'para',
  'por', 'que', 'se', 'su', 'sus', 'un', 'una', 'unos', 'unas', 'y', 'o', 'tu', 'te',
]);

export type SearchIntent = 'people' | 'posts' | 'auto';

export function normalizeSearchText(value: string | null | undefined): string {
  return String(value || '')
    .replace(/:[a-z0-9_]+:/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

export function searchIntent(raw: string): SearchIntent {
  const value = raw.trim();
  if (value.startsWith('@')) return 'people';
  if (value.startsWith('#')) return 'posts';
  return 'auto';
}

/** Variantes de una palabra: carros → carro, arriendos → arriend (arrienda, arriendo…). */
function wordStems(word: string): string[] {
  const out = new Set([word]);
  if (word.length > 4 && word.endsWith('es')) out.add(word.slice(0, -2));
  if (word.length > 3 && word.endsWith('s')) out.add(word.slice(0, -1));
  for (const item of [...out]) {
    if (item.length >= 6 && /[aeiou]$/.test(item)) out.add(item.slice(0, -1));
  }
  return [...out];
}

export function searchTokens(raw: string): string[] {
  const words = normalizeSearchText(raw).split(' ').filter(Boolean);
  const meaningful = words.filter((word) => !STOPWORDS.has(word));
  return (meaningful.length ? meaningful : words).filter((word) => word.length >= 2 || /\d/.test(word));
}

function tokenMatchesWords(token: string, words: string[]): boolean {
  const stems = wordStems(token);
  return words.some((word) => stems.some((stem) => word.startsWith(stem)));
}

function wordsOf(value: string | null | undefined): string[] {
  return normalizeSearchText(value).split(' ').filter(Boolean);
}

export type PostSearchFields = {
  caption?: string | null;
  username?: string | null;
  linkTitle?: string | null;
  linkDescription?: string | null;
};

/** 0 = no coincide. Todas las palabras deben aparecer en la publicación. */
export function scorePostMatch(raw: string, fields: PostSearchFields): number {
  const tokens = searchTokens(raw);
  if (!tokens.length) return 0;
  const caption = wordsOf(fields.caption);
  const hashtags = (String(fields.caption || '').match(/#[\p{L}\p{N}_]+/gu) || []).flatMap((tag) => wordsOf(tag));
  const link = [...wordsOf(fields.linkTitle), ...wordsOf(fields.linkDescription)];
  const author = wordsOf(String(fields.username || '').replace(/_/g, ' '));
  let score = 0;
  for (const token of tokens) {
    const inTag = tokenMatchesWords(token, hashtags);
    const inCaption = tokenMatchesWords(token, caption);
    const inLink = tokenMatchesWords(token, link);
    const inAuthor = tokenMatchesWords(token, author);
    if (!inTag && !inCaption && !inLink && !inAuthor) return 0;
    score += (inTag ? 4 : 0) + (inCaption ? 3 : 0) + (inLink ? 2 : 0) + (inAuthor ? 1 : 0);
  }
  const phrase = normalizeSearchText(raw);
  if (phrase.includes(' ') && normalizeSearchText(fields.caption).includes(phrase)) score += 5;
  return score;
}

export type UserSearchFields = { username?: string | null; displayName?: string | null };

/** 0 = no coincide. Busca por @usuario o por cualquier parte del nombre. */
export function scoreUserMatch(raw: string, fields: UserSearchFields): number {
  const needle = normalizeSearchText(raw.replace(/^@/, '')).replace(/\s+/g, ' ');
  if (!needle) return 0;
  const username = normalizeSearchText(String(fields.username || '').replace(/_/g, ' '));
  const usernameRaw = String(fields.username || '').toLowerCase();
  const display = normalizeSearchText(fields.displayName);
  const compact = needle.replace(/\s+/g, '_');
  if (usernameRaw === compact) return 100;
  if (usernameRaw.startsWith(compact)) return 60;
  if (display === needle) return 55;
  if (display.startsWith(needle)) return 45;
  const words = [...username.split(' '), ...display.split(' ')].filter(Boolean);
  const tokens = needle.split(' ').filter(Boolean);
  if (tokens.every((token) => words.some((word) => word.startsWith(token)))) return 30;
  if (needle.length >= 3 && (display.includes(needle) || username.replace(/ /g, '').includes(needle.replace(/ /g, '')))) {
    return 15;
  }
  return 0;
}
