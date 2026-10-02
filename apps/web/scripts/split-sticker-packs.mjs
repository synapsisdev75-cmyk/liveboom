import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const SRC_DIR = path.join(root, 'assets', 'stickers');
const OUT_DIR = path.join(root, 'public', 'stickers');
const CATALOG_FILE = path.join(root, 'src', 'lib', 'stickerPacks.data.ts');

const OUT_SIZE = 400;

/**
 * Hojas fuente (1024×1024). Etiquetas fila a fila, izquierda a derecha.
 * `bg`: fondo de la hoja — se elimina; queda la silueta con borde blanco.
 */
const SHEETS = [
  {
    file: 'anime-1.jpg',
    pack: 'anime',
    prefix: 'anime1',
    cols: 5,
    rows: 5,
    bg: 'dark',
    labels: [
      'Chica luna', 'Poder azul', 'Ninja victoria', 'Gamer', 'Chica gatita',
      'Diablita', 'Slime brote', 'Kitsune', 'Samurái', 'Idol',
      'Vampiro rosa', 'Dormilón', 'Ramen', 'TQM', 'Vamos',
      'Enojado', 'Sonrojada', 'Jajaja', 'OMG', 'Hola',
      'Bye', 'Shhh', 'Paz', 'Épico', 'Conejita',
    ],
  },
  {
    file: 'anime-2.jpg',
    pack: 'anime',
    prefix: 'anime2',
    cols: 5,
    rows: 5,
    bg: 'dark',
    labels: [
      'Alegría', 'Risa', 'Llanto', 'Dormilón pingüino', 'Furia',
      'Gatita patitas', 'Gafas cool', 'Ojos corazón', 'Slime guiño', 'Kitsune feliz',
      'Gamer feliz', 'Diablita paz', 'Conejita tímida', 'Puño de fuego', 'Saludo idol',
      'Confundido', 'Tímida', 'Poder', 'Beso', 'Rey',
      'Sorpresa', 'Paz verde', 'Kitsune patitas', 'Diablita corazón', 'Slime feliz',
    ],
  },
  {
    file: 'anime-3.jpg',
    pack: 'anime',
    prefix: 'anime3',
    cols: 5,
    rows: 5,
    bg: 'light',
    labels: [
      'Wow', 'Yep', 'Zzz conejo', 'Diablita garras', 'Hey',
      'Kitsune máscara', 'Ramen ñam', 'Genial', 'Príncipe', 'Carta de amor',
      'Gatito nieve', 'Idol micrófono', 'Ninja', 'Sacerdotisa', 'LOL',
      'Chocolate caliente', 'Diablita enojada', 'TQM corazón', 'Nice', 'Nooo',
      'Estudiando', 'Ay', 'Kitsune corazón', 'Brujita', 'Ups',
    ],
  },
  {
    file: 'expresiones.jpg',
    pack: 'expresiones',
    prefix: 'expr',
    cols: 5,
    rows: 6,
    bg: 'light',
    labels: [
      'Qué rabia', 'Te quiero', 'Uff', 'Jajaja', 'Abrazo gatito',
      'Wow', 'Corazón roto', 'Pena', 'Estrellas', 'Vamos',
      'Triste', 'Llanto', 'Ay no', 'Dudas', 'Hmm',
      'Ok', 'No', 'Sí claro', 'Zzz', 'Tengo hambre',
      'Brutal', 'Hey', 'Sonrojada', 'Qué cansancio', 'Estrés',
      'Feliz', 'Meh', 'Jeje', 'Zen', 'Tú puedes',
    ],
  },
  {
    file: 'fantasmitas.jpg',
    pack: 'fantasmitas',
    prefix: 'ghost',
    cols: 6,
    rows: 5,
    bg: 'light',
    labels: [
      'Hola', 'Jajaja', 'Dormilón', 'Llorón', 'OMG', 'Enojado',
      'Tímido', 'TQM', 'Diablillo', 'Halloween', 'Música', 'Gamer',
      'Farol', 'Gatito', 'Vela', 'Luna', 'Cadenas', 'Mago',
      'Rockero', 'Ternura', 'Boo', 'Pulgar arriba', 'Épico', 'Ups',
      'Bye', 'Angelito', 'Shhh', 'Fiesta', 'Gatito negro', 'Boba',
    ],
  },
  {
    file: 'corazones.jpg',
    pack: 'corazones',
    prefix: 'heart',
    cols: 3,
    rows: 5,
    bg: 'light',
    labels: [
      'Feliz', 'Abrazo', 'Roto',
      'Tierno', 'Galaxia', 'Dormilón',
      'Llorón', 'Furioso', 'Mago',
      'Gamer', 'Gatito', 'Angelito',
      'Fuego', 'Fiesta', 'Amor',
    ],
  },
  {
    file: 'animales.jpg',
    pack: 'animales',
    prefix: 'animal',
    cols: 5,
    rows: 5,
    bg: 'light',
    labels: [
      'Cóndor', 'Jaguar', 'Oso de anteojos', 'Capibara', 'Delfín rosado',
      'Tití', 'Mono aullador', 'Perezoso', 'Tucán', 'Guacamaya',
      'Rana dardo', 'Tortuga', 'Ballena', 'Caimán', 'Iguana',
      'Colibrí', 'Venado', 'Armadillo', 'Oso hormiguero', 'Tigrillo',
      'Zorro', 'Danta', 'Zarigüeya', 'Capibara enamorada', 'Búho',
    ],
  },
  {
    file: 'frutas.jpg',
    pack: 'frutas',
    prefix: 'fruit',
    cols: 6,
    rows: 5,
    bg: 'light',
    labels: [
      'Lulo', 'Uchuva', 'Guanábana', 'Maracuyá', 'Granadilla', 'Curuba',
      'Feijoa', 'Guayaba', 'Mango', 'Papaya', 'Piña', 'Banano',
      'Mangostino', 'Ciruela', 'Zapote', 'Tamarindo', 'Níspero', 'Moras',
      'Tomate de árbol', 'Pitahaya', 'Coco', 'Limón', 'Naranja', 'Mandarina',
      'Aguacate', 'Gulupa', 'Mamoncillo', 'Cereza', 'Arazá', 'Caimito',
    ],
  },
];

