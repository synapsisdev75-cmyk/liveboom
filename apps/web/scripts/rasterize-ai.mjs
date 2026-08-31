import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SOURCE =
  process.argv[2] ||
  path.join(root, 'assets', 'emojis', 'source-emoticones.ai');
const OUT = process.argv[3] || path.join(root, 'assets', 'emojis', 'source-sheet.png');
const SCALE = Number(process.argv[4] || 4);

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error('Source not found:', SOURCE);
    process.exit(1);
  }

  const data = new Uint8Array(fs.readFileSync(SOURCE));
  const pdf = await getDocument({ data, useSystemFonts: true }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: SCALE });

  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');

  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, canvas.toBuffer('image/png'));
  console.log(`Rasterized ${SOURCE} → ${OUT} (${viewport.width}×${viewport.height}, scale ${SCALE})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
