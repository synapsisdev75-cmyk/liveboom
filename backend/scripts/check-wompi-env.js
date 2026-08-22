/* Diagnóstico local: no imprime secretos. */
const fs = require('fs');
const path = require('path');

function clean(value) {
  return String(value || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '');
}

function loadEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i).trim()] = clean(line.slice(i + 1));
  }
  return out;
}

const env = loadEnv(path.join(__dirname, '..', '.env'));
const pub = env.WOMPI_PUBLIC_KEY || '';
const integrity = env.WOMPI_INTEGRITY_SECRET || '';
const events = env.WOMPI_EVENTS_SECRET || '';

function kindPublic(key) {
  if (key.startsWith('pub_test_')) return 'test';
  if (key.startsWith('pub_prod_')) return 'prod';
  return key ? 'other' : 'missing';
}

function kindIntegrity(secret) {
  if (secret.startsWith('test_integrity_')) return 'test';
  if (secret.startsWith('prod_integrity_')) return 'prod';
  if (secret.startsWith('test_events_') || secret.startsWith('prod_events_')) {
    return 'events_secret_wrong_var';
  }
  return secret ? 'other' : 'missing';
}

const pubKind = kindPublic(pub);
const integrityKind = kindIntegrity(integrity);
const pairOk =
  (pubKind === 'test' && integrityKind === 'test') ||
  (pubKind === 'prod' && integrityKind === 'prod');

console.log(
  JSON.stringify(
    {
      local: {
        publicKey: pubKind,
        integritySecret: integrityKind,
        eventsSecret: events ? 'set' : 'missing',
        pairOk,
      },
      note: 'Si pairOk es false, Wompi responde "La firma es inválida".',
    },
    null,
    2,
  ),
);
