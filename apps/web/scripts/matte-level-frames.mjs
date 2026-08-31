import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const assetsDir = path.join(root, 'assets', 'levels', 'frames');
const outDir = path.join(root, 'public', 'levels', 'frames');
const OUT_SIZE = 512;

function idx(x, y, w) {
  return (y * w + x) * 4;
}

/** Negro / gris muy oscuro (fondo o agujero del avatar). */
function isBackgroundPixel(data, i, maxChannel = 118) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min < 52 && max <= maxChannel;
}

const NEIGHBORS8 = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

function floodTransparent(data, width, height, seeds, isMatch) {
  const visited = new Uint8Array(width * height);
  const queue = [];

  for (const p of seeds) {
    if (p < 0 || p >= width * height || visited[p]) continue;
    if (!isMatch(data, p * 4)) continue;
    visited[p] = 1;
    queue.push(p);
  }

  while (queue.length) {
    const p = queue.pop();
    const x = p % width;
    const y = (p - x) / width;
    data[p * 4 + 3] = 0;

    for (const [dx, dy] of NEIGHBORS8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const np = ny * width + nx;
      if (visited[np]) continue;
      if (!isMatch(data, np * 4)) continue;
      visited[np] = 1;
      queue.push(np);
    }
  }
}

function removeOuterBlack(data, width, height, maxChannel = 120) {
  const seeds = [];
  for (let x = 0; x < width; x++) {
    seeds.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seeds.push(y * width, y * width + width - 1);
  }
  floodTransparent(data, width, height, seeds, (d, i) => isBackgroundPixel(d, i, maxChannel));
}

/** Solo negro puro en bordes — evita comerse el metal oscuro del marco MECHA. */
function removePureBlackOuter(data, width, height) {
  removeOuterBlack(data, width, height, 34);
}

/** Agujero central: flood desde el centro + máscara elíptica de respaldo. */
function removeAvatarHole(data, width, height) {
  const cx = Math.floor(width * 0.5);
  const cy = Math.floor(height * 0.405);
  const centerSeed = cy * width + cx;
  floodTransparent(data, width, height, [centerSeed], (d, i) => isBackgroundPixel(d, i, 115));

  const rx = width * 0.335;
  const ry = height * 0.335;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - width * 0.5) / rx;
      const dy = (y - height * 0.405) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const i = idx(x, y, width);
      if (isBackgroundPixel(data, i, 115)) data[i + 3] = 0;
    }
  }
}

/** Quita pixeles muy oscuros pegados a zonas ya transparentes (halos negros). */
function removeBlackHalos(data, width, height) {
  let changed = true;
  let passes = 0;
  while (changed && passes < 6) {
    changed = false;
    passes += 1;
    const alpha = new Uint8Array(width * height);
    for (let p = 0; p < width * height; p++) alpha[p] = data[p * 4 + 3];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        const i = p * 4;
        if (alpha[p] === 0) continue;
        const max = Math.max(data[i], data[i + 1], data[i + 2]);
        if (max > 88) continue;

        let touchesTransparent = false;
        for (const [dx, dy] of NEIGHBORS8) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (alpha[ny * width + nx] === 0) {
            touchesTransparent = true;
            break;
          }
        }
        if (!touchesTransparent) continue;
        data[i + 3] = 0;
        changed = true;
      }
    }
  }
}

function softenDarkFringe(data, width, height) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y, width);
      if (data[i + 3] === 0) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 40 && max <= 82) {
        data[i + 3] = Math.round(data[i + 3] * Math.max(0, (max - 16) / 66));
      }
    }
  }
}

/** Evita halos oscuros al componer PNG transparentes. */
function clearPremultiplied(data) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
    }
  }
}

/** Recorte elíptico del agujero del avatar (más preciso que flood en marcos con placa). */
function removeEllipticalHole(data, width, height, hole) {
  const rx = (width * hole.diameter) / 2;
  const ry = (height * hole.diameter) / 2;
  const cx = width * hole.cx;
  const cy = height * hole.cy;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const i = idx(x, y, width);
      data[i + 3] = 0;
    }
  }
}

const FRAME_HOLES = {
  mecha: { cx: 0.5, cy: 0.358, diameter: 0.48 },
  boom: { cx: 0.5, cy: 0.358, diameter: 0.48 },
};

/** Marcos con placa inferior: fondo negro puro + elipse calibrada. */
const PURE_BORDER_FRAMES = new Set(['mecha', 'boom']);

const FRAMES = [
  ['mecha', 'mecha-source.jpg'],
  ['boom', 'boom-source.jpg'],
  ['fuego', 'fuego-source.jpg'],
  ['impacto', 'impacto-source.jpg'],
  ['estrella', 'estrella-source.jpg'],
  ['corona', 'corona-source.jpg'],
  ['diamante', 'diamante-source.jpg'],
  ['titan', 'titan-source.jpg'],
  ['leyenda', 'leyenda-source.jpg'],
  ['pro', '../pro-v2.jpg'],
];

/** Flood desde bordes solo a través de negro puro (no metal oscuro del marco). */
function removeBorderPureBlack(data, width, height) {
  const visited = new Uint8Array(width * height);
  const queue = [];
  const isPure = (i) => Math.max(data[i], data[i + 1], data[i + 2]) <= 22;

  function push(x, y) {
    const p = y * width + x;
    if (x < 0 || y < 0 || x >= width || y >= height || visited[p]) return;
    const i = p * 4;
    if (!isPure(i)) return;
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
    data[p * 4 + 3] = 0;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }
}

async function processFrame(input, output, slug) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (PURE_BORDER_FRAMES.has(slug)) {
    removeBorderPureBlack(data, info.width, info.height);
    removeEllipticalHole(data, info.width, info.height, FRAME_HOLES[slug]);
  } else {
    removeOuterBlack(data, info.width, info.height);
    const hole = FRAME_HOLES[slug];
    if (hole) {
      removeEllipticalHole(data, info.width, info.height, hole);
    } else {
      removeAvatarHole(data, info.width, info.height);
    }
  }
  removeBlackHalos(data, info.width, info.height);
  softenDarkFringe(data, info.width, info.height);
  clearPremultiplied(data);
  await sharp(data, { raw: info })
    .resize(OUT_SIZE, OUT_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(output);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  for (const [slug, file] of FRAMES) {
    const input = path.join(assetsDir, file);
    const output = path.join(outDir, `${slug}.png`);
    if (!fs.existsSync(input)) {
      console.warn('Missing', input);
      continue;
    }
    await processFrame(input, output, slug);
    console.log('Wrote', output);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
