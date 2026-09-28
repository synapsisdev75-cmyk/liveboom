const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/** Crawlers that Spotify/YouTube serve with real OG cover art. */
const PREVIEW_UA =
  'WhatsApp/2.23.20.0 A';

const WEAK_TITLE_RE =
  /^(spotify(\s*[–—-]\s*web player)?|web player|youtube|music for everyone)\b/i;
const WEAK_IMAGE_RE =
  /download-page-image|error-page|favicon|spotifycdn\.com\/cdn\/images\/(?!.*ab676)/i;

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
}

function metaContent(html, property) {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) return decodeEntities(match[1].trim());
  }
  return '';
}

function absoluteUrl(base, maybe) {
  const value = String(maybe || '').trim();
  if (!value) return '';
  try {
    return new URL(value, base).href;
  } catch {
    return '';
  }
}

function extractFirstHttpUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return '';
  return match[0].replace(/[),.;!?]+$/g, '');
}

function isAllowedPreviewUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local')) return false;
    if (/^(10\.|127\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function hostHint(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (host.includes('spotify')) return 'Spotify';
  if (host.includes('music.youtube') || host.includes('youtube') || host === 'youtu.be') {
    return host.includes('music.youtube') ? 'YouTube Music' : 'YouTube';
  }
  if (host.includes('music.apple') || host.includes('itunes.apple')) return 'Apple Music';
  if (host.includes('soundcloud')) return 'SoundCloud';
  if (host.includes('deezer')) return 'Deezer';
  if (host.includes('tidal')) return 'Tidal';
  if (host.includes('vimeo')) return 'Vimeo';
  return host.replace(/^www\./, '');
}

function isWeakTitle(title) {
  const value = String(title || '').trim();
  if (!value) return true;
  return WEAK_TITLE_RE.test(value);
}

function isWeakImage(image) {
  const value = String(image || '').trim();
  if (!value) return true;
  return WEAK_IMAGE_RE.test(value);
}

function isUsefulPreview(preview) {
  if (!preview) return false;
  const hasImage = Boolean(preview.image) && !isWeakImage(preview.image);
  const hasTitle = Boolean(preview.title) && !isWeakTitle(preview.title);
  return hasImage || hasTitle;
}

function sanitizePreview(preview, pageUrl) {
  if (!preview) return null;
  let host = '';
  try {
    host = new URL(pageUrl || preview.url || '').hostname;
  } catch {
    host = '';
  }
  const siteName = preview.siteName || hostHint(host);
  const title = isWeakTitle(preview.title) ? '' : String(preview.title || '').trim();
  const image = isWeakImage(preview.image) ? '' : String(preview.image || '').trim();
  const description = String(preview.description || '').trim();
  if (!title && !image) return null;
  return {
    url: preview.url || pageUrl,
    title: (title || siteName).slice(0, 160),
    description: description.slice(0, 240),
    image: image.slice(0, 500),
    siteName: String(siteName).slice(0, 80),
  };
}

/** Canonicalize Spotify / youtu.be URLs so oEmbed + OG resolve reliably. */
function normalizePlayerUrl(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (host.includes('spotify.com') || host === 'spotify.link') {
      const path = url.pathname.replace(/\/+/g, '/');
      const match = path.match(
        /\/(track|album|playlist|episode|show|artist)\/([a-zA-Z0-9]+)/i,
      );
      if (match) {
        return `https://open.spotify.com/${match[1].toLowerCase()}/${match[2]}`;
      }
    }
    if (host === 'youtu.be') {
      const id = url.pathname.replace(/^\//, '').split('/')[0];
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    if (host.includes('music.youtube.com') && url.searchParams.get('v')) {
      return `https://www.youtube.com/watch?v=${url.searchParams.get('v')}`;
    }
    return url.href;
  } catch {
    return raw;
  }
}

async function fetchText(url, timeoutMs = 8000, userAgent = PREVIEW_UA) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    return {
      ok: res.ok,
      status: res.status,
      text: await res.text(),
      finalUrl: res.url || url,
      contentType: String(res.headers.get('content-type') || ''),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function tryOEmbed(pageUrl) {
  let host = '';
  try {
    host = new URL(pageUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  let endpoint = '';
  if (host.includes('spotify.com') || host === 'spotify.link') {
    endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(pageUrl)}`;
  } else if (host.includes('youtube.com') || host === 'youtu.be' || host.includes('music.youtube')) {
    endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(pageUrl)}&format=json`;
  } else if (host.includes('soundcloud.com')) {
    endpoint = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(pageUrl)}`;
  } else if (host.includes('vimeo.com')) {
    endpoint = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(pageUrl)}`;
  } else if (host.includes('deezer.com')) {
    endpoint = `https://api.deezer.com/oembed?url=${encodeURIComponent(pageUrl)}`;
  }
  if (!endpoint) return null;
  try {
    const { ok, text } = await fetchText(endpoint, 6000, PREVIEW_UA);
    if (!ok || !text) return null;
    const data = JSON.parse(text);
    const title = String(data.title || '').trim();
    const image = String(data.thumbnail_url || '').trim();
    const provider = String(data.provider_name || hostHint(host)).trim();
    const author = String(data.author_name || '').trim();
    const preview = sanitizePreview(
      {
        url: pageUrl,
        title: title || provider,
        description: author
          ? `${author}${provider ? ` · ${provider}` : ''}`
          : provider,
        image,
        siteName: provider || hostHint(host),
      },
      pageUrl,
    );
    return preview;
  } catch {
    return null;
  }
}

function parseHtmlPreview(html, pageUrl) {
  const title =
    metaContent(html, 'og:title') ||
    metaContent(html, 'twitter:title') ||
    (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim();
  const description =
    metaContent(html, 'og:description') ||
    metaContent(html, 'twitter:description') ||
    metaContent(html, 'description');
  const image =
    metaContent(html, 'og:image:secure_url') ||
    metaContent(html, 'og:image') ||
    metaContent(html, 'twitter:image') ||
    metaContent(html, 'twitter:image:src');
  let siteName = metaContent(html, 'og:site_name');
  try {
    siteName = siteName || hostHint(new URL(pageUrl).hostname);
  } catch {
    siteName = siteName || '';
  }
  return sanitizePreview(
    {
      url: pageUrl,
      title: decodeEntities(title),
      description: decodeEntities(description),
      image: absoluteUrl(pageUrl, image),
      siteName: decodeEntities(siteName),
    },
    pageUrl,
  );
}

/**
 * When Spotify returns market/404 pages, use share subject / caption hint
 * against iTunes Search (cover art is usually the same release).
 */
async function tryItunesHint(hint, pageUrl) {
  const query = String(hint || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b(spotify|youtube|music|song|track|álbum|album|escucha|listen)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  if (query.length < 3) return null;
  try {
    const endpoint =
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}` +
      '&entity=song&limit=5';
    const { ok, text } = await fetchText(endpoint, 6000, DEFAULT_UA);
    if (!ok || !text) return null;
    const data = JSON.parse(text);
    const results = Array.isArray(data.results) ? data.results : [];
    if (!results.length) return null;
    const best = results[0];
    const art = String(best.artworkUrl100 || '')
      .replace('100x100bb', '600x600bb')
      .replace('100x100', '600x600');
    const title = String(best.trackName || best.collectionName || '').trim();
    const artist = String(best.artistName || '').trim();
    const album = String(best.collectionName || '').trim();
    const year = best.releaseDate ? String(best.releaseDate).slice(0, 4) : '';
    const bits = [artist, album, 'Song', year].filter(Boolean);
    return sanitizePreview(
      {
        url: pageUrl,
        title,
        description: bits.join(' · '),
        image: art,
        siteName: hostHint(new URL(pageUrl).hostname),
      },
      pageUrl,
    );
  } catch {
    return null;
  }
}

async function tryHtmlPreview(pageUrl) {
  try {
    const { ok, text, finalUrl, contentType, status } = await fetchText(pageUrl, 8000, PREVIEW_UA);
    if (!text) return null;
    if (!/html|xml|text/i.test(contentType) && !text.includes('<')) return null;
    const fromHtml = parseHtmlPreview(text.slice(0, 350000), finalUrl || pageUrl);
    if (fromHtml) return fromHtml;
    // Retry once with a browser UA for non-Spotify sites that block bots.
    if (!ok || status >= 400) {
      const retry = await fetchText(pageUrl, 8000, DEFAULT_UA);
      if (retry.text) {
        return parseHtmlPreview(retry.text.slice(0, 350000), retry.finalUrl || pageUrl);
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function unfurlLink(rawUrl, options = {}) {
  const hint = String(options.hint || '').trim();
  const url = normalizePlayerUrl(String(rawUrl || '').trim());
  if (!isAllowedPreviewUrl(url)) {
    const err = new Error('URL no válida');
    err.status = 400;
    throw err;
  }

  const oembed = await tryOEmbed(url);
  if (isUsefulPreview(oembed)) {
    const thinDesc =
      !oembed.description ||
      oembed.description === oembed.siteName ||
      isWeakTitle(oembed.description);
    if (thinDesc) {
      const fromHtml = await tryHtmlPreview(url);
      if (fromHtml?.description && !isWeakTitle(fromHtml.description)) {
        return {
          ...oembed,
          title: oembed.title || fromHtml.title,
          description: fromHtml.description,
          image: oembed.image || fromHtml.image,
        };
      }
    }
    return oembed;
  }

  const fromHtml = await tryHtmlPreview(url);
  if (isUsefulPreview(fromHtml)) return fromHtml;

  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = '';
  }
  if ((host.includes('spotify') || host.includes('music.youtube') || host.includes('youtu')) && hint) {
    const fromItunes = await tryItunesHint(hint, url);
    if (isUsefulPreview(fromItunes)) return fromItunes;
  }

  const fallbackSite = hostHint(host);
  return {
    url,
    title: fallbackSite,
    description: '',
    image: '',
    siteName: fallbackSite,
  };
}

module.exports = {
  extractFirstHttpUrl,
  isAllowedPreviewUrl,
  normalizePlayerUrl,
  unfurlLink,
  isUsefulPreview,
  isWeakImage,
  isWeakTitle,
};
