import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processBlastIcon } from './matte-blast-icon.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const assetsDir = path.join(root, 'assets', 'levels');
const outDir = path.join(root, 'public', 'levels');

/** slug → source filename in assets/levels/ */
const BADGES = [
  ['mecha', 'mecha-insignia-source.jpg'],
  ['boom', 'boom-insignia-source.jpg'],
  ['fuego', 'fuego-v2.jpg'],
  ['impacto', 'impacto-v2.jpg'],
  ['estrella', 'estrella-v2.jpg'],
  ['corona', 'corona-v2.jpg'],
  ['diamante', 'diamante-v2.jpg'],
  ['titan', 'titan-v2.jpg'],
  ['leyenda', 'leyenda-v2.jpg'],
  ['pro', 'pro-v2.jpg'],
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  for (const [slug, file] of BADGES) {
    const input = path.join(assetsDir, file);
    const output = path.join(outDir, `${slug}.png`);
    if (!fs.existsSync(input)) {
      console.warn('Missing', input);
      continue;
    }
    await processBlastIcon(input, output);
    console.log('Wrote', output);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