const PACKS = [
  { id: 'anime', label: 'Anime' },
  { id: 'expresiones', label: 'Expresiones' },
  { id: 'fantasmitas', label: 'Fantasmitas' },
  { id: 'corazones', label: 'Corazones' },
  { id: 'animales', label: 'Animales' },
  { id: 'frutas', label: 'Frutas' },
];

function isForeground(r, g, b, bg) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (bg === 'dark') return max > 48;
  return min < 215 || max - min > 30;
}

/** Componentes conexos del contenido: etiqueta por píxel + caja y centroide. */
function findComponents(data, W, H, channels, bg) {
  const mask = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += channels) {
    if (isForeground(data[p], data[p + 1], data[p + 2], bg)) mask[i] = 1;
  }
  const labels = new Int32Array(W * H).fill(-1);
  const stack = new Int32Array(W * H);
  const comps = [];
  for (let start = 0; start < W * H; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    const id = comps.length;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = id;
    let minX = W, minY = H, maxX = 0, maxY = 0, area = 0, sx = 0, sy = 0;
    while (sp > 0) {
      const idx = stack[--sp];
      const x = idx % W;
      const y = (idx - x) / W;
      area++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= W) continue;
          const n = ny * W + nx;
          if (mask[n] && labels[n] === -1) {
            labels[n] = id;
            stack[sp++] = n;
          }
        }
      }
    }
    comps.push({ minX, minY, maxX, maxY, area, cx: sx / area, cy: sy / area });
  }
  return { labels, comps };
}

/**
 * Separa componentes que unen varios stickers por el "puente" donde se tocan: erosiona hasta que se
 * separen, toma cada núcleo como semilla de su celda y crece por el contenido original (BFS).
 */
