import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { processBlastIcon } from './matte-blast-icon.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const HTML = path.join(root, 'assets', 'gifts-drive-page.html');
const SRC_DIR = path.join(root, 'assets', 'gifts-drive');
const OUT_DIR = path.join(root, 'public', 'gifts');

/** Drive filename → id interno LiveBoom */
const NAME_MAP = {
  '1 besos.png': 'besito',
  '1 regalo.png': 'corazon_latino',
  '2.png': 'cafecito',
  '3.png': 'arepita',
  '4.png': 'empanadita',
  '5 empanada.png': 'empanadita',
  '6 flor tropical.png': 'flor_tropical',
  '7 maracas.png': 'maracas',
  '8 aguacate.png': 'aguacate',
  '9 piña tropical.png': 'pina_tropical',
  '9 pina tropical.png': 'pina_tropical',
  '10 coco tropical.png': 'coco_caribeno',
  '11 cafe colombiano.png': 'cafe_colombiano',
  '12 arepa venezolana.png': 'arepa_venezolana',
  '13 sombrero llanero.png': 'sombrero_llanero',
  '14 sobrero vueltiao.png': 'sombrero_vueltiao',
  '14 sombrero vueltiao.png': 'sombrero_vueltiao',
  '15 cuatro venezolano.png': 'cuatro_venezolano',
  '16 tucan tropical.png': 'tucan_tropical',
  '17.png': 'guacamaya',
  '18 tambor caribeño.png': 'tambor_caribeno',
  '18 tambor caribeno.png': 'tambor_caribeno',
  '19 botas llaneras.png': 'botas_llaneras',
  '20 caballo criollo.png': 'caballo_criollo',
  '21 fiesta latina.png': 'fiesta_latina',
  '22 bailarina de salsa.png': 'carnaval',
  '23 parranda llanera.png': 'orquesta_tropical',
  '24 chiva colombiana.png': 'reina_del_live',
  '25.png': 'rey_del_flow',
};

function normalizeName(name) {
  return name
    .replace(/^image\s*/i, '')
    .replace(/\s*shared$/i, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseDriveFiles(html) {
  const entries = [];
  const rowRe =
    /data-id="([^"]+)"[^>]*>[\s\S]*?<strong[^>]*>([^<]+)<\/strong>/gi;
  let m;
  while ((m = rowRe.exec(html))) {
    const id = m[1];
    const rawName = m[2].replace(/\s+/g, ' ').trim();
    if (!id || id.length < 20) continue;
    if (/^1tJG6_/.test(id)) continue;
    entries.push({ id, rawName, norm: normalizeName(rawName) });
  }

  const byNorm = new Map();
  for (const entry of entries) {
    if (!entry.norm.endsWith('.png') && !/^\d+$/.test(entry.norm) && !entry.norm.includes(' ')) {
      if (!entry.norm.includes('.')) continue;
    }
    const skip = /^\d+$/.test(entry.norm) && !entry.norm.includes('.png');
    if (skip && !NAME_MAP[entry.norm + '.png']) {
      // keep numbered png aliases handled below
    }
    if (/^\d+$/.test(entry.norm) && !NAME_MAP[entry.norm + '.png']) continue;
    byNorm.set(entry.norm, entry);
  }
  return [...byNorm.values()];
}

async function downloadFile(fileId, dest) {
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${fileId}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5000) {
    const text = buf.toString('utf8');
    if (text.includes('Virus scan warning') || text.includes('confirm=')) {
      const tokenMatch = text.match(/confirm=([0-9A-Za-z_]+)/);
      const token = tokenMatch?.[1];
      if (token) {
        const res2 = await fetch(`${url}&confirm=${token}`);
        const buf2 = Buffer.from(await res2.arrayBuffer());
        fs.writeFileSync(dest, buf2);
        return buf2.length;
      }
    }
  }
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function matteToPng(input, output) {
  const meta = await sharp(input).metadata();
  const hasAlpha = meta.hasAlpha;
  const isJpeg = (meta.format || '').includes('jpeg') || (meta.format || '').includes('jpg');
  if (hasAlpha && !isJpeg) {
    await sharp(input)
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(output);
    return;
  }
  await processBlastIcon(input, output);
}

async function main() {
  if (!fs.existsSync(HTML)) {
    console.error('Missing HTML. Fetch folder page first.');
    process.exit(1);
  }
  fs.mkdirSync(SRC_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const html = fs.readFileSync(HTML, 'utf8');
  const files = parseDriveFiles(html);
  console.log('Parsed', files.length, 'drive entries');

  const imported = [];
  for (const entry of files) {
    const giftId =
      NAME_MAP[entry.norm] ||
      NAME_MAP[`${entry.norm}.png`] ||
      null;
    if (!giftId) {
      console.log('Skip (no map):', entry.rawName);
      continue;
    }

    const srcPath = path.join(SRC_DIR, `${giftId}-raw`);
    const outPath = path.join(OUT_DIR, `${giftId}.png`);
    try {
      const bytes = await downloadFile(entry.id, srcPath);
      if (bytes < 5000) {
        console.warn('Too small, skip', entry.rawName, bytes);
        continue;
      }
      await matteToPng(srcPath, outPath);
      imported.push({ giftId, rawName: entry.rawName, outPath });
      console.log('OK', giftId, '<-', entry.rawName);
    } catch (err) {
      console.warn('Fail', entry.rawName, err.message);
    }
  }

  console.log('\nImported', imported.length, 'gifts →', OUT_DIR);
  for (const row of imported) console.log(' ', row.giftId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
