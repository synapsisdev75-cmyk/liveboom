import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SOURCE =
  process.argv[2] ||
  path.join(root, 'assets', 'emojis', 'source-boom-sheet.jpg');

const OUT_DIR = path.join(root, 'public', 'emojis', 'boom');
const OUT_SIZE = 256;

/** 4×6 — fila a fila, izquierda a derecha */
const IDS = [
  'boom_thumbs_up',
  'boom_cool',
  'boom_love',
  'boom_wink_tongue',
  'boom_laugh_tears',
  'boom_rock_on',
  'boom_angry',
  'boom_crying',
  'boom_kiss',
  'boom_shush',
  'boom_shocked',
  'boom_nerd',
  'boom_smirk',
  'boom_money',
  'boom_sleep',
  'boom_panic',
  'boom_devil',
  'boom_gambler',
  'boom_dizzy',
  'boom_think',
  'boom_party',
  'boom_dj',
  'boom_rage',
  'boom_zen',
];

const COLS = 6;
const ROWS = 4;

function matteBackground(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    const neutral = max - min < 24;

    if (neutral && max < 52) {
      data[i + 3] = 0;
      continue;
    }
    if (neutral && max < 78) {
      const fringe = Math.min(1, (max - 52) / 26);
      data[i + 3] = Math.round(data[i + 3] * (1 - fringe));
      continue;
    }

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
        })
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
  const H = meta.height ?? 682;
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

  console.log(`Wrote ${index} boom emojis (${OUT_SIZE}×${OUT_SIZE}) → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
