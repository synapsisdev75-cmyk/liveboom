const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.liveboom.app';
const APP_STORE_URL = 'https://apps.apple.com/search?term=LiveBoom';
const SITE_ORIGIN = 'https://liveboomapp.com';
const DEFAULT_IMAGE = `${SITE_ORIGIN}/brand/logo-clear.png`;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isShareCrawler(userAgent) {
  const ua = String(userAgent || '');
  return /facebookexternalhit|Facebot|Twitterbot|WhatsApp|TelegramBot|Slackbot|LinkedInBot|Discordbot|Pinterest|Embedly|Iframely|Quora Link Preview|Showyoubot|outbrain|vkShare|W3C_Validator|redditbot|SkypeUriPreview|Googlebot|bingbot|Applebot|ia_archiver|MetaInspector|Snapchat/i.test(
    ua,
  );
}

/** Navegador interno de Instagram / Facebook / TikTok, etc. en Android. */
function isAndroidInAppBrowser(userAgent) {
  const ua = String(userAgent || '');
  if (!/Android/i.test(ua)) return false;
  return /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|TikTok|musical_ly|BytedanceWebview|trill|\bLine\/|Snapchat|Twitter|LinkedInApp|Pinterest/i.test(
    ua,
  );
}

function shareClientKind(userAgent) {
  const ua = String(userAgent || '');
  if (isAndroidInAppBrowser(ua)) return 'android-inapp';
  if (/\bwv\b/.test(ua)) return 'app';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return 'desktop';
}

function sharePostIdFromPath(path) {
  const clean = String(path || '').split('?')[0];
  const match = clean.match(/\/s\/([^/]+)/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return '';
  }
}

function isSafePostId(postId) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(String(postId || ''));
}

function videoMime(url) {
  if (/\.webm(\?|$)/i.test(url)) return 'video/webm';
  if (/\.mov(\?|$)/i.test(url)) return 'video/quicktime';
  return 'video/mp4';
}

function imageMime(url) {
  if (/\.png(\?|$)/i.test(url)) return 'image/png';
  if (/\.webp(\?|$)/i.test(url)) return 'image/webp';
  if (/\.gif(\?|$)/i.test(url)) return 'image/gif';
  return 'image/jpeg';
}

