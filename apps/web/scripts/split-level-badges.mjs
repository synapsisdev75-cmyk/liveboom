import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SOURCE =
  process.argv[2] || path.join(root, 'assets', 'levels', 'source-grid.png');
const OUT_DIR = path.join(root, 'public', 'levels');
const OUT_SIZE = 220;

/** 6×2 — fila a fila; la segunda fila tiene 5 badges visibles. */
const IDS = [
  'chispa',
  'mecha',
  'boom',
  'fuego',
  'impacto',
  'estrella',
  'corona',
  'diamante',
  'titan',
  'leyenda',
  'pro',
];

const COLS = 6;
const ROWS = 2;

function idx(x, y, w) {
  return (y * w + x) * 4;
}

/** Elimina fondo claro conectado desde los bordes. */
function removeLightBackground(data, width, height) {
  const visited = new Uint8Array(width * height);
  const queue = [];

  function isBackground(x, y) {
    const i = idx(x, y, width);
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max - min < 28 && min >= 200;
  }

  function push(x, y) {
    const p = y * width + x;
    if (x < 0 || y < 0 || x >= width || y >= height || visited[p]) return;
    if (!isBackground(x, y)) return;
    visited[p] = 1;
    queue.push(p);
  }

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (queue.length) {
    const p = queue.pop();
    const x = p % width;
    const y = (p - x) / width;
    const i = p * 4;
    data[i + 3] = 0;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y, width);
      if (data[i + 3] === 0) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 24 && min >= 215) {
        const fringe = Math.min(1, (min - 200) / 40);
        data[i + 3] = Math.round(data[i + 3] * (1 - fringe));
      }
    }
  }
}

function processCell(buffer) {
  return sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      removeLightBackground(data, info.width, info.height);
      return sharp(data, { raw: info })
        .trim({ threshold: 12 })
        .resize(OUT_SIZE, OUT_SIZE, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          kernel: sharp.kernel.lanczos3,
        })
        .png({ compressionLevel: 9, effort: 10 })
        .toBuffer();
    });
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error('Source not found:', SOURCE);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const meta = await sharp(SOURCE).metadata();
  const width = meta.width ?? 902;
  const height = meta.height ?? 595;
  const cellW = Math.floor(width / COLS);
  const cellH = Math.floor(height / ROWS);

  for (let index = 0; index < IDS.length; index += 1) {
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    const id = IDS[index];
    const left = col * cellW;
    const top = row * cellH;
    const extractW = col === COLS - 1 ? width - left : cellW;
    const extractH = row === ROWS - 1 ? height - top : cellH;

    const cell = await sharp(SOURCE)
      .extract({ left, top, width: extractW, height: extractH })
      .png()
      .toBuffer();

    const out = path.join(OUT_DIR, `${id}.png`);
    const processed = await processCell(cell);
    await sharp(processed).toFile(out);
    console.log('Wrote', out);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
