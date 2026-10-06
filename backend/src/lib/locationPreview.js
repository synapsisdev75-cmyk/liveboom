const { SITE_ORIGIN, escapeHtml, isShareCrawler } = require('./sharePreview');

const TILE = 256;
const IMAGE_W = 1200;
const IMAGE_H = 630;
const MAP_ZOOM = 16;
const POINT_Y = 0.6;
const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
const FETCH_HEADERS = {
  'User-Agent': 'LiveBoom/1.0 (+https://liveboomapp.com; location previews)',
  Referer: 'https://liveboomapp.com/',
};
const LIVE_ID_RE = /^[A-Za-z0-9]{12,40}$/;
const UID_RE = /^[A-Za-z0-9_-]{6,128}$/;

function validLatLng(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 85 &&
    Math.abs(lng) <= 180 &&
    (lat !== 0 || lng !== 0)
  );
}

/** Lee los parámetros del enlace compartido (mismo formato que apps/web/src/lib/locationShare.ts). */
function parseLocationQuery(query) {
  const get = (key) => {
    const value = query?.[key];
    return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
  };
  const lat = Number(get('lat'));
  const lng = Number(get('lng'));
  if (!validLatLng(lat, lng)) return null;
  const loc = { lat, lng, label: get('n').trim().slice(0, 80) };
  const liveId = get('live');
  if (LIVE_ID_RE.test(liveId)) loc.liveId = liveId;
  const uid = get('u');
  if (UID_RE.test(uid)) loc.uid = uid;
  const handle = get('h').replace(/^@/, '').trim().slice(0, 32);
  if (/^[A-Za-z0-9._-]+$/.test(handle)) loc.handle = handle;
  return loc;
}

function locationQueryString(loc) {
  const params = new URLSearchParams({ lat: loc.lat.toFixed(5), lng: loc.lng.toFixed(5) });
  if (loc.label) params.set('n', loc.label);
  if (loc.liveId) params.set('live', loc.liveId);
  if (loc.uid) params.set('u', loc.uid);
  if (loc.handle) params.set('h', loc.handle);
  return params.toString();
}

