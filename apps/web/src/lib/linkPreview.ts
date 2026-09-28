import { getApiBase } from './api';

export type LinkPreviewData = {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
};

const URL_RE = /https?:\/\/[^\s<>"']+/i;

export function extractFirstHttpUrl(text: string): string {
  const match = String(text || '').match(URL_RE);
  if (!match) return '';
  return match[0].replace(/[),.;!?]+$/g, '');
}

/** Same link ignoring share query params (si=, utm_, etc.). */
export function isSamePreviewUrl(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    return (
      left.hostname.replace(/^www\./, '') === right.hostname.replace(/^www\./, '') &&
      left.pathname.replace(/\/$/, '') === right.pathname.replace(/\/$/, '')
    );
  } catch {
    return String(a || '').trim() === String(b || '').trim();
  }
}

export function normalizeLinkPreview(raw: unknown): LinkPreviewData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const url = String(data.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    url,
    title: String(data.title || '').trim().slice(0, 160),
    description: String(data.description || '').trim().slice(0, 240),
    image: String(data.image || '').trim(),
    siteName: String(data.siteName || '').trim().slice(0, 80),
  };
}

export async function fetchLinkPreview(
  rawUrl: string,
  hintText?: string,
): Promise<LinkPreviewData | null> {
  const url = extractFirstHttpUrl(rawUrl) || String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return null;
  const hint = String(hintText || rawUrl || '')
    .replace(url, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  const base = getApiBase();
  const params = new URLSearchParams({ url });
  if (hint) params.set('hint', hint);
  const endpoint = `${base}/api/link-preview/preview?${params.toString()}`;
  const res = await fetch(endpoint, { credentials: 'omit' });
  if (!res.ok) return null;
  const json = (await res.json()) as { preview?: unknown };
  return normalizeLinkPreview(json.preview);
}
