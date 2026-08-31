import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { matteBackground } from './matte-blast-icon.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SOURCE =
  process.argv[2] || path.join(root, 'assets', 'blast', 'source-grid.jpg');

const OUT_DIR = path.join(root, 'public', 'blast');
const OUT_SIZE = 256;

/** 4×4 — orden fila a fila, de menor a mayor tier */
const IDS = [
  'flash',
  'mini',
  'inicio',
  'basico',
  'impulso',
  'plus',
  'popular',
  'fan',
  'pro',
  'power',
  'gold',
  'gold-plus',
  'vip',
  'vip-plus',
  'diamond',
  'diamond-plus',
];

const COLS = 4;
const ROWS = 4;

function processCell(buffer) {
  return sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      matteBackground(data, info.width, info.height);
      return sharp(data, { raw: info })
        .trim({ threshold: 8 })
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
  const H = meta.height ?? 1024;
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
      await processCell(cell).then((img) => img.toFile(path.join(OUT_DIR, `pack-${id}.png`)));

      index++;
    }
  }

  // Titan reutiliza el icono más grande (Diamond+)
  fs.copyFileSync(
    path.join(OUT_DIR, 'pack-diamond-plus.png'),
    path.join(OUT_DIR, 'pack-titan.png'),
  );

  const { processBlastIcon } = await import('./matte-blast-icon.mjs');
  const customIcons = [
    { source: 'pack-flash-source.jpg', out: 'pack-flash.png', label: 'Flash (20 blast)' },
    { source: 'pack-mini-source.jpg', out: 'pack-mini.png', label: 'Mini (40 blast)' },
    { source: 'pack-inicio-source.jpg', out: 'pack-inicio.png', label: 'Inicio (75 blast)' },
    { source: 'pack-basico-source.jpg', out: 'pack-basico.png', label: 'Básico (100 blast)' },
  ];
  for (const icon of customIcons) {
    const src = path.join(root, 'assets', 'blast', icon.source);
    if (fs.existsSync(src)) {
      await processBlastIcon(src, path.join(OUT_DIR, icon.out));
      console.log(`Applied custom ${icon.label} icon`);
    }
  }

  console.log(`Wrote ${index + 1} blast pack icons (${OUT_SIZE}×${OUT_SIZE}) → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
