import sharp from 'sharp';

function isSheetPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  if (max <= 22) return true;
  if (max <= 40 && chroma <= 18) return true;
  if (min >= 238 && chroma <= 16) return true;
  if (min >= 128 && chroma <= 22) return true;
  return false;
}

function dilateDarkNeighbors(data, art, width, height, radius) {
  if (radius <= 0) return art;
  const out = new Uint8Array(art);
  const dist = new Int16Array(width * height);
  dist.fill(-1);
  const qx = [];
  const qy = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (!art[p]) continue;
      dist[p] = 0;
      qx.push(x);
      qy.push(y);
    }
  }
  for (let i = 0; i < qx.length; i++) {
    const x = qx[i];
    const y = qy[i];
    const d = dist[y * width + x];
    if (d >= radius) continue;
    const next = d + 1;
    const nbs = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of nbs) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const p = ny * width + nx;
      if (dist[p] !== -1) continue;
      const o = p * 4;
      const max = Math.max(data[o], data[o + 1], data[o + 2]);
      if (max > 72) continue;
      dist[p] = next;
      out[p] = 1;
      qx.push(nx);
      qy.push(ny);
    }
  }
  return out;
}

/**
 * Quita solo el fondo de la hoja (negro o blanco conectado a los bordes).
 * Protege negros del dibujo: gafas, cuerpo Boom, piernas, sombras internas.
 */
export function floodMatteSheetBackground(data, width, height, protectRadius) {
  const n = width * height;
  const art = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (!isSheetPixel(data[i], data[i + 1], data[i + 2])) art[p] = 1;
  }
  const radius =
    protectRadius ?? Math.max(4, Math.round(Math.min(width, height) * 0.02));
  const protectedArt = dilateDarkNeighbors(data, art, width, height, radius);

  const mark = new Uint8Array(n);
  const stack = [];

  function tryPush(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (mark[p] || protectedArt[p]) return;
    const i = p * 4;
    if (!isSheetPixel(data[i], data[i + 1], data[i + 2])) return;
    mark[p] = 1;
    stack.push(p);
  }

  for (let x = 0; x < width; x++) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }

  while (stack.length) {
    const p = stack.pop();
    const x = p % width;
    const y = (p - x) / width;
    tryPush(x - 1, y);
    tryPush(x + 1, y);
    tryPush(x, y - 1);
    tryPush(x, y + 1);
  }

  for (let p = 0; p < n; p++) {
    if (!mark[p]) continue;
    const i = p * 4;
    data[i] = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
    data[i + 3] = 0;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      if (data[i + 3] === 0 || protectedArt[p]) continue;
      const nextToBg =
        (x > 0 && mark[p - 1]) ||
        (x + 1 < width && mark[p + 1]) ||
        (y > 0 && mark[p - width]) ||
        (y + 1 < height && mark[p + width]);
      if (!nextToBg) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const chroma = max - min;
      if ((max <= 48 && chroma <= 22) || (min >= 200 && chroma <= 16)) {
        data[i + 3] = Math.round(data[i + 3] * 0.35);
      }
    }
  }
}

export function processSheetCell(buffer, outSize, protectRadius) {
  return sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      floodMatteSheetBackground(data, info.width, info.height, protectRadius);
      return sharp(data, { raw: info })
        .trim({ threshold: 8 })
        .resize(outSize, outSize, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          kernel: sharp.kernel.lanczos3,
        })
        .png({ compressionLevel: 9, effort: 10 });
    });
}
