/**
 * Íconos de la app (favicon, apple-touch, PWA any/maskable) con el emblema LB centrado
 * y dentro de la zona segura, para que iOS / Android / tablets no recorten las iniciales.
 *
 * Uso: node scripts/build-app-icons.mjs
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pub = path.join(root, 'apps', 'web', 'public');
const src = path.join(pub, 'brand', 'icon-1024.png');

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const N = W * H;

/** Distancia (chamfer) de cada píxel al exterior transparente del marco original. */
const dist = new Float32Array(N);
for (let i = 0; i < N; i += 1) {
  const x = i % W;
  const y = (i / W) | 0;
  const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
  dist[i] = edge || data[i * C + 3] < 128 ? 0 : 1e9;
}
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const i = y * W + x;
    if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
    if (y > 0) dist[i] = Math.min(dist[i], dist[i - W] + 1);
    if (x > 0 && y > 0) dist[i] = Math.min(dist[i], dist[i - W - 1] + 1.414);
    if (x < W - 1 && y > 0) dist[i] = Math.min(dist[i], dist[i - W + 1] + 1.414);
  }
}
for (let y = H - 1; y >= 0; y -= 1) {
  for (let x = W - 1; x >= 0; x -= 1) {
    const i = y * W + x;
    if (x < W - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
    if (y < H - 1) dist[i] = Math.min(dist[i], dist[i + W] + 1);
    if (x < W - 1 && y < H - 1) dist[i] = Math.min(dist[i], dist[i + W + 1] + 1.414);
    if (x > 0 && y < H - 1) dist[i] = Math.min(dist[i], dist[i + W - 1] + 1.414);
  }
}

const rgb = (i) => [data[i * C], data[i * C + 1], data[i * C + 2]];
/** Fondo azul marino (y sombras azuladas) del ícono original. */
function isNavy(i) {
  const [r, g, b] = rgb(i);
  return Math.max(r, g, b) < 110 && b >= r + 12 && b >= g + 4;
}
/** Borde claro del marco redondeado original. */
function isFrameRim(i) {
  const [r, g, b] = rgb(i);
  return dist[i] < 30 && b > r + 20 && b > g + 10;
}

const bg = new Uint8Array(N);
const stack = [];
for (let i = 0; i < N; i += 1) {
  if (dist[i] === 0 || isFrameRim(i) || (dist[i] < 48 && isNavy(i))) {
    bg[i] = 1;
    stack.push(i);
  }
}
while (stack.length) {
  const i = stack.pop();
  const x = i % W;
  const y = (i / W) | 0;
  const [r, g, b] = rgb(i);
  for (const n of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
    if (n < 0 || bg[n]) continue;
    if (!isNavy(n)) continue;
    const [nr, ng, nb] = rgb(n);
    if (dist[i] > 0 && Math.abs(nr - r) + Math.abs(ng - g) + Math.abs(nb - b) > 40) continue;
    bg[n] = 1;
    stack.push(n);
  }
}

const fg = Buffer.alloc(N * 4);
let minX = W;
let minY = H;
let maxX = 0;
let maxY = 0;
for (let i = 0; i < N; i += 1) {
  const a = bg[i] ? 0 : 255;
  fg[i * 4] = data[i * C];
  fg[i * 4 + 1] = data[i * C + 1];
  fg[i * 4 + 2] = data[i * C + 2];
  fg[i * 4 + 3] = a;
  if (a) {
    const x = i % W;
    const y = (i / W) | 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
}

/** Suaviza el borde del recorte (antialias) sin cambiar los colores. */
const alphaSoft = await sharp(Buffer.from(fg.filter((_, k) => k % 4 === 3)), { raw: { width: W, height: H, channels: 1 } })
  .blur(0.8)
  .extractChannel(0)
  .raw()
  .toBuffer();
if (alphaSoft.length !== N) throw new Error(`alpha ${alphaSoft.length} != ${N}`);
for (let i = 0; i < N; i += 1) fg[i * 4 + 3] = Math.min(fg[i * 4 + 3], alphaSoft[i]);

const bw = maxX - minX + 1;
const bh = maxY - minY + 1;
const emblem = await sharp(fg, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left: minX, top: minY, width: bw, height: bh })
  .png()
  .toBuffer();
fs.mkdirSync(path.join(pub, 'brand'), { recursive: true });
await sharp(emblem).toFile(path.join(pub, 'brand', 'emblem-lb.png'));

function backgroundSvg(size, rounded) {
  const radius = rounded ? Math.round(size * 0.22) : 0;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <radialGradient id="g" cx="50%" cy="44%" r="72%">
      <stop offset="0" stop-color="#143f96"/>
      <stop offset="0.5" stop-color="#072462"/>
      <stop offset="1" stop-color="#020b24"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#g)"/>
</svg>`);
}

/**
 * @param size lado final
 * @param scale fracción del lado que ocupa el lado mayor del emblema
 * @param rounded esquinas redondeadas transparentes (solo pestaña del navegador)
 */
async function renderIcon(size, scale, rounded = false) {
  const target = Math.round(size * scale);
  const ratio = Math.min(target / bw, target / bh);
  const ew = Math.max(1, Math.round(bw * ratio));
  const eh = Math.max(1, Math.round(bh * ratio));
  const art = await sharp(emblem).resize(ew, eh, { kernel: 'lanczos3' }).png().toBuffer();
  const left = Math.round((size - ew) / 2);
  const top = Math.round((size - eh) / 2);
  const shadowAlpha = await sharp(art).extractChannel('alpha').blur(Math.max(0.6, size / 90)).toBuffer();
  const shadow = await sharp({
    create: { width: ew, height: eh, channels: 3, background: { r: 0, g: 4, b: 18 } },
  })
    .joinChannel(shadowAlpha)
    .png()
    .toBuffer();
  const layers = [
    { input: shadow, left, top: Math.min(size - eh, top + Math.round(size / 80)), blend: 'over' },
    { input: art, left, top },
  ];
  let out = sharp(backgroundSvg(size, rounded)).composite(layers);
  if (rounded) {
    out = sharp(await out.png().toBuffer()).composite([
      { input: backgroundSvg(size, true), blend: 'dest-in' },
    ]);
  }
  return out.png({ compressionLevel: 9 }).toBuffer();
}

const write = (rel, buf) => fs.writeFileSync(path.join(pub, rel), buf);

// "any": iOS / tablets / PWA aplican su propia máscara; el emblema queda dentro del 80 % central.
write('brand/app-icon-1024.png', await renderIcon(1024, 0.78));
write('apple-touch-icon.png', await renderIcon(180, 0.78));
write('brand/app-icon-192.png', await renderIcon(192, 0.78));
write('brand/app-icon-512.png', await renderIcon(512, 0.78));
// "maskable": Android recorta hasta un círculo del 80 %; el emblema completo cabe en él.
write('brand/app-icon-maskable-512.png', await renderIcon(512, 0.6));
write('brand/app-icon-maskable-192.png', await renderIcon(192, 0.6));

// Pestaña del navegador: baldosa redondeada, emblema grande y centrado.
const fav16 = await renderIcon(16, 0.94, true);
const fav32 = await renderIcon(32, 0.92, true);
const fav48 = await renderIcon(48, 0.9, true);
const fav128 = await renderIcon(128, 0.88, true);
write('favicon-32.png', fav32);
write('favicon.png', fav48);
write(
  'favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><image href="data:image/png;base64,${fav128.toString('base64')}" width="128" height="128"/></svg>`,
);

/** ICO con entradas PNG (16/32/48). */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach(({ size, png }, k) => {
    const o = k * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}
write(
  'favicon.ico',
  buildIco([
    { size: 16, png: fav16 },
    { size: 32, png: fav32 },
    { size: 48, png: fav48 },
  ]),
);

console.log('icons ok', { emblem: `${bw}x${bh}`, bbox: { minX, minY, maxX, maxY } });
