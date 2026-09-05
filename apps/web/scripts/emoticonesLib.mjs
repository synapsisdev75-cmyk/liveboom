import fs from 'node:fs';
import path from 'node:path';

export const VALID_EXTS = new Set(['.gif', '.jpg', '.jpeg', '.png', '.webp']);
export const EXT_RANK = {
  '.gif': 0,
  '.webp': 1,
  '.png': 2,
  '.jpg': 3,
  '.jpeg': 3,
};

const UUID_RE = /-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGES_MARKER = '_images_';

function extRank(ext) {
  return EXT_RANK[ext] ?? 99;
}

/** Nombre original de Cursor / carpeta subida → stem legible o null si no es emoticon. */
export function parseUploadName(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (!VALID_EXTS.has(ext)) return null;
  let stem = path.basename(filename, path.extname(filename));
  const marker = stem.toLowerCase().lastIndexOf(IMAGES_MARKER);
  if (marker >= 0) stem = stem.slice(marker + IMAGES_MARKER.length);
  stem = stem.replace(UUID_RE, '');
  if (isSkippedStem(stem)) return null;
  const id = toEmojiId(stem);
  if (!id) return null;
  return {
    stem,
    ext,
    id,
    label: toEmojiLabel(stem),
    rank: extRank(ext),
  };
}

export function toEmojiId(stem) {
  let id = String(stem || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!id) return '';
  if (!id.startsWith('emo_')) id = `emo_${id}`;
  if (id.length > 72) id = id.slice(0, 72).replace(/_+$/g, '');
  return id;
}

export function toEmojiLabel(stem) {
  const cleaned = String(stem || '')
    .replace(/_GIF_by_[^]*$/i, '')
    .replace(/_GIF$/i, '')
    .replace(/_+/g, ' ')
    .trim();
  const words = (cleaned || String(stem || '').replace(/_/g, ' ')).split(/\s+/).filter(Boolean);
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function isSkippedStem(stem) {
  const raw = String(stem || '').replace(/^emo_/i, '');
  return (
    !raw ||
    /^image$/i.test(raw) ||
    /^captura_de_pantalla/i.test(raw) ||
    /captura_de_pantalla/i.test(raw) ||
    /^screenshot/i.test(raw)
  );
}

function parseDestName(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (!VALID_EXTS.has(ext)) return null;
  const stem = path.basename(filename, path.extname(filename));
  if (isSkippedStem(stem)) return null;
  const id = toEmojiId(stem);
  if (!id || isSkippedStem(id)) return null;
  return {
    id,
    label: toEmojiLabel(stem.replace(/^emo_/i, '')),
    file: `/emojis/emoticones/${stem}${ext}`,
    ext,
    rank: extRank(ext),
  };
}

/** Lee `public/emojis/emoticones` y arma el catálogo. Drop-in para archivos nuevos. */
export function catalogEmoticones(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const byId = new Map();
  for (const name of fs.readdirSync(dir)) {
    const parsed = parseDestName(name);
    if (!parsed) continue;
    const abs = path.join(dir, name);
    if (!fs.statSync(abs).isFile()) continue;
    const prev = byId.get(parsed.id);
    if (!prev || parsed.rank < prev.rank) byId.set(parsed.id, parsed);
  }
  return [...byId.values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))
    .map(({ id, label, file }) => ({
      id,
      label,
      file,
      pack: 'emoticones',
    }));
}