function worldPixel(lat, lng, zoom) {
  const size = TILE * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

async function fetchBuffer(url, { timeoutMs = 5000, maxBytes = 4_000_000 } = {}) {
  if (!/^https:\/\//i.test(String(url || ''))) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS, redirect: 'follow' });
    if (!res.ok) return null;
    const data = Buffer.from(await res.arrayBuffer());
    return data.length > 0 && data.length <= maxBytes ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Datos para la vista previa: posición en vivo (si sigue activa), foto y nombre de quien comparte. */
async function loadLocationContext(db, loc) {
  const ctx = {
    lat: loc.lat,
    lng: loc.lng,
    label: loc.label || '',
    handle: loc.handle || '',
    displayName: '',
    avatarUrl: '',
    live: false,
    ended: false,
  };
  let ownerUid = loc.uid || '';
  if (loc.liveId) {
    try {
      const snap = await db.collection('liveLocations').doc(loc.liveId).get();
      const data = snap.exists ? snap.data() || {} : null;
      const active = Boolean(data && data.active === true && Number(data.expiresAtMs) > Date.now());
      if (data && validLatLng(Number(data.lat), Number(data.lng)) && active) {
        ctx.lat = Number(data.lat);
        ctx.lng = Number(data.lng);
      }
      if (data) {
        ownerUid = String(data.ownerUid || ownerUid);
        ctx.handle = String(data.handle || ctx.handle);
        ctx.displayName = String(data.displayName || '');
        ctx.avatarUrl = /^https:\/\//i.test(String(data.avatarUrl || '')) ? String(data.avatarUrl) : '';
        ctx.label = String(data.label || ctx.label);
      }
      ctx.live = active;
      ctx.ended = !active;
    } catch {
      ctx.ended = false;
    }
  }
  if (!ctx.avatarUrl && ownerUid && UID_RE.test(ownerUid)) {
    try {
      const user = await db.collection('users').doc(ownerUid).get();
      const profile = user.exists ? user.data() || {} : {};
      const avatar = String(profile.avatarUrl || profile.photoURL || '');
      if (/^https:\/\//i.test(avatar)) ctx.avatarUrl = avatar;
      if (!ctx.displayName) ctx.displayName = String(profile.displayName || '');
      if (!ctx.handle) ctx.handle = String(profile.handle || profile.username || '');
    } catch {
      /* sin perfil: marcador sin foto */
    }
  }
  return ctx;
}

function previewText(ctx) {
  const who = ctx.handle ? `@${ctx.handle}` : ctx.displayName || '';
  if (ctx.live) {
    return {
      title: `🔴 ${who || 'Alguien'} comparte su ubicación en tiempo real`,
      description: `${ctx.label ? `${ctx.label} · ` : ''}Toca para seguirla en el mapa de LiveBoom`,
    };
  }
  if (ctx.ended) {
    return {
      title: `📍 Ubicación en tiempo real${who ? ` de ${who}` : ''} (terminada)`,
      description: 'Toca para ver el último punto compartido en LiveBoom',
    };
  }
  return {
    title: `📍 ${ctx.label || 'Ubicación compartida'}${who ? ` · ${who}` : ''}`,
    description: 'Toca para verla en el mapa de LiveBoom',
  };
}

function renderLocationOgHtml({ ctx, pageUrl, imageUrl, webUrl }) {
  const { title, description } = previewText(ctx);
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const img = escapeHtml(imageUrl);
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${t}</title>
    <meta name="description" content="${d}" />
    <meta property="og:site_name" content="LiveBoom" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    <meta property="og:image" content="${img}" />
    <meta property="og:image:secure_url" content="${img}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="${IMAGE_W}" />
    <meta property="og:image:height" content="${IMAGE_H}" />
    <meta property="og:image:alt" content="Mapa con la ubicación compartida" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${img}" />
  </head>
  <body>
    <p>${d}</p>
    <p><a href="${escapeHtml(webUrl)}">Ver ubicación en LiveBoom</a></p>
  </body>
</html>`;
}

function pinOverlaySvg({ cx, cy, live, hasAvatar }) {
  const ringR = 64;
  const headCy = cy - ringR - 26;
  const stops = live
    ? '<stop offset="0" stop-color="#ef4444"/><stop offset="0.55" stop-color="#ec4899"/><stop offset="1" stop-color="#a78bfa"/>'
    : '<stop offset="0" stop-color="#22d3ee"/><stop offset="0.55" stop-color="#a78bfa"/><stop offset="1" stop-color="#ec4899"/>';
  const halo = live ? '#ef4444' : '#22d3ee';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_W}" height="${IMAGE_H}">
  <defs>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b0f19" stop-opacity="0.92"/>
      <stop offset="0.38" stop-color="#0b0f19" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.62" r="0.75">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.45"/>
    </radialGradient>
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000" flood-opacity="0.55"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#vignette)"/>
  <rect width="100%" height="100%" fill="url(#sky)"/>
  <circle cx="${cx}" cy="${cy}" r="120" fill="${halo}" fill-opacity="0.12"/>
  <circle cx="${cx}" cy="${cy}" r="58" fill="${halo}" fill-opacity="0.22"/>
  <ellipse cx="${cx}" cy="${cy + 4}" rx="26" ry="8" fill="#000" fill-opacity="0.45"/>
  <g filter="url(#shadow)">
    <path d="M ${cx - 22} ${headCy + ringR - 8} L ${cx + 22} ${headCy + ringR - 8} L ${cx} ${cy} Z" fill="url(#ring)"/>
    <circle cx="${cx}" cy="${headCy}" r="${ringR}" fill="url(#ring)"/>
  </g>
  <circle cx="${cx}" cy="${headCy}" r="${ringR - 7}" fill="#ffffff"/>
  ${
    hasAvatar
      ? ''
      : `<circle cx="${cx}" cy="${headCy}" r="${ringR - 11}" fill="#0b0f19"/>
  <path d="M ${cx} ${headCy + 26} C ${cx - 22} ${headCy + 2}, ${cx - 22} ${headCy - 26}, ${cx} ${headCy - 26} C ${cx + 22} ${headCy - 26}, ${cx + 22} ${headCy + 2}, ${cx} ${headCy + 26} Z" fill="#67e8f9"/>
  <circle cx="${cx}" cy="${headCy - 8}" r="8" fill="#0b0f19"/>`
  }
  ${
    live
      ? `<circle cx="${cx + ringR - 8}" cy="${headCy - ringR + 14}" r="17" fill="#ef4444" stroke="#ffffff" stroke-width="5"/>`
      : ''
  }
</svg>`;
}

async function circleAvatar(buffer, diameter) {
  const sharp = require('sharp');
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}"><circle cx="${diameter / 2}" cy="${diameter / 2}" r="${diameter / 2}" fill="#fff"/></svg>`,
  );
  return sharp(buffer)
    .resize(diameter, diameter, { fit: 'cover', position: 'centre' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

let logoCache = { at: 0, buf: null };
async function brandLogo() {
  if (logoCache.buf && Date.now() - logoCache.at < 6 * 3600_000) return logoCache.buf;
  const sharp = require('sharp');
  const raw = await fetchBuffer(`${SITE_ORIGIN}/brand/logo-clear.png`, { timeoutMs: 4000 });
  if (!raw) return null;
  try {
    const buf = await sharp(raw).resize({ height: 64, fit: 'inside' }).png().toBuffer();
    logoCache = { at: Date.now(), buf };
    return buf;
  } catch {
    return null;
  }
}

/** Imagen 1200×630 para WhatsApp/redes: mapa oscuro de LiveBoom + marcador con la foto de quien comparte. */
async function renderLocationImage(ctx) {
  const sharp = require('sharp');
  const center = worldPixel(ctx.lat, ctx.lng, MAP_ZOOM);
  const originX = center.x - IMAGE_W / 2;
  const originY = center.y - IMAGE_H * POINT_Y;
  const tx0 = Math.floor(originX / TILE);
  const ty0 = Math.floor(originY / TILE);
  const tx1 = Math.floor((originX + IMAGE_W - 1) / TILE);
  const ty1 = Math.floor((originY + IMAGE_H - 1) / TILE);
  const n = 2 ** MAP_ZOOM;
  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty += 1) {
    for (let tx = tx0; tx <= tx1; tx += 1) {
      if (ty < 0 || ty >= n) continue;
      const wrapped = ((tx % n) + n) % n;
      jobs.push(
        fetchBuffer(TILE_URL(MAP_ZOOM, wrapped, ty), { timeoutMs: 6000, maxBytes: 1_000_000 }).then((buf) =>
          buf ? { input: buf, left: (tx - tx0) * TILE, top: (ty - ty0) * TILE } : null,
        ),
      );
    }
  }
  const tiles = (await Promise.all(jobs)).filter(Boolean);
  const gridW = (tx1 - tx0 + 1) * TILE;
  const gridH = (ty1 - ty0 + 1) * TILE;
  const grid = await sharp({
    create: { width: gridW, height: gridH, channels: 3, background: '#d9dee4' },
  })
    .composite(tiles)
    .png()
    .toBuffer();
  const base = await sharp(grid)
    .extract({
      left: Math.round(originX - tx0 * TILE),
      top: Math.round(originY - ty0 * TILE),
      width: IMAGE_W,
      height: IMAGE_H,
    })
    .negate({ alpha: false })
    .modulate({ hue: 180, saturation: 0.75, brightness: 0.92 })
    .linear(1.05, -6)
    .png()
    .toBuffer();

  const cx = IMAGE_W / 2;
  const cy = Math.round(IMAGE_H * POINT_Y);
  const ringR = 64;
  const headCy = cy - ringR - 26;
  const avatarRaw = ctx.avatarUrl ? await fetchBuffer(ctx.avatarUrl, { timeoutMs: 4000, maxBytes: 5_000_000 }) : null;
  let avatar = null;
  if (avatarRaw) {
    try {
      avatar = await circleAvatar(avatarRaw, (ringR - 11) * 2);
    } catch {
      avatar = null;
    }
  }
  const layers = [{ input: Buffer.from(pinOverlaySvg({ cx, cy, live: ctx.live, hasAvatar: Boolean(avatar) })), left: 0, top: 0 }];
  if (avatar) layers.push({ input: avatar, left: cx - (ringR - 11), top: headCy - (ringR - 11) });
  const logo = await brandLogo();
  if (logo) layers.push({ input: logo, left: 36, top: 30 });
  return sharp(base).composite(layers).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}

async function handleLocationPreview(req, res) {
  const path = String(req.path || req.url || '').split('?')[0].replace(/\/+$/, '') || '/';
  const loc = parseLocationQuery(req.query || {});
  if (!loc) {
    res.redirect(302, `${SITE_ORIGIN}/`);
    return;
  }
  const query = locationQueryString(loc);
  const webUrl = `${SITE_ORIGIN}/ubicacion?${query}`;
  const isImage = path === '/l/map.jpg';
  const ua = req.get?.('user-agent') || req.headers?.['user-agent'] || '';
  if (!isImage && !isShareCrawler(ua)) {
    res.set('Cache-Control', 'no-store').redirect(302, webUrl);
    return;
  }
  const { getAdminDb } = require('./firestoreAdmin');
  let ctx;
  try {
    ctx = await loadLocationContext(getAdminDb(), loc);
  } catch (error) {
    console.error('[liveboom] location preview ctx', error?.message || error);
    ctx = { ...loc, displayName: '', avatarUrl: '', live: false, ended: false };
  }
  const cacheSeconds = loc.liveId ? 60 : 86400;
  if (isImage) {
    try {
      const jpg = await renderLocationImage(ctx);
      res
        .status(200)
        .set('Content-Type', 'image/jpeg')
        .set('Cache-Control', `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`)
        .send(jpg);
    } catch (error) {
      console.error('[liveboom] location preview image', error?.message || error);
      res.redirect(302, `${SITE_ORIGIN}/brand/logo-clear.png`);
    }
    return;
  }
  res
    .status(200)
    .set('Content-Type', 'text/html; charset=utf-8')
    .set('Cache-Control', `public, max-age=${Math.min(cacheSeconds, 300)}`)
    .send(
      renderLocationOgHtml({
        ctx,
        pageUrl: `${SITE_ORIGIN}/l?${query}`,
        imageUrl: `${SITE_ORIGIN}/l/map.jpg?${query}`,
        webUrl,
      }),
    );
}

module.exports = {
  parseLocationQuery,
  locationQueryString,
  previewText,
  renderLocationOgHtml,
  renderLocationImage,
  handleLocationPreview,
};
