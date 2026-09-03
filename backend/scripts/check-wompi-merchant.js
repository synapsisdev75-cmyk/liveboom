/* Diagnóstico: valida llave pública contra API Wompi (no imprime secretos). */
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
const base = clean(env.WOMPI_BASE_URL || 'https://sandbox.wompi.co/v1').replace(/\/$/, '');

async function main() {
  if (!pub) {
    console.log(JSON.stringify({ ok: false, reason: 'missing_public_key' }, null, 2));
    return;
  }
  const tail = pub.slice(-8);
  const response = await fetch(`${base}/merchants/${encodeURIComponent(pub)}`);
  const body = await response.json();
  const merchant = body?.data;
  console.log(
    JSON.stringify(
      {
        publicKeyTail: tail,
        httpStatus: response.status,
        merchantOk: Boolean(merchant?.active),
        merchantName: merchant?.name || null,
        error: body?.error?.reason || null,
        note:
          response.ok
            ? 'Widget/checkout pueden usar esta llave.'
            : 'Widget fallará. Usa checkout hospedado o corrige la llave en dashboard.',
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
