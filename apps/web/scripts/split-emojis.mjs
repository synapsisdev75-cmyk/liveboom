import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { processSheetCell } from './matte-sheet-cell.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SOURCE_PNG = path.join(root, 'assets', 'emojis', 'source-sheet.png');
const SOURCE_JPG = path.join(root, 'assets', 'emojis', 'source-sheet.jpg');
const SOURCE = process.argv[2] || (fs.existsSync(SOURCE_PNG) ? SOURCE_PNG : SOURCE_JPG);

const OUT_DIR = path.join(root, 'public', 'emojis');
const OUT_SIZE = 768;

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

function processCell(buffer) {
  return processSheetCell(buffer, OUT_SIZE, 96);
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
      const padX = 0;
      const padTop = Math.max(8, Math.round(height * 0.04));
      const padBottom = Math.max(14, Math.round(height * 0.11));
      const cell = await sharp(SOURCE)
        .extract({
          left: left + padX,
          top: top + padTop,
          width: Math.max(16, width - padX * 2),
          height: Math.max(16, height - padTop - padBottom),
        })
        .png()
        .toBuffer();
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