function absoluteHttp(url) {
  const value = String(url || '').trim();
  if (!/^https:\/\//i.test(value)) return '';
  return value;
}

function previewFromPost(post) {
  const visibility = String(post?.visibility || 'public');
  const shareable = visibility === 'public';
  const username = String(post?.username || '').replace(/^@/, '').trim() || 'liveboom';
  const caption = String(post?.caption || '').trim();
  const type = post?.type === 'video' || post?.type === 'photo' ? post.type : 'text';
  const mediaUrl = shareable ? absoluteHttp(post?.mediaUrl) : '';
  const thumbUrl = shareable ? absoluteHttp(post?.thumbUrl) : '';
  const image = thumbUrl || (type === 'photo' ? mediaUrl : '') || DEFAULT_IMAGE;
  const video = shareable && type === 'video' ? mediaUrl : '';
  return {
    username,
    authorUid: String(post?.authorUid || '').trim(),
    caption,
    title: caption ? caption.slice(0, 90) : `@${username} en LiveBoom`,
    description: caption ? caption.slice(0, 200) : 'Mira esto en LiveBoom',
    image,
    imageType: imageMime(image),
    video,
    videoType: video ? videoMime(video) : '',
    width: Number(post?.mediaWidth) || 0,
    height: Number(post?.mediaHeight) || 0,
  };
}

function webPostPath(preview, postId) {
  const params = new URLSearchParams();
  params.set('post', postId);
  if (preview.authorUid) params.set('uid', preview.authorUid);
  const handle = encodeURIComponent(preview.username || 'liveboom');
  return `/u/${handle}?${params.toString()}`;
}

function renderShareOgHtml({ preview, pageUrl, webUrl = '' }) {
  const title = escapeHtml(preview.title);
  const description = escapeHtml(preview.description);
  const image = escapeHtml(preview.image);
  const page = escapeHtml(pageUrl);
  const videoTags = preview.video
    ? `<meta property="og:video" content="${escapeHtml(preview.video)}" />
    <meta property="og:video:secure_url" content="${escapeHtml(preview.video)}" />
    <meta property="og:video:type" content="${escapeHtml(preview.videoType)}" />
    <meta property="og:type" content="video.other" />`
    : `<meta property="og:type" content="article" />`;
  const sizeTags =
    preview.width > 0 && preview.height > 0
      ? `<meta property="og:image:width" content="${preview.width}" />
    <meta property="og:image:height" content="${preview.height}" />`
      : '';
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:site_name" content="LiveBoom" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${page}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:secure_url" content="${image}" />
    <meta property="og:image:type" content="${escapeHtml(preview.imageType)}" />
    ${sizeTags}
    ${videoTags}
    <meta name="twitter:card" content="${preview.video ? 'player' : 'summary_large_image'}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
    ${
      preview.video
        ? `<meta name="twitter:player" content="${escapeHtml(preview.video)}" />
    <meta name="twitter:player:stream" content="${escapeHtml(preview.video)}" />`
        : ''
    }
  </head>
  <body>
    <p>${description}</p>
    ${
      webUrl
        ? `<p><a href="${escapeHtml(webUrl)}">Ver publicación en LiveBoom</a></p>
    <script>window.location.replace(${JSON.stringify(webUrl)});</script>`
        : ''
    }
  </body>
</html>`;
}

/** Saca el enlace del navegador interno (Instagram, Facebook…) al navegador predeterminado de Android. */
function renderOpenInBrowserHtml({ webUrl }) {
  const safeWeb = escapeHtml(webUrl);
  const target = new URL(webUrl);
  const intent =
    'intent://' +
    target.host +
    target.pathname +
    target.search +
    '#Intent;scheme=https;S.browser_fallback_url=' +
    encodeURIComponent(webUrl) +
    ';end';
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LiveBoom</title>
  </head>
  <body style="margin:0;min-height:100dvh;display:grid;place-items:center;background:#0a0a0b;color:#fff;font-family:system-ui,sans-serif;text-align:center">
    <div style="padding:1.5rem">
      <p>Abriendo LiveBoom en tu navegador…</p>
      <p><a href="${safeWeb}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 1.25rem;border-radius:999px;background:#22d3ee;color:#000;font-weight:600;text-decoration:none">Ver publicación</a></p>
    </div>
    <script>
      (function () {
        var hidden = false;
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'hidden') hidden = true;
        });
        window.location.href = ${JSON.stringify(intent)};
        setTimeout(function () {
          if (!hidden) window.location.replace(${JSON.stringify(webUrl)});
        }, 1200);
      })();
    </script>
  </body>
</html>`;
}

/** Abrir la app / tienda desde el enlace solo cuando las apps estén publicadas (SHARE_APP_HANDOFF=1). */
function shareAppHandoffEnabled() {
  return String(process.env.SHARE_APP_HANDOFF || '').trim() === '1';
}

function renderShareHandoffHtml({ kind, postId, webUrl }) {
  const safeWeb = escapeHtml(webUrl);
  const safePlay = escapeHtml(PLAY_STORE_URL);
  const safeAppStore = escapeHtml(APP_STORE_URL);
  const safeId = escapeHtml(postId);
  if (kind === 'ios') {
    return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LiveBoom</title>
  </head>
  <body>
    <p>Abriendo LiveBoom…</p>
    <p><a href="${safeAppStore}">Abrir en App Store</a></p>
    <script>
      (function () {
        var hidden = false;
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'hidden') hidden = true;
        });
        window.location.href = 'liveboom://s/${safeId}';
        setTimeout(function () {
          if (!hidden) window.location.replace(${JSON.stringify(APP_STORE_URL)});
        }, 900);
      })();
    </script>
  </body>
