/**
 * Quita fondo damero del asset VS → PNG transparente.
 */
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'reactions');
const output = join(outDir, 'vs-battle.png');

const defaultInput = join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.cursor/projects/c-Users-empre-Desktop-liveboom/assets',
  'c__Users_empre_AppData_Roaming_Cursor_User_workspaceStorage_1f514ec25f2378156e77f8bb7ab11456_images_Gemini_Generated_Image_tgitutgitutgitut-dd440a96-db8a-43b5-b8b1-d56ce09b6945.jpg',
);

const input = process.argv[2] || defaultInput;
if (!existsSync(input)) {
  console.error('Missing input', input);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const n = width * height;
const bg = new Uint8Array(n);

function idx(x, y) {
  return (y * width + x) * 4;
}

function isBackground(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;
  const avg = (r + g + b) / 3;
  // Damero / gris (claro u oscuro) con baja saturación
  if (sat <= 28 && avg <= 230) return true;
  // Blancos del damero
  if (sat <= 16 && avg >= 200) return true;
  return false;
}

// Marca candidatos de fondo
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const i = idx(x, y);
    if (isBackground(data[i], data[i + 1], data[i + 2])) {
      bg[y * width + x] = 1;
    }
  }
}

// Flood fill solo desde bordes (no agujera el logo)
const stack = [];
const seen = new Uint8Array(n);
function push(x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const p = y * width + x;
  if (seen[p] || !bg[p]) return;
  seen[p] = 1;
  stack.push(p);
}
for (let x = 0; x < width; x += 1) {
  push(x, 0);
  push(x, height - 1);
}
for (let y = 0; y < height; y += 1) {
  push(0, y);
  push(width - 1, y);
}

while (stack.length) {
  const p = stack.pop();
  const x = p % width;
  const y = (p / width) | 0;
  const i = p * 4;
  data[i + 3] = 0;
  push(x + 1, y);
  push(x - 1, y);
  push(x, y + 1);
  push(x, y - 1);
}

// Suaviza halo gris residual cerca del fondo
for (let y = 1; y < height - 1; y += 1) {
  for (let x = 1; x < width - 1; x += 1) {
    const p = y * width + x;
    const i = p * 4;
    if (data[i + 3] === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max - min;
    const avg = (r + g + b) / 3;
    if (sat > 40 || avg > 190) continue;
    let nearClear = 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (data[idx(x + dx, y + dy) + 3] === 0) nearClear += 1;
    }
    if (nearClear >= 2 && sat <= 35) {
      data[i + 3] = 0;
    } else if (nearClear >= 1 && sat <= 22 && avg < 160) {
      data[i + 3] = Math.min(data[i + 3], 80);
    }
  }
}

await sharp(data, {
  raw: { width, height, channels: 4 },
})
  .resize({ width: 512, height: 512, fit: 'inside' })
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log('Wrote', output);
