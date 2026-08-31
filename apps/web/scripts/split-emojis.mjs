import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SOURCE =
  process.argv[2] ||
  path.join(root, 'assets', 'emojis', 'source-sheet.jpg');

const OUT_DIR = path.join(root, 'public', 'emojis');
const OUT_SIZE = 256;

/** 5×10 — orden fila a fila, izquierda a derecha */
const IDS = [
  'grin',
  'laugh',
  'big_grin',
  'teeth_grin',
  'sweat_smile',
  'joy_tears',
  'rofl',
  'blush',
  'wink',
  'smile',
  'peaceful',
  'neutral',
  'tongue_wink',
  'tongue_squint',
  'kiss',
  'kiss_smile',
  'blow_kiss',
  'heart_eyes',
  'yum',
  'surprised',
  'angel',
  'sad',
  'worried',
  'grimace',
  'expressionless',
  'disappointed',
  'cry',
  'sad_cry',
  'sob',
  'upset',
  'silly',
  'scream',
  'think',
  'shocked',
  'stunned',
  'star_eyes',
  'sneeze',
  'angry_steam',
  'nervous',
  'sleep',
  'cool',
  'frown',
  'angry',
  'dizzy',
  'sick',
  'drool',
  'yawn',
  'red_angry',
  'devil_happy',
  'devil_angry',
];

const COLS = 10;
const ROWS = 5;

/** Quita fondo negro (JPG) o blanco (PDF) con alpha suave en bordes. */
function matteBackground(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    const neutral = max - min < 24;

    // Fondo negro del JPG — solo negro puro y halo en bordes (no sombras internas)
    if (neutral && max < 18) {
      data[i + 3] = 0;
      continue;
    }
    if (neutral && max < 48) {
      const fringe = Math.min(1, (max - 18) / 30);
      data[i + 3] = Math.round(data[i + 3] * (1 - fringe));
      continue;
    }

    // Fondo blanco (export PDF)
    if (neutral && min > 248) {
      data[i + 3] = 0;
      continue;
    }
    if (neutral && min > 215 && max > 238) {
      const fringe = Math.min(1, (min - 215) / 33);
      data[i + 3] = Math.round(data[i + 3] * (1 - fringe));
    }
  }
}

function processCell(buffer) {
  return sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      matteBackground(data);
      return sharp(data, { raw: info })
        .trim({ threshold: 12 })
        .resize(OUT_SIZE, OUT_SIZE, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          kernel: sharp.kernel.lanczos3,
        })
        .sharpen({ sigma: 0.45, m1: 0.5, m2: 0.35 })
        .png({ compressionLevel: 9, effort: 10 });
    });
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error('Source not found:', SOURCE);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const meta = await sharp(SOURCE).metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 503;
  const cellW = Math.floor(W / COLS);
  const cellH = Math.floor(H / ROWS);

  let index = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const id = IDS[index];
      if (!id) break;
      const left = col * cellW;
      const top = row * cellH;
      const width = col === COLS - 1 ? W - left : cellW;
      const height = row === ROWS - 1 ? H - top : cellH;

      const cell = await sharp(SOURCE).extract({ left, top, width, height }).png().toBuffer();
      await processCell(cell).then((img) => img.toFile(path.join(OUT_DIR, `${id}.png`)));

      index++;
    }
  }

  console.log(`Wrote ${index} emojis (${OUT_SIZE}×${OUT_SIZE}) from ${path.basename(SOURCE)} → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
