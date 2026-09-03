import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const input = join(root, 'public/reactions/boom-on.png');
const output = join(root, 'public/reactions/boom-meter.png');

if (!existsSync(input)) {
  console.error('Missing', input);
  process.exit(1);
}

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  // Quitar fondo negro y gris oscuro; conservar bomba y brillos.
  if (r < 42 && g < 42 && b < 48) {
    data[i + 3] = 0;
  } else if (r < 58 && g < 58 && b < 68 && data[i + 3] < 200) {
    data[i + 3] = Math.max(0, data[i + 3] - 120);
  }
}

await sharp(data, {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .png()
  .toFile(output);

console.log('Wrote', output);
