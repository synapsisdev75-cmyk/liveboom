import { getApiBase } from './api';
import { auth } from './firebase';
import {
  isAppLocale,
  parseAppLocale,
  translateApiCode,
  type AppLocale,
} from '../i18n/locales';

const memoryCache = new Map<string, string>();
const STORAGE_KEY = 'liveboom:tx-cache';
const MAX_CACHE = 400;

const SKIP_RE =
  /^(🎁|📎|🎤|📷|🎬|🔗|GIF|Regalo|Adjunto|Foto|Enlace|Gift|Attachment|Photo|Link)\b/i;
const EMOJI_ONLY_RE =
  /^(?:[\p{Extended_Pictographic}\p{Emoji_Component}\s\d!?.¡¿…,;:'"«»“”()\-—_/\\]|[\u200d\ufe0f])+$/u;
const URL_ONLY_RE = /^(https?:\/\/\S+)$/i;

function cacheKey(text: string, source: string, target: string) {
  return `${source}|${target}|${text}`;
}

function readSessionCache(key: string): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, string>;
    return typeof data[key] === 'string' ? data[key] : null;
  } catch {
    return null;
  }
}

function writeSessionCache(key: string, value: string) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const data = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    data[key] = value;
    const keys = Object.keys(data);
    if (keys.length > MAX_CACHE) {
      for (const extra of keys.slice(0, keys.length - MAX_CACHE)) {
        delete data[extra];
      }
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

function remember(key: string, value: string) {
  memoryCache.set(key, value);
  writeSessionCache(key, value);
}

export function shouldTranslateMessage(text: string, sourceLang?: string | null, targetLang?: AppLocale) {
  const body = text.trim();
  if (!body) return false;
  if (SKIP_RE.test(body) || URL_ONLY_RE.test(body)) return false;
  try {
    if (EMOJI_ONLY_RE.test(body)) return false;
  } catch {
    /* unicode property unsupported */
  }
  if (sourceLang && targetLang && parseAppLocale(sourceLang) === targetLang) return false;
  return true;
}

async function translateViaApi(text: string, source: string, target: string): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const token = await user.getIdToken();
    const response = await fetch(`${getApiBase()}/api/translate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, source, target }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { text?: string };
    return typeof data.text === 'string' && data.text.trim() ? data.text.trim() : null;
  } catch {
    return null;
  }
}

async function translateViaGoogle(text: string, source: string, target: string): Promise<string | null> {
  const sl = source === 'auto' ? 'auto' : source;
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}` +
    `&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const data = (await response.json()) as unknown;
    if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
    const chunks = (data[0] as unknown[])
      .map((part) => (Array.isArray(part) && typeof part[0] === 'string' ? part[0] : ''))
      .join('');
    return chunks.trim() || null;
  } catch {
    return null;
  }
}

async function translateViaMyMemory(text: string, source: string, target: string): Promise<string | null> {
  const sl = source === 'auto' ? 'Autodetect' : source;
  const url =
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}` +
    `&langpair=${encodeURIComponent(`${sl}|${target}`)}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const data = (await response.json()) as { responseData?: { translatedText?: string } };
    const out = data.responseData?.translatedText?.trim();
    if (!out || /MYMEMORY WARNING/i.test(out)) return null;
    return out;
  } catch {
    return null;
  }
}

export async function translateText(
  text: string,
  sourceLang: string | null | undefined,
  targetLang: AppLocale,
): Promise<string> {
  const body = text.trim();
  if (!body) return text;
  const source = sourceLang && isAppLocale(sourceLang) ? sourceLang : 'auto';
  if (source !== 'auto' && source === targetLang) return text;
  if (!shouldTranslateMessage(body, source === 'auto' ? null : source, targetLang)) return text;

  const key = cacheKey(body, source, targetLang);
  const hit = memoryCache.get(key) ?? readSessionCache(key);
  if (hit) return hit;

  const apiSource = translateApiCode(source === 'auto' ? 'auto' : source);
  const apiTarget = translateApiCode(targetLang);

  const translated =
    (await translateViaApi(body, apiSource, apiTarget)) ||
    (await translateViaGoogle(body, apiSource, apiTarget)) ||
    (await translateViaMyMemory(body, apiSource, apiTarget));

  if (!translated || translated === body) {
    remember(key, body);
    return text;
  }
  remember(key, translated);
  return translated;
}
