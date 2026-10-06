const SHARE_HOSTS = new Set(['liveboomapp.com', 'www.liveboomapp.com', 'liveboom-app.web.app', 'liveboom-app.firebaseapp.com']);

/** ID de publicación de un enlace `https://liveboomapp.com/s/{postId}`; null si no es un enlace de LiveBoom. */
export function parseSharedPostUrl(url: string | null | undefined): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const sameOrigin = typeof window !== 'undefined' && parsed.host === window.location.host;
    if (!SHARE_HOSTS.has(parsed.hostname) && !sameOrigin) return null;
    const match = parsed.pathname.match(/^\/s\/([^/?#]+)\/?$/);
    return match ? decodeURIComponent(match[1]!) : null;
  } catch {
    return null;
  }
}
