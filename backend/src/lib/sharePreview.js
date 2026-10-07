const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.liveboom.app';
const APP_STORE_URL = 'https://apps.apple.com/search?term=LiveBoom';
const SITE_ORIGIN = 'https://liveboomapp.com';
const DEFAULT_IMAGE = `${SITE_ORIGIN}/brand/logo-clear.png`;
const SHARE_IMAGE_W = 1200;
const SHARE_IMAGE_H = 630;
/** Subir si cambia el diseño de og.jpg para que WhatsApp/Facebook no usen la versión vieja. */
const SHARE_IMAGE_LAYOUT = 'card-v2';

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

function isShareImagePath(path) {
  return /^\/s\/[^/]+\/og\.jpg$/i.test(String(path || '').split('?')[0]);
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

/** Mantener igual a apps/web/src/lib/liveboomEmojis.ts (UNICODE_BY_EMOJI_ID). */
const UNICODE_BY_EMOJI_ID = {
  grin: '😀', laugh: '😆', big_grin: '😃', teeth_grin: '😁', sweat_smile: '😅', joy_tears: '😂',
  rofl: '🤣', blush: '😊', wink: '😉', smile: '🙂', peaceful: '😌', neutral: '😐',
  tongue_wink: '😜', tongue_squint: '😝', kiss: '😗', kiss_smile: '😙', blow_kiss: '😘',
  heart_eyes: '😍', yum: '😋', surprised: '😮', angel: '😇', sad: '🙁', worried: '😟',
  grimace: '😬', expressionless: '😑', disappointed: '😞', cry: '😢', sad_cry: '😥', sob: '😭',
  upset: '😣', silly: '🤪', scream: '😱', think: '🤔', shocked: '😲', stunned: '😳',
  star_eyes: '🤩', sneeze: '🤧', angry_steam: '😤', nervous: '😰', sleep: '😴', cool: '😎',
  frown: '☹️', angry: '😠', dizzy: '😵', sick: '🤢', drool: '🤤', yawn: '🥱', red_angry: '😡',
  devil_happy: '😈', devil_angry: '👿',
  boom_thumbs_up: '👍', boom_cool: '😎', boom_love: '😍', boom_wink_tongue: '😜',
  boom_laugh_tears: '😂', boom_rock_on: '🤘', boom_angry: '😠', boom_crying: '😭', boom_kiss: '😘',
  boom_shush: '🤫', boom_shocked: '😲', boom_nerd: '🤓', boom_smirk: '😏', boom_money: '🤑',
  boom_sleep: '😴', boom_panic: '😱', boom_devil: '😈', boom_gambler: '🎲', boom_dizzy: '😵',
  boom_think: '🤔', boom_party: '🥳', boom_dj: '🎧', boom_rage: '😡', boom_zen: '🧘',
  boom_search: '🔍', boom_binoculars: '🔭', boom_map: '🗺️', boom_compass: '🧭', boom_star: '⭐',
  boom_backpack: '🎒',
};

/** `:heart_eyes:` → 😍; emoticones animados (`:emo_…:`) sin equivalente se quitan. */
function emojiTokensToUnicode(text) {
  return String(text || '')
    .replace(/:([a-z0-9_]+):/g, (raw, id) => {
      if (Object.prototype.hasOwnProperty.call(UNICODE_BY_EMOJI_ID, id)) return UNICODE_BY_EMOJI_ID[id];
      return id.startsWith('emo_') ? '' : raw;
    })
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** `circle` = Flash Boom publicado como "Público" (amigos y seguidores). */
const SHAREABLE_VISIBILITY = new Set(['public', 'circle']);

function previewFromPost(post) {
  const visibility = String(post?.visibility || 'public');
  const shareable = SHAREABLE_VISIBILITY.has(visibility);
  const username = String(post?.username || '').replace(/^@/, '').trim() || 'liveboom';
  const caption = emojiTokensToUnicode(post?.caption);
  const type = post?.type === 'video' || post?.type === 'photo' ? post.type : 'text';
  const mediaUrl = shareable ? absoluteHttp(post?.mediaUrl) : '';
  const thumbUrl = shareable ? absoluteHttp(post?.thumbUrl) : '';
  const mediaImage = thumbUrl || (type === 'photo' ? mediaUrl : '');
  const linkImage = shareable ? absoluteHttp(post?.linkPreview?.image) : '';
  const image = mediaImage || linkImage || absoluteHttp(post?.authorAvatarUrl) || DEFAULT_IMAGE;
  const video = shareable && type === 'video' ? mediaUrl : '';
  return {
    username,
    authorUid: String(post?.authorUid || '').trim(),
    caption,
    title: caption ? Array.from(caption).slice(0, 90).join('') : `@${username} en LiveBoom`,
    description: caption ? Array.from(caption).slice(0, 200).join('') : 'Mira esto en LiveBoom',
    image,
    imageType: imageMime(image),
    video,
    videoType: video ? videoMime(video) : '',
    width: mediaImage ? Number(post?.mediaWidth) || 0 : 0,
    height: mediaImage ? Number(post?.mediaHeight) || 0 : 0,
  };
}

function webPostPath(preview, postId) {
  const params = new URLSearchParams();
  params.set('post', postId);
  if (preview.authorUid) params.set('uid', preview.authorUid);
  const handle = encodeURIComponent(preview.username || 'liveboom');
  return `/u/${handle}?${params.toString()}`;
}

/** URL de la imagen 1200×630 generada; `v` cambia si cambia la foto/miniatura de origen. */
function shareImageUrl(postId, preview) {
  const crypto = require('crypto');
  const v = crypto
    .createHash('sha1')
    .update(`${SHARE_IMAGE_LAYOUT}|${preview.image}|${preview.video ? 1 : 0}`)
    .digest('hex')
    .slice(0, 10);
  return `${SITE_ORIGIN}/s/${encodeURIComponent(postId)}/og.jpg?v=${v}`;
}

function renderShareOgHtml({ preview, pageUrl, webUrl = '', ogImage = '' }) {
  const title = escapeHtml(preview.title);
  const description = escapeHtml(preview.description);
  const image = escapeHtml(ogImage || preview.image);
  const page = escapeHtml(pageUrl);
  const videoTags = preview.video
    ? `<meta property="og:video" content="${escapeHtml(preview.video)}" />
    <meta property="og:video:secure_url" content="${escapeHtml(preview.video)}" />
    <meta property="og:video:type" content="${escapeHtml(preview.videoType)}" />
    <meta property="og:type" content="video.other" />`
    : `<meta property="og:type" content="article" />`;
  const sizeTags = ogImage
    ? `<meta property="og:image:width" content="${SHARE_IMAGE_W}" />
    <meta property="og:image:height" content="${SHARE_IMAGE_H}" />
    <meta property="og:image:alt" content="${title}" />`
    : preview.width > 0 && preview.height > 0
      ? `<meta property="og:image:width" content="${preview.width}" />
    <meta property="og:image:height" content="${preview.height}" />`
      : '';
  const imageType = ogImage ? 'image/jpeg' : preview.imageType;
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
    <meta property="og:image:type" content="${escapeHtml(imageType)}" />
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

/** Abre la URL https en el navegador predeterminado de Android (sale de Instagram, Facebook…). */
function browserIntentUrl(webUrl) {
  const target = new URL(webUrl);
  return (
    'intent://' +
    target.host +
    target.pathname +
    target.search +
    '#Intent;scheme=https;S.browser_fallback_url=' +
    encodeURIComponent(webUrl) +
    ';end'
  );
}

/**
 * Abre la publicación en la app LiveBoom instalada (`liveboom://s/<id>`, ver apps/web/src/lib/openSharedLink.ts).
 * Si la app no está instalada, Android carga `fallbackUrl`.
 */
function appIntentUrl(postId, fallbackUrl) {
  return (
    'intent://s/' +
    encodeURIComponent(postId) +
    '#Intent;scheme=liveboom;package=com.liveboom.app;S.browser_fallback_url=' +
    encodeURIComponent(fallbackUrl) +
    ';end'
  );
}

/** Vuelta del intento de abrir la app: no está instalada, se muestra la página sin reintentar. */
function shareAppMissing(rawUrl) {
  return /[?&]app=0(?:&|#|$)/.test(String(rawUrl || ''));
}

/** Ficha de LiveBoom en la app de Google Play; si no está la app de Play, la ficha web. */
const PLAY_STORE_INTENT =
  'intent://details?id=com.liveboom.app#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=' +
  encodeURIComponent(PLAY_STORE_URL) +
  ';end';

/**
 * Android: si la app está instalada se abre ahí la publicación; si no, vista de la publicación +
 * descargar la app en Google Play o seguir en el navegador.
 * `appUrl`: intent a la app (vacío cuando ya se sabe que no está instalada).
 * `autoOpen`: navegador normal (Chrome, pestaña de WhatsApp): intenta abrir la app al cargar.
 */
function renderAndroidChoiceHtml({ preview, webUrl, imageUrl, inApp = false, appUrl = '', autoOpen = false }) {
  const title = escapeHtml(preview.title);
  const caption = escapeHtml(preview.description);
  const who = escapeHtml(`@${preview.username}`);
  const safeWeb = escapeHtml(webUrl);
  const openAppScript =
    appUrl && autoOpen ? `<script>window.location.replace(${JSON.stringify(appUrl)});</script>` : '';
  const continueScript = inApp
    ? `<script>
      (function () {
        var link = document.getElementById('lb-web');
        link.addEventListener('click', function (event) {
          event.preventDefault();
          var hidden = false;
          document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') hidden = true;
          });
          window.location.href = ${JSON.stringify(browserIntentUrl(webUrl))};
          setTimeout(function () {
            if (!hidden) window.location.replace(${JSON.stringify(webUrl)});
          }, 1200);
        });
      })();
    </script>`
    : '';
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0a0a0b" />
    <meta name="robots" content="noindex" />
    <title>${title} · LiveBoom</title>
    <link rel="icon" href="${SITE_ORIGIN}/favicon.ico" />
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        min-height: 100dvh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(120% 80% at 50% 0%, #14213f 0%, #0a0a0b 62%);
        color: #fff;
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
          max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
      }
      .lb-card { width: min(100%, 26rem); display: flex; flex-direction: column; gap: 1rem; }
      .lb-brand { display: flex; align-items: center; gap: 0.6rem; font-weight: 800; font-size: 1.1rem; }
      .lb-brand img { width: 2.25rem; height: 2.25rem; border-radius: 0.6rem; }
      .lb-media {
        width: 100%;
        aspect-ratio: ${SHARE_IMAGE_W} / ${SHARE_IMAGE_H};
        border-radius: 1.1rem;
        overflow: hidden;
        background: #111827;
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
      }
      .lb-media img { display: block; width: 100%; height: 100%; object-fit: cover; }
      .lb-who { font-size: 0.85rem; color: #a1a1aa; }
      .lb-caption {
        margin: 0.25rem 0 0;
        font-size: 1rem;
        line-height: 1.4;
        overflow-wrap: anywhere;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .lb-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 3.25rem;
        padding: 0 1.25rem;
        border-radius: 999px;
        font-weight: 700;
        font-size: 1rem;
        text-align: center;
        text-decoration: none;
      }
      .lb-btn--primary { background: linear-gradient(90deg, #22d3ee, #a78bfa, #ec4899); color: #05060a; }
      .lb-btn--secondary { border: 1px solid rgba(255, 255, 255, 0.22); background: rgba(255, 255, 255, 0.05); color: #fff; }
      .lb-hint { margin: 0; font-size: 0.78rem; color: #71717a; text-align: center; }
    </style>
  </head>
  <body>
    <main class="lb-card">
      <div class="lb-brand"><img src="${SITE_ORIGIN}/brand/app-icon-192.png" alt="" />LiveBoom</div>
      <div class="lb-media"><img src="${escapeHtml(imageUrl)}" alt="${title}" /></div>
      <div>
        <div class="lb-who">${who} en LiveBoom</div>
        ${caption ? `<p class="lb-caption">${caption}</p>` : ''}
      </div>
      ${
        appUrl
          ? `<a class="lb-btn lb-btn--primary" href="${escapeHtml(appUrl)}">Abrir en la app LiveBoom</a>
      <a class="lb-btn lb-btn--secondary" href="${escapeHtml(PLAY_STORE_INTENT)}">Descargar la app en Google Play</a>`
          : `<a class="lb-btn lb-btn--primary" href="${escapeHtml(PLAY_STORE_INTENT)}">Descargar la app en Google Play</a>`
      }
      <a class="lb-btn lb-btn--secondary" id="lb-web" href="${safeWeb}">Continuar en el navegador</a>
      <p class="lb-hint">${
        appUrl
          ? 'Si tienes LiveBoom instalada, la publicación se abre en la app.'
          : 'Si ya tienes LiveBoom instalada, Google Play te mostrará «Abrir».'
      }</p>
    </main>
    ${continueScript}
    ${openAppScript}
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
        linkPreview: source.linkPreview || data.linkPreview,
        visibility: source.visibility || data.visibility,
        username: data.username || source.username,
        authorUid: data.authorUid || source.authorUid,
      };
    }
  }
  const draft = previewFromPost(data);
  const authorUid = String(data.authorUid || '').trim();
  if (draft.image === DEFAULT_IMAGE && authorUid && isSafePostId(authorUid)) {
    try {
      const user = await db.collection('users').doc(authorUid).get();
      const profile = user.exists ? user.data() || {} : {};
      const avatar = absoluteHttp(profile.avatarUrl) || absoluteHttp(profile.photoURL);
      if (avatar) data = { ...data, authorAvatarUrl: avatar };
    } catch {
      /* sin foto de perfil: queda el logo */
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
  if (isShareImagePath(req.path || req.url || '')) {
    try {
      const { renderShareImage } = require('./shareImage');
      const jpg = await renderShareImage({
        imageUrl: preview.image,
        isVideo: Boolean(preview.video),
        brandOnly: preview.image === DEFAULT_IMAGE,
        logoUrl: DEFAULT_IMAGE,
      });
      res
        .status(200)
        .set('Content-Type', 'image/jpeg')
        .set('Cache-Control', 'public, max-age=86400, s-maxage=86400')
        .send(jpg);
    } catch (error) {
      console.error('[liveboom] share image', error?.message || error);
      res.set('Cache-Control', 'no-store').redirect(302, preview.image);
    }
    return;
  }
  const pageUrl = `${SITE_ORIGIN}/s/${encodeURIComponent(postId)}`;
  const webUrl = `${SITE_ORIGIN}${webPostPath(preview, postId)}`;
  const ogImage = shareImageUrl(postId, preview);
  const ua = req.get?.('user-agent') || req.headers?.['user-agent'] || '';
  // La respuesta depende del dispositivo: `private` evita que el CDN sirva la de un bot a una persona.
  if (isShareCrawler(ua)) {
    res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'private, max-age=300')
      .send(renderShareOgHtml({ preview, pageUrl, webUrl, ogImage }));
    return;
  }
  const kind = shareClientKind(ua);
  if (kind === 'android' || kind === 'android-inapp') {
    const inApp = kind === 'android-inapp';
    const appUrl = shareAppMissing(req.originalUrl || req.url) ? '' : appIntentUrl(postId, `${pageUrl}?app=0`);
    res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'no-store')
      .send(
        renderAndroidChoiceHtml({
          preview,
          webUrl,
          imageUrl: ogImage,
          inApp,
          appUrl,
          // Dentro de Instagram/Facebook/TikTok un intent sin toque puede dejar una página de error.
          autoOpen: !inApp,
        }),
      );
    return;
  }
  // iPhone/iPad (aún sin App Store), PC y la propia app: directo al navegador.
  res.set('Cache-Control', 'no-store').redirect(302, webUrl);
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
  isShareImagePath,
  isSafePostId,
  previewFromPost,
  webPostPath,
  shareImageUrl,
  renderShareOgHtml,
  renderAndroidChoiceHtml,
  browserIntentUrl,
  appIntentUrl,
  shareAppMissing,
  handleSharePreview,
};
