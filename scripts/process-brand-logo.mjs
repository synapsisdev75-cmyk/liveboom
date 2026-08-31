import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const src =
  'C:/Users/empre/.cursor/projects/c-Users-empre-Desktop-liveboom/assets/c__Users_empre_AppData_Roaming_Cursor_User_workspaceStorage_1f514ec25f2378156e77f8bb7ab11456_images_logo_1-4d3ca995-58be-47fa-b4b4-9afe521a52ea.png';
const outDir = path.join(root, 'apps', 'web', 'public');
const brandDir = path.join(outDir, 'brand');
fs.mkdirSync(brandDir, { recursive: true });

function isOuterBlack(r, g, b) {
  // Fondo negro plano; no tocar el bomb (negro rodeado de colores).
  return r <= 12 && g <= 12 && b <= 12;
}

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const visited = new Uint8Array(width * height);
const stack = [];
const seeds = [
  [0, 0],
  [width - 1, 0],
  [0, height - 1],
  [width - 1, height - 1],
  [Math.floor(width / 2), 0],
  [Math.floor(width / 2), height - 1],
  [0, Math.floor(height / 2)],
  [width - 1, Math.floor(height / 2)],
];
for (const [sx, sy] of seeds) {
  const si = sy * width + sx;
  const i = si * channels;
  if (isOuterBlack(data[i], data[i + 1], data[i + 2])) {
    stack.push(sx, sy);
    visited[si] = 1;
  }
}
while (stack.length) {
  const y = stack.pop();
  const x = stack.pop();
  const idx = (y * width + x) * channels;
  data[idx + 3] = 0;
  for (const [nx, ny] of [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ]) {
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const ni = ny * width + nx;
    if (visited[ni]) continue;
    const p = ni * channels;
    if (!isOuterBlack(data[p], data[p + 1], data[p + 2])) continue;
    visited[ni] = 1;
    stack.push(nx, ny);
  }
}

const transparent = await sharp(data, { raw: { width, height, channels } }).png().toBuffer();
const trimmed = await sharp(transparent).trim({ threshold: 1 }).png().toBuffer();
const meta = await sharp(trimmed).metadata();

await sharp(trimmed)
  .resize(1200, 1200, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(brandDir, 'logo.png'));

await sharp(trimmed)
  .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(outDir, 'logo.png'));

await sharp(trimmed)
  .resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(outDir, 'apple-touch-icon.png'));

await sharp(trimmed)
  .resize(48, 48, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(outDir, 'favicon.png'));

const fav64 = await sharp(trimmed)
  .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
fs.writeFileSync(
  path.join(outDir, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><image href="data:image/png;base64,${fav64.toString('base64')}" width="64" height="64"/></svg>`,
);

console.log('done', { trimmed: `${meta.width}x${meta.height}` });
