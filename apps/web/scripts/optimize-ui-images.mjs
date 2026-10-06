#!/usr/bin/env node
// Reduce iconos de interfaz servidos muy por encima de su tamaño en pantalla.
// Mantiene nombre, formato PNG, color de 8 bits sin paleta (sin pérdida de color) y proporción.
// Uso: node scripts/optimize-ui-images.mjs   (desde apps/web)
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC = join(process.cwd(), 'public');

/** Alto máximo en px: ≥ 4× el mayor tamaño mostrado en CSS. */
const TARGETS = [
  { file: 'brand/explore-icon-cut.png', maxHeight: 260 }, // se muestra a 52 px como máximo
  { file: 'reactions/like-on.png', maxHeight: 128 }, // se muestran a ≤ 1.85rem (~30 px)
  { file: 'reactions/like-off.png', maxHeight: 128 },
  { file: 'reactions/dislike-on.png', maxHeight: 128 },
  { file: 'reactions/dislike-off.png', maxHeight: 128 },
];

for (const { file, maxHeight } of TARGETS) {
  const path = join(PUBLIC, file);
  const src = readFileSync(path);
  const meta = await sharp(src).metadata();
  if (!meta.height || meta.height <= maxHeight) {
    console.log(`= ${file} ya mide ${meta.width}x${meta.height}`);
    continue;
  }
  const out = await sharp(src)
    .resize({ height: maxHeight, kernel: 'lanczos3' })
    .png({ palette: false, compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const next = await sharp(out).metadata();
  writeFileSync(path, out);
  console.log(
    `✓ ${file}: ${meta.width}x${meta.height} ${Math.round(src.length / 1024)} KB → ${next.width}x${next.height} ${Math.round(out.length / 1024)} KB`,
  );
}