function splitMerged(labels, mergedIds, W, H, cellOf) {
  const inMerged = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (mergedIds.has(labels[i])) inMerged[i] = 1;

  const pixelCell = new Int16Array(W * H).fill(-1);
  const queue = new Int32Array(W * H);
  let head = 0;
  let tail = 0;

  const core = erode(inMerged, W, H, 5);
  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  for (let start = 0; start < W * H; start++) {
    if (!core[start] || seen[start]) continue;
    const pixels = [];
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let sx = 0;
    let sy = 0;
    let minX = W, minY = H, maxX = 0, maxY = 0;
    while (sp > 0) {
      const i = stack[--sp];
      pixels.push(i);
      const x = i % W;
      const y = (i - x) / W;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const nbrs = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const n of nbrs) {
        if (n >= 0 && core[n] && !seen[n]) {
          seen[n] = 1;
          stack[sp++] = n;
        }
      }
    }
    if (pixels.length < 200) continue;
    const spansCells = cellOf(minX, minY) !== cellOf(maxX, maxY);
    const cell = cellOf(sx / pixels.length, sy / pixels.length);
    for (const i of pixels) {
      pixelCell[i] = spansCells ? cellOf(i % W, Math.floor(i / W)) : cell;
      queue[tail++] = i;
    }
  }

  while (head < tail) {
    const i = queue[head++];
    const x = i % W;
    const y = (i - x) / W;
    const nbrs = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
    for (const n of nbrs) {
      if (n >= 0 && inMerged[n] && pixelCell[n] === -1) {
        pixelCell[n] = pixelCell[i];
        queue[tail++] = n;
      }
    }
  }

  for (let i = 0; i < W * H; i++) {
    if (inMerged[i] && pixelCell[i] === -1) pixelCell[i] = cellOf(i % W, Math.floor(i / W));
  }
  return pixelCell;
}

function boxGap(a, b) {
  const gx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const gy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  return Math.hypot(gx, gy);
}

/**
 * Dueño (celda) de cada píxel de contenido.
 * - Cuerpos grandes → celda de su centroide.
 * - Componentes que unen varios stickers (se tocan en la hoja) → se reparten píxel a píxel.
 * - Piezas sueltas (texto, brillos, corazones) → el cuerpo más cercano, aunque crucen la rejilla.
 */
function assignOwners(labels, comps, W, H, sheet) {
  const cellW = W / sheet.cols;
  const cellH = H / sheet.rows;
  const cellOf = (x, y) =>
    Math.min(sheet.rows - 1, Math.floor(y / cellH)) * sheet.cols +
    Math.min(sheet.cols - 1, Math.floor(x / cellW));
  const majorArea = cellW * cellH * 0.12;
  const isMerged = (c) => c.maxX - c.minX > cellW * 1.3 || c.maxY - c.minY > cellH * 1.3;

  const majors = [];
  const compOwner = comps.map(() => -2);
  const mergedIds = new Set();
  comps.forEach((c, id) => {
    if (c.area < 40) return;
    if (isMerged(c)) {
      compOwner[id] = -1;
      mergedIds.add(id);
    } else if (c.area >= majorArea) {
      const cell = cellOf(c.cx, c.cy);
      compOwner[id] = cell;
      majors.push({ cell, ...c });
    }
  });

  const pixelCell = mergedIds.size ? splitMerged(labels, mergedIds, W, H, cellOf) : null;

  if (pixelCell) {
    const parts = new Map();
    for (let i = 0; i < W * H; i++) {
      if (!mergedIds.has(labels[i])) continue;
      const x = i % W;
      const y = (i - x) / W;
      const cell = pixelCell[i];
      const p = parts.get(cell) || { cell, minX: x, minY: y, maxX: x, maxY: y };
      p.minX = Math.min(p.minX, x);
      p.minY = Math.min(p.minY, y);
      p.maxX = Math.max(p.maxX, x);
      p.maxY = Math.max(p.maxY, y);
      parts.set(cell, p);
    }
    majors.push(...parts.values());
  }

  const cellsWithMajor = new Set(majors.map((m) => m.cell));
  const total = sheet.cols * sheet.rows;
  for (let cell = 0; cell < total; cell++) {
    if (cellsWithMajor.has(cell)) continue;
    let best = -1;
    comps.forEach((c, id) => {
      if (compOwner[id] !== -2 || c.area < 40 || cellOf(c.cx, c.cy) !== cell) return;
      if (best === -1 || c.area > comps[best].area) best = id;
    });
    if (best !== -1) {
      compOwner[best] = cell;
      majors.push({ cell, ...comps[best] });
    }
  }

  comps.forEach((c, id) => {
    if (compOwner[id] !== -2 || c.area < 40) return;
    let bestCell = cellOf(c.cx, c.cy);
    let bestGap = Infinity;
    for (const m of majors) {
      const gap = boxGap(c, m);
      if (gap < bestGap) {
        bestGap = gap;
        bestCell = m.cell;
      }
    }
    compOwner[id] = c.area < 300 && bestGap > 28 ? -2 : bestCell;
  });
  const owner = new Int16Array(W * H).fill(-2);
  for (let i = 0; i < W * H; i++) {
    const l = labels[i];
    if (l < 0) continue;
    const o = compOwner[l];
    if (o === -2) continue;
    owner[i] = o === -1 ? pixelCell[i] : o;
  }
  return owner;
}

