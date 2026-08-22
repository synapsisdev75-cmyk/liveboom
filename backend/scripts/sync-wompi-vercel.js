/**
 * Sincroniza variables Wompi de backend/.env a Vercel (production + preview)
 * sin imprimir secretos. Uso: node backend/scripts/sync-wompi-vercel.js
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function clean(value) {
  return String(value || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '');
}

function loadEnv(filePath) {
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i).trim()] = clean(line.slice(i + 1));
  }
  return out;
}

const envPath = path.join(__dirname, '..', '.env');
const env = loadEnv(envPath);
const keys = [
  'WOMPI_PUBLIC_KEY',
  'WOMPI_PRIVATE_KEY',
  'WOMPI_EVENTS_SECRET',
  'WOMPI_INTEGRITY_SECRET',
];

const missing = keys.filter((key) => !env[key]);
if (missing.length) {
  console.error('Faltan en backend/.env:', missing.join(', '));
  process.exit(1);
}

const pub = env.WOMPI_PUBLIC_KEY;
const integrity = env.WOMPI_INTEGRITY_SECRET;
const pairOk =
  (pub.startsWith('pub_test_') && integrity.startsWith('test_integrity_')) ||
  (pub.startsWith('pub_prod_') && integrity.startsWith('prod_integrity_'));
if (!pairOk) {
  console.error('Llave pública e integrity secret no coinciden (test vs prod).');
  process.exit(1);
}

const root = path.join(__dirname, '..', '..');
const targets = ['production', 'preview'];
let failed = 0;

for (const key of keys) {
  for (const target of targets) {
    spawnSync('npx', ['vercel', 'env', 'rm', key, target, '-y'], {
      cwd: root,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });

    const added = spawnSync(
      'npx',
      ['vercel', 'env', 'add', key, target, '--force', '--sensitive'],
      {
        cwd: root,
        shell: true,
        input: `${env[key]}\n`,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    if (added.status !== 0) {
      const detail = `${added.stderr || ''}\n${added.stdout || ''}`.trim().slice(-300);
      console.error(`Falló ${key} @ ${target}`);
      if (detail) console.error(detail);
      failed += 1;
      continue;
    }
    console.log(`OK ${key} → ${target}`);
  }
}

if (failed) {
  console.error(`Terminó con ${failed} error(es).`);
  process.exit(1);
}

console.log('Listo. Redeploy del API en Vercel para aplicar las variables.');
