/**
 * Quita fondo negro de la insignia Mecha (flood-fill desde bordes).
 * Conserva el negro del personaje (bomba).
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SRC = process.argv[2];
const OUT = process.argv[3];
const THRESH = Number(process.argv[4] || 28); // RGB max para "fondo negro"

if (!SRC || !OUT) {
  console.error('Usage: node strip-black-bg.js <src> <out.png> [threshold]');
  process.exit(1);
}

async function main() {
  const { data, info } = await sharp(SRC)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const px = new Uint8ClampedArray(data);
  const visited = new Uint8Array(w * h);
  const queue = [];

  function isBg(i) {
    const o = i * 4;
    const r = px[o];
    const g = px[o + 1];
    const b = px[o + 2];
    const a = px[o + 3];
    if (a < 8) return true;
    // Negro / casi negro (fondo). No tocamos naranjas/amarillos.
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max <= THRESH && max - min <= 12) return true;
    // Gris muy oscuro sin color
    if (max <= THRESH + 10 && max - min <= 8) return true;
    return false;
  }

  function push(x, y) {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (visited[i]) return;
    if (!isBg(i)) return;
    visited[i] = 1;
    queue.push(i);
  }

  // Semillas desde el borde
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }

  while (queue.length) {
    const i = queue.pop();
    const x = i % w;
    const y = (i / w) | 0;
    px[i * 4 + 3] = 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  // Suavizar borde: si vecino es transparente y pixel es casi negro, atenuar
  const copy = new Uint8ClampedArray(px);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const o = i * 4;
      if (copy[o + 3] === 0) continue;
      let transparentNeighbors = 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const j = (y + dy) * w + (x + dx);
        if (copy[j * 4 + 3] === 0) transparentNeighbors++;
      }
      if (transparentNeighbors >= 2) {
        const r = copy[o];
        const g = copy[o + 1];
        const b = copy[o + 2];
        if (Math.max(r, g, b) <= THRESH + 18) {
          px[o + 3] = 0;
        } else if (transparentNeighbors >= 3) {
          px[o + 3] = Math.min(px[o + 3], 160);
        }
      }
    }
  }

  await sharp(Buffer.from(px.buffer), {
    raw: { width: w, height: h, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(OUT);

  const outStat = fs.statSync(OUT);
  console.log('wrote', OUT, w + 'x' + h, outStat.size, 'bytes');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
