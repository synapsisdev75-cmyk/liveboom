const IMAGE_W = 1200;
const IMAGE_H = 630;
const CARD_MARGIN_Y = 20;
const CARD_MAX_W = 1080;
/** Fotos verticales/cuadradas: la tarjeta no baja de este ancho y se recorta la zona más llamativa. */
const CARD_MIN_W = 720;
const CARD_RADIUS = 28;
/** WhatsApp descarta imágenes de vista previa muy pesadas. */
const TARGET_MAX_BYTES = 290_000;
const FETCH_HEADERS = {
  'User-Agent': 'LiveBoom/1.0 (+https://liveboomapp.com; share previews)',
};

async function fetchImage(url, { timeoutMs = 7000, maxBytes = 15_000_000 } = {}) {
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

/** Tamaño de la tarjeta central según la proporción de la publicación. */
function shareCardBox(aspect) {
  const safe = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const maxH = IMAGE_H - CARD_MARGIN_Y * 2;
  let width = Math.round(maxH * safe);
  let height = maxH;
  if (width > CARD_MAX_W) {
    width = CARD_MAX_W;
    height = Math.round(CARD_MAX_W / safe);
  }
  if (width < CARD_MIN_W) {
    width = CARD_MIN_W;
    height = maxH;
  }
  return {
    width,
    height,
    left: Math.round((IMAGE_W - width) / 2),
    top: Math.round((IMAGE_H - height) / 2),
  };
}

function overlaySvg({ box, isVideo }) {
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const play = isVideo
    ? `<circle cx="${cx}" cy="${cy}" r="58" fill="#000" fill-opacity="0.42"/>
  <circle cx="${cx}" cy="${cy}" r="56" fill="none" stroke="#fff" stroke-opacity="0.92" stroke-width="5"/>
  <path d="M ${cx - 16} ${cy - 26} L ${cx + 28} ${cy} L ${cx - 16} ${cy + 26} Z" fill="#fff"/>`
    : '';
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_W}" height="${IMAGE_H}">
  ${play}
</svg>`);
}

function shadowSvg(box) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_W}" height="${IMAGE_H}">
  <defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter></defs>
  <rect x="${box.left}" y="${box.top + 8}" width="${box.width}" height="${box.height}" rx="${CARD_RADIUS}" fill="#000" fill-opacity="0.6" filter="url(#s)"/>
</svg>`);
}

let logoCache = { at: 0, url: '', buf: null };
async function brandLogo(logoUrl) {
  if (logoCache.buf && logoCache.url === logoUrl && Date.now() - logoCache.at < 6 * 3600_000) {
    return logoCache.buf;
  }
  const sharp = require('sharp');
  const raw = await fetchImage(logoUrl, { timeoutMs: 4000, maxBytes: 4_000_000 });
  if (!raw) return null;
  try {
    const trimmed = await sharp(raw).trim().png().toBuffer();
    const { data, info } = await sharp(trimmed)
      .resize({ width: 220, height: 64, fit: 'inside' })
      .png()
      .toBuffer({ resolveWithObject: true });
    const pill = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${info.width + 40}" height="${info.height + 24}">
  <rect width="100%" height="100%" rx="${(info.height + 24) / 2}" fill="#05060a" fill-opacity="0.55"/>
</svg>`);
    const buf = await sharp(pill)
      .composite([{ input: data, left: 20, top: 12 }])
      .png()
      .toBuffer();
    logoCache = { at: Date.now(), url: logoUrl, buf };
    return buf;
  } catch {
    return null;
  }
}

async function encodeJpeg(sharpImage) {
  const first = await sharpImage.clone().jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  if (first.length <= TARGET_MAX_BYTES) return first;
  return sharpImage.clone().jpeg({ quality: 64, mozjpeg: true }).toBuffer();
}

/**
 * Imagen 1200×630 para WhatsApp/redes: la publicación en una tarjeta redondeada sobre su
 * propio fondo difuminado (como en LiveBoom), con botón de play si es video y el logo.
 */
async function renderShareImage({ imageUrl, isVideo = false, brandOnly = false, logoUrl }) {
  const sharp = require('sharp');
  const logo = logoUrl ? await brandLogo(logoUrl) : null;
  if (brandOnly) {
    const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_W}" height="${IMAGE_H}">
  <defs><radialGradient id="g" cx="0.5" cy="0.4" r="0.8">
    <stop offset="0" stop-color="#143f96"/><stop offset="0.55" stop-color="#072462"/><stop offset="1" stop-color="#020b24"/>
  </radialGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
</svg>`);
    const raw = await fetchImage(imageUrl, { timeoutMs: 4000, maxBytes: 4_000_000 });
    const layers = [];
    if (raw) {
      const trimmed = await sharp(raw).trim().png().toBuffer();
      const mark = await sharp(trimmed).resize({ width: 760, height: 380, fit: 'inside' }).png().toBuffer({
        resolveWithObject: true,
      });
      layers.push({
        input: mark.data,
        left: Math.round((IMAGE_W - mark.info.width) / 2),
        top: Math.round((IMAGE_H - mark.info.height) / 2),
      });
    }
    return encodeJpeg(sharp(bg).composite(layers));
  }

  const raw = await fetchImage(imageUrl);
  if (!raw) throw new Error('share image: source unavailable');
  const { data: flat, info } = await sharp(raw, { failOn: 'none' })
    .rotate()
    .flatten({ background: '#0b1220' })
    .png()
    .toBuffer({ resolveWithObject: true });
  const box = shareCardBox(info.width / info.height);

  const backdrop = await sharp(flat)
    .resize(IMAGE_W, IMAGE_H, { fit: 'cover' })
    .blur(36)
    .modulate({ brightness: 0.55, saturation: 1.15 })
    .png()
    .toBuffer();
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}"><rect width="100%" height="100%" rx="${CARD_RADIUS}" fill="#fff"/></svg>`,
  );
  const card = await sharp(flat)
    .resize(box.width, box.height, { fit: 'cover', position: sharp.strategy.attention })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  const layers = [
    { input: shadowSvg(box), left: 0, top: 0 },
    { input: card, left: box.left, top: box.top },
    { input: overlaySvg({ box, isVideo }), left: 0, top: 0 },
  ];
  if (logo) layers.push({ input: logo, left: 24, top: 22 });
  return encodeJpeg(sharp(backdrop).composite(layers));
}

module.exports = {
  SHARE_IMAGE_W: IMAGE_W,
  SHARE_IMAGE_H: IMAGE_H,
  shareCardBox,
  renderShareImage,
};