</html>`;
  }
  const intent =
    'intent://s/' +
    encodeURIComponent(postId) +
    '#Intent;scheme=liveboom;package=com.liveboom.app;S.browser_fallback_url=' +
    encodeURIComponent(PLAY_STORE_URL) +
    ';end';
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LiveBoom</title>
  </head>
  <body>
    <p>Abriendo LiveBoom…</p>
    <p><a href="${safePlay}">Abrir en Play Store</a></p>
    <script>
      window.location.replace(${JSON.stringify(intent)});
    </script>
    <noscript><p><a href="${safeWeb}">Ver en el sitio</a></p></noscript>
  </body>
</html>`;
}

function renderMissingHtml() {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>LiveBoom</title>
    <meta property="og:title" content="LiveBoom" />
    <meta property="og:description" content="Esta publicación no está disponible." />
    <meta property="og:image" content="${DEFAULT_IMAGE}" />
  </head>
  <body>
    <p>Esta publicación no está disponible.</p>
    <p><a href="${SITE_ORIGIN}">Ir a LiveBoom</a></p>
  </body>
</html>`;
}

async function loadSharePost(db, postId) {
  const snap = await db.collection('posts').doc(postId).get();
  if (!snap.exists) return null;
  let data = snap.data() || {};
  const originId = String(data.sharedFromPostId || '').trim();
  if (originId && originId !== postId && isSafePostId(originId)) {
    const origin = await db.collection('posts').doc(originId).get();
    if (origin.exists) {
      const source = origin.data() || {};
      data = {
        ...data,
        type: source.type || data.type,
        mediaUrl: source.mediaUrl || data.mediaUrl,
        thumbUrl: source.thumbUrl || data.thumbUrl,
        caption: data.caption || source.caption,
        mediaWidth: source.mediaWidth || data.mediaWidth,
        mediaHeight: source.mediaHeight || data.mediaHeight,
        visibility: source.visibility || data.visibility,
        username: data.username || source.username,
        authorUid: data.authorUid || source.authorUid,
      };
    }
  }
  return data;
}

async function handleSharePreview(req, res) {
  const postId = sharePostIdFromPath(req.path || req.url || '');
  if (!isSafePostId(postId)) {
    res.status(404).set('Content-Type', 'text/html; charset=utf-8').send(renderMissingHtml());
    return;
  }
  const { getAdminDb } = require('./firestoreAdmin');
  let data;
  try {
    data = await loadSharePost(getAdminDb(), postId);
  } catch (error) {
    console.error('[liveboom] share preview', error?.message || error);
    res.status(500).set('Content-Type', 'text/plain; charset=utf-8').send('LiveBoom');
    return;
  }
  if (!data) {
    res.status(404).set('Content-Type', 'text/html; charset=utf-8').send(renderMissingHtml());
    return;
  }
  const preview = previewFromPost(data);
  const pageUrl = `${SITE_ORIGIN}/s/${encodeURIComponent(postId)}`;
  const webUrl = `${SITE_ORIGIN}${webPostPath(preview, postId)}`;
  const ua = req.get?.('user-agent') || req.headers?.['user-agent'] || '';
  if (isShareCrawler(ua)) {
    res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'public, max-age=300')
      .send(renderShareOgHtml({ preview, pageUrl, webUrl }));
    return;
  }
  const kind = shareClientKind(ua);
  if (kind === 'android-inapp') {
    res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'no-store')
      .send(renderOpenInBrowserHtml({ webUrl }));
    return;
  }
  if (!shareAppHandoffEnabled() || kind === 'desktop' || kind === 'app') {
    res.redirect(302, webUrl);
    return;
  }
  res
    .status(200)
    .set('Content-Type', 'text/html; charset=utf-8')
    .set('Cache-Control', 'no-store')
    .send(renderShareHandoffHtml({ kind, postId, webUrl }));
}

module.exports = {
  PLAY_STORE_URL,
  APP_STORE_URL,
  SITE_ORIGIN,
  escapeHtml,
  isShareCrawler,
  isAndroidInAppBrowser,
  shareClientKind,
  sharePostIdFromPath,
  isSafePostId,
  previewFromPost,
  webPostPath,
  renderShareOgHtml,
  renderShareHandoffHtml,
  renderOpenInBrowserHtml,
  shareAppHandoffEnabled,
  handleSharePreview,
};