/** Máscara binaria dilatada (cuadrado de radio r), separable. */
function dilate(mask, w, h, r) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -Infinity;
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) last = x;
      if (x - last <= r) tmp[y * w + x] = 1;
    }
    last = Infinity;
    for (let x = w - 1; x >= 0; x--) {
      if (mask[y * w + x]) last = x;
      if (last - x <= r) tmp[y * w + x] = 1;
    }
  }
  for (let x = 0; x < w; x++) {
    let last = -Infinity;
    for (let y = 0; y < h; y++) {
      if (tmp[y * w + x]) last = y;
      if (y - last <= r) out[y * w + x] = 1;
    }
    last = Infinity;
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) last = y;
      if (last - y <= r) out[y * w + x] = 1;
    }
  }
  return out;
}

/** Rellena huecos interiores (todo lo no alcanzable desde el borde pasa a 1). */
function fillHoles(mask, w, h) {
  const outside = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const push = (i) => {
    if (!mask[i] && !outside[i]) {
      outside[i] = 1;
      stack[sp++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (sp > 0) {
    const i = stack[--sp];
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}

function toGray(mask) {
  const buf = Buffer.alloc(mask.length);
  for (let i = 0; i < mask.length; i++) buf[i] = mask[i] ? 255 : 0;
  return buf;
}

/** Dilatación redondeada (desenfoque gaussiano + umbral) para un contorno de sticker suave. */
async function roundDilate(mask, w, h, r) {
  const blurred = await sharp(toGray(mask), { raw: { width: w, height: h, channels: 1 } })
    .blur(Math.max(0.3, r / 2))
    .extractChannel(0)
    .raw()
    .toBuffer();
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = mask[i] || blurred[i] > 7 ? 1 : 0;
  return out;
}

function erode(mask, w, h, r) {
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inv[i] = mask[i] ? 0 : 1;
  const grown = dilate(inv, w, h, r);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = grown[i] ? 0 : 1;
  return out;
}

/**
 * Quita astillas de stickers vecinos: conserva la pieza mayor y las piezas a ≤ `maxGap` px de ella
 * (o grandes por sí mismas). En hojas oscuras el borde blanco encierra todo, así que `maxGap` = 0.
 */
async function keepMainParts(mask, w, h, maxGap) {
  const comp = new Int32Array(w * h).fill(-1);
  const areas = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || comp[start] !== -1) continue;
    const id = areas.length;
    let area = 0;
    let sp = 0;
    stack[sp++] = start;
    comp[start] = id;
    while (sp > 0) {
      const i = stack[--sp];
      area++;
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (mask[n] && comp[n] === -1) {
            comp[n] = id;
            stack[sp++] = n;
          }
        }
      }
    }
    areas.push(area);
  }
  if (areas.length <= 1) return mask;
  const mainId = areas.indexOf(Math.max(...areas));
  const main = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (comp[i] === mainId) main[i] = 1;
  const near = maxGap > 0 ? await roundDilate(main, w, h, maxGap) : main;
  const keepIds = new Set([mainId]);
  for (let i = 0; i < w * h; i++) {
    const id = comp[i];
    if (id < 0 || keepIds.has(id)) continue;
    if ((maxGap > 0 && near[i]) || areas[id] >= areas[mainId] * 0.25) keepIds.add(id);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (comp[i] >= 0 && keepIds.has(comp[i])) out[i] = 1;
  return out;
}

/** Alfa con borde antialias. */
async function softEdge(mask, w, h) {
  return sharp(toGray(mask), { raw: { width: w, height: h, channels: 1 } })
    .blur(0.7)
    .extractChannel(0)
    .raw()
    .toBuffer();
}

async function splitSheet(sheet) {
  const source = path.join(SRC_DIR, sheet.file);
  const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const channels = info.channels;
  const { labels, comps } = findComponents(data, W, H, channels, sheet.bg);
  const owner = assignOwners(labels, comps, W, H, sheet);
  /** Hojas oscuras ya traen el borde blanco; en las claras el borde blanco se pierde con el fondo. */
  const border = sheet.bg === 'dark' ? 3.5 : 10;
  const pad = Math.ceil(border) + 4;
  const out = [];

  for (let row = 0; row < sheet.rows; row++) {
    for (let col = 0; col < sheet.cols; col++) {
      const index = row * sheet.cols + col;
      const label = sheet.labels[index];
      if (!label) continue;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < W * H; i++) {
        if (owner[i] !== index) continue;
        const x = i % W;
        const y = (i - x) / W;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (!Number.isFinite(minX)) throw new Error(`${sheet.file}: celda ${index + 1} vacía`);
      minX = Math.max(0, minX - pad - 1);
      minY = Math.max(0, minY - pad - 1);
      maxX = Math.min(W - 1, maxX + pad + 1);
      maxY = Math.min(H - 1, maxY + pad + 1);
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;

      const own = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (owner[(minY + y) * W + minX + x] === index) own[y * w + x] = 1;
        }
      }
      const art = fillHoles(await keepMainParts(own, w, h, sheet.bg === 'dark' ? 0 : 30), w, h);
      const silhouette = fillHoles(await roundDilate(art, w, h, border), w, h);
      const solid = sheet.bg === 'dark' ? erode(art, w, h, 2) : art;
      const alpha = await softEdge(silhouette, w, h);

      const pixels = Buffer.alloc(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const o = i * 4;
          const src = (minY + y) * W + minX + x;
          const p = src * channels;
          const inArt = solid[i] && (owner[src] === index || owner[src] === -2);
          pixels[o] = inArt ? data[p] : 255;
          pixels[o + 1] = inArt ? data[p + 1] : 255;
          pixels[o + 2] = inArt ? data[p + 2] : 255;
          pixels[o + 3] = alpha[i];
        }
      }

      const side = Math.round(Math.max(w, h) * 1.04);
      const extendX = side - w;
      const extendY = side - h;

      const id = `${sheet.prefix}_${String(index + 1).padStart(2, '0')}`;
      const file = `${sheet.pack}/${id}.webp`;
      fs.mkdirSync(path.join(OUT_DIR, sheet.pack), { recursive: true });

      const squared = await sharp(pixels, { raw: { width: w, height: h, channels: 4 } })
        .extend({
          left: Math.floor(extendX / 2),
          right: Math.ceil(extendX / 2),
          top: Math.floor(extendY / 2),
          bottom: Math.ceil(extendY / 2),
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png()
        .toBuffer();

      await sharp(squared)
        .resize(OUT_SIZE, OUT_SIZE, { kernel: 'lanczos3' })
        .sharpen({ sigma: 0.5 })
        .webp({ quality: 90, alphaQuality: 100, effort: 5 })
        .toFile(path.join(OUT_DIR, file));

      out.push({ id, label, pack: sheet.pack, src: `/stickers/${file}` });
    }
  }
  return out;
}

