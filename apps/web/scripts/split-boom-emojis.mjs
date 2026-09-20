import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { processSheetCell } from './matte-sheet-cell.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SOURCE =
  process.argv[2] ||
  path.join(root, 'assets', 'emojis', 'source-boom-sheet.jpg');

const EXTRA_SOURCE = path.join(root, 'assets', 'emojis', 'source-boom-sheet-2.jpg');

const OUT_DIR = path.join(root, 'public', 'emojis', 'boom');
const OUT_SIZE = 512;

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

const EXTRA_IDS = [
  'boom_search',
  'boom_binoculars',
  'boom_map',
  'boom_compass',
  'boom_star',
  'boom_backpack',
];

const COLS = 6;
const ROWS = 4;

function processCell(buffer, protectRadius) {
  return processSheetCell(buffer, OUT_SIZE, protectRadius);
}

async function splitSheet(source, ids, cols, rows, protectRadius) {
  const meta = await sharp(source).metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 682;
  const cellW = Math.floor(W / cols);
  const cellH = Math.floor(H / rows);
  let index = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const id = ids[index];
      if (!id) break;
      const left = col * cellW;
      const top = row * cellH;
      const width = col === cols - 1 ? W - left : cellW;
      const height = row === rows - 1 ? H - top : cellH;
      const padX = Math.max(1, Math.round(width * 0.012));
      const padY = Math.max(1, Math.round(height * 0.012));
      const cell = await sharp(source)
        .extract({
          left: left + padX,
          top: top + padY,
          width: Math.max(8, width - padX * 2),
          height: Math.max(8, height - padY * 2),
        })
        .png()
        .toBuffer();
      await processCell(cell, protectRadius).then((img) => img.toFile(path.join(OUT_DIR, `${id}.png`)));
      index++;
    }
  }
  return index;
}

async function main() {
  const extraOnly = process.argv.includes('--extra-only');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let total = 0;
  if (!extraOnly) {
    if (!fs.existsSync(SOURCE)) {
      console.error('Source not found:', SOURCE);
      process.exit(1);
    }
    total += await splitSheet(SOURCE, IDS, COLS, ROWS, 3);
  }

  if (fs.existsSync(EXTRA_SOURCE)) {
    total += await splitSheet(EXTRA_SOURCE, EXTRA_IDS, 3, 2, 16);
  }

  console.log(`Wrote ${total} boom emojis (${OUT_SIZE}×${OUT_SIZE}) → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
