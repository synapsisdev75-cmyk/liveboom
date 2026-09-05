import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUploadName, VALID_EXTS } from './emoticonesLib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const destDir = path.join(root, 'public', 'emojis', 'emoticones');

const DEFAULT_SOURCES = [
  path.join(
    process.env.USERPROFILE || '',
    '.cursor',
    'projects',
    'c-Users-yulia-Desktop-liveboom-main',
    'assets',
  ),
  path.join(root, 'assets', 'emoticones'),
];

function resolveSource() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  return DEFAULT_SOURCES.find((dir) => fs.existsSync(dir));
}

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function uniqueId(base, taken) {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

const sourceDir = resolveSource();
if (!sourceDir) {
  console.error('No se encontró la carpeta de emoticones. Pasa la ruta: npm run sync-emoticones -- <carpeta>');
  process.exit(1);
}

const names = fs.readdirSync(sourceDir);
const seenHash = new Set();
const byId = new Map();

for (const name of names) {
  const parsed = parseUploadName(name);
  if (!parsed) continue;
  const abs = path.join(sourceDir, name);
  if (!fs.statSync(abs).isFile()) continue;
  const buf = fs.readFileSync(abs);
  const hash = sha1(buf);
  if (seenHash.has(hash)) continue;
  seenHash.add(hash);

  const prev = byId.get(parsed.id);
  if (!prev) {
    byId.set(parsed.id, { ...parsed, buf });
    continue;
  }
  if (parsed.ext !== prev.ext) {
    if (parsed.rank < prev.rank) byId.set(parsed.id, { ...parsed, buf });
    continue;
  }
  const alt = uniqueId(parsed.id, byId);
  byId.set(alt, { ...parsed, id: alt, buf });
}

if (byId.size === 0) {
  console.error(`No hay archivos válidos (.gif .jpg .jpeg .png .webp) en ${sourceDir}`);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
for (const existing of fs.readdirSync(destDir)) {
  const ext = path.extname(existing).toLowerCase();
  if (VALID_EXTS.has(ext)) fs.unlinkSync(path.join(destDir, existing));
}

for (const item of byId.values()) {
  fs.writeFileSync(path.join(destDir, `${item.id}${item.ext}`), item.buf);
}

console.log(`Emoticones: ${byId.size} únicos (de ${names.length} archivos) → ${destDir}`);