function writeCatalog(items) {
  const lines = [
    '/* Generado por scripts/split-sticker-packs.mjs — no editar a mano. */',
    '',
    'export type StickerPackId =',
    ...PACKS.map((p, i) => `  ${i === 0 ? '' : '| '}'${p.id}'${i === PACKS.length - 1 ? ';' : ''}`),
    '',
    'export type StickerPackItem = { id: string; label: string; src: string; pack: StickerPackId };',
    '',
    'export const STICKER_PACKS: { id: StickerPackId; label: string }[] = [',
    ...PACKS.map((p) => `  { id: '${p.id}', label: '${p.label}' },`),
    '];',
    '',
    'export const STICKER_PACK_ITEMS: StickerPackItem[] = [',
    ...items.map(
      (s) => `  { id: '${s.id}', label: '${s.label.replace(/'/g, "\\'")}', src: '${s.src}', pack: '${s.pack}' },`,
    ),
    '];',
    '',
  ];
  fs.writeFileSync(CATALOG_FILE, lines.join('\n'));
}

async function main() {
  const all = [];
  for (const sheet of SHEETS) {
    const items = await splitSheet(sheet);
    console.log(`${sheet.file}: ${items.length}`);
    all.push(...items);
  }
  const byPack = new Map(PACKS.map((p) => [p.id, []]));
  for (const item of all) byPack.get(item.pack).push(item);
  writeCatalog(PACKS.flatMap((p) => byPack.get(p.id)));
  console.log(`Wrote ${all.length} stickers (${OUT_SIZE}×${OUT_SIZE}) → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
