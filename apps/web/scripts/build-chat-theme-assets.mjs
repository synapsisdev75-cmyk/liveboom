#!/usr/bin/env node
// Genera los fondos oficiales de "Temas del chat" en WebP (thumb / medium / full, vertical y horizontal)
// y la miniatura de cada tema. Sin metadata (sharp no copia EXIF salvo que se pida).
// Uso (desde apps/web): node scripts/build-chat-theme-assets.mjs <carpeta-origen>
// En la carpeta: <id>-portrait.jpg, <id>-landscape.jpg y opcional <id>-preview.jpg
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = process.argv[2];
if (!SRC) {
  console.error('Falta la carpeta de origen');
  process.exit(1);
}
const OUT = join(process.cwd(), 'public', 'chat-themes');

const IDS = [
  'liveboom-original',
  'boom-neon',
  'aurora',
  'fuego-boom',
  'oceano-profundo',
  'galaxia-live',
  'cyber-city',
  'golden-night',
  'candy-boom',
  'selva-digital',
];

/** Lado corto por variante. Nunca se amplía por encima del original. */
const SIZES = { thumb: 160, medium: 420, full: 1080 };

function findSource(base) {
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    const path = join(SRC, `${base}${ext}`);
    if (existsSync(path)) return path;
  }
  return null;
}

async function averageColor(buffer) {
  const { data } = await sharp(buffer).resize(1, 1, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const [r, g, b] = data;
  const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return { hex, lum: Math.round(lum * 100) / 100 };
}

const summary = {};
for (const id of IDS) {
  const dir = join(OUT, id);
  mkdirSync(dir, { recursive: true });
  summary[id] = {};
  for (const orientation of ['portrait', 'landscape']) {
    const src = findSource(`${id}-${orientation}`);
    if (!src) {
      console.warn(`! falta ${id}-${orientation}`);
      continue;
    }
    const input = readFileSync(src);
    for (const [variant, shortSide] of Object.entries(SIZES)) {
      const resize = orientation === 'portrait' ? { width: shortSide } : { height: shortSide };
      const out = await sharp(input)
        .rotate()
        .resize({ ...resize, withoutEnlargement: true, kernel: 'lanczos3' })
        .webp({ quality: variant === 'thumb' ? 60 : 78, effort: 6 })
        .toBuffer();
      writeFileSync(join(dir, `${orientation}-${variant}.webp`), out);
    }
    summary[id][orientation] = await averageColor(input);
  }
  const preview = findSource(`${id}-preview`);
  if (preview) {
    // Las maquetas 4:3 llevan el teléfono a la izquierda y el título a la derecha: solo el teléfono.
    const source = sharp(readFileSync(preview)).rotate();
    const { width = 1024, height = 768 } = await source.metadata();
    const crop = {
      left: Math.round(width * 0.03),
      top: Math.round(height * 0.155),
      width: Math.round(width * 0.268),
      height: Math.round(height * 0.77),
    };
    const out = await source
      .extract(crop)
      .resize({ width: 300, withoutEnlargement: true, kernel: 'lanczos3' })
      .webp({ quality: 72, effort: 6 })
      .toBuffer();
    writeFileSync(join(dir, 'preview.webp'), out);
  }
  console.log(`✓ ${id}`, JSON.stringify(summary[id]));
}
