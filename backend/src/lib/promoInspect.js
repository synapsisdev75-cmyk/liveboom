/**
 * Clasifica banners por contenido real (no por la extensión ni por un flag del navegador).
 */

const MASTER_WIDTH = 2172;
const MASTER_HEIGHT = 724;
const MASTER_RATIO = MASTER_WIDTH / MASTER_HEIGHT;
const MAX_ANIMATED_SEC = 20;
const RATIO_TOLERANCE = 0.04;
const MAX_BYTES = 40 * 1024 * 1024;

function sniffKind(buffer, mime, fileName) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const name = String(fileName || '').toLowerCase();
  const type = String(mime || '').toLowerCase();

  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { container: 'jpeg', format: 'static' };
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') {
    return { container: 'png', format: 'static' };
  }
  if (buf.length >= 6 && buf.toString('ascii', 0, 3) === 'GIF') {
    const frames = countGifFrames(buf);
    return { container: 'gif', format: frames > 1 ? 'animated' : 'static', frames };
  }
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const animated = isAnimatedWebp(buf);
    return { container: 'webp', format: animated ? 'animated' : 'static' };
  }
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (/qt|qt  /i.test(brand) || name.endsWith('.mov') || type.includes('quicktime')) {
      return { container: 'mov', format: 'animated' };
    }
    return { container: 'mp4', format: 'animated' };
  }
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { container: 'webm', format: 'animated' };
  }
  if (name.endsWith('.gif') || type === 'image/gif') return { container: 'gif', format: 'animated' };
  if (name.endsWith('.mp4') || type === 'video/mp4') return { container: 'mp4', format: 'animated' };
  if (name.endsWith('.webm') || type === 'video/webm') return { container: 'webm', format: 'animated' };
  if (name.endsWith('.mov') || type.includes('quicktime')) return { container: 'mov', format: 'animated' };
  if (type.startsWith('video/')) return { container: 'video', format: 'animated' };
  if (type.startsWith('image/')) return { container: 'image', format: 'static' };
  return { container: 'unknown', format: null };
}

function countGifFrames(buf) {
  let count = 0;
  for (let i = 0; i < buf.length - 1; i += 1) {
    if (buf[i] === 0x2c) count += 1;
    if (count > 8) break;
  }
  return count;
}

function isAnimatedWebp(buf) {
  const header = buf.toString('ascii', 0, Math.min(buf.length, 64));
  if (header.includes('ANIM') || header.includes('ANMF')) return true;
  if (buf.length >= 21 && buf.toString('ascii', 12, 16) === 'VP8X') {
    const flags = buf[20];
    return Boolean(flags & 0x02);
  }
  return false;
}

function ratioOk(width, height) {
  if (!(width > 0 && height > 0)) return false;
  const ratio = width / height;
  return Math.abs(ratio - MASTER_RATIO) / MASTER_RATIO <= RATIO_TOLERANCE;
}

function inspectImageMeta(meta, sniff) {
  const width = Number(meta?.width || 0);
  const height = Number(meta?.height || 0);
  const durationSec = Number(meta?.durationSec || 0);
  const exact = width === MASTER_WIDTH && height === MASTER_HEIGHT;
  const format = sniff.format === 'animated' ? 'animated' : 'static';
  const errors = [];
  if (format === 'animated' && durationSec > MAX_ANIMATED_SEC + 0.35) {
    errors.push(`La animación supera ${MAX_ANIMATED_SEC} s.`);
  }
  if (width && height && !ratioOk(width, height) && !exact) {
    errors.push(`La proporción debe ser 3:1 (maestro ${MASTER_WIDTH}×${MASTER_HEIGHT}). Tu archivo es ${width}×${height}.`);
  }
  return {
    format,
    container: sniff.container,
    width,
    height,
    durationSec,
    exactSize: exact,
    ratioOk: exact || ratioOk(width, height),
    warning: exact
      ? null
      : 'El archivo no es 2172×724; se mostrará completo en 3:1 sin recortar ni estirar.',
    errors,
    ready: errors.length === 0 && sniff.format != null,
  };
}

module.exports = {
  MASTER_WIDTH,
  MASTER_HEIGHT,
  MAX_ANIMATED_SEC,
  MAX_BYTES,
  sniffKind,
  inspectImageMeta,
  ratioOk,
};
module.exports.default = module.exports;
