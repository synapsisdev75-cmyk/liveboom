import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const OUT_SIZE = 384;

function idx(x, y, w) {
  return (y * w + x) * 4;
}

/** Flood-fill desde bordes: elimina fondo negro conectado. */
function removeBlackBackground(data, width, height) {
  const visited = new Uint8Array(width * height);
  const queue = [];

  function isBackground(x, y) {
    const i = idx(x, y, width);
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max - min < 36 && max <= 120;
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

  // Suaviza halos oscuros restantes en bordes del recorte
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y, width);
      if (data[i + 3] === 0) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 32 && max <= 72) {
        const fringe = Math.min(1, (max - 20) / 52);
        data[i + 3] = Math.round(data[i + 3] * (1 - fringe));
      } else if (max - min < 28 && min <= 40) {
        const fringe = Math.min(1, (40 - min) / 28);
        data[i + 3] = Math.round(data[i + 3] * (1 - fringe * 0.65));
      }
    }
  }
}

export function matteBackground(data, width, height) {
  removeBlackBackground(data, width, height);
}

function clearPremultiplied(data) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
    }
  }
}

export function processBlastIcon(input, output) {
  return sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      matteBackground(data, info.width, info.height);
      clearPremultiplied(data);
      return sharp(data, { raw: info })
        .trim({ threshold: 12 })
        .resize(OUT_SIZE, OUT_SIZE, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          kernel: sharp.kernel.lanczos3,
        })
        .png({ compressionLevel: 9, effort: 10 })
        .toFile(output);
    });
}

async function main() {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) {
    console.error('Usage: node matte-blast-icon.mjs <input> <output.png>');
    process.exit(1);
  }
  if (!fs.existsSync(input)) {
    console.error('Input not found:', input);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  await processBlastIcon(input, output);
  console.log('Wrote', output);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
