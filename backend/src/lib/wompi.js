const crypto = require('crypto');
const { randomUUID } = require('crypto');

/** Referencia única ≤36 caracteres (límite Wompi en sku / links de pago). */
function createWompiReference(prefix = 'lb') {
  const head = String(prefix || 'lb').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 4);
  const tail = randomUUID().replace(/-/g, '').slice(0, 32);
  return `${head}_${tail}`.slice(0, 36);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function safeEqualHex(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || !left || !right) {
    return false;
  }
  const a = Buffer.from(left.toLowerCase());
  const b = Buffer.from(right.toLowerCase());
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function readPath(source, path) {
  const parts = String(path).split('.');
  let current = source;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null || !(part in current)) {
      return '';
    }
    current = current[part];
  }
  return current == null ? '' : String(current);
}

/**
 * Checksum pedido para el widget / validación de campos:
 * SHA256(id_transaccion + monto_centavos + moneda + timestamp + WOMPI_EVENTS_SECRET)
 */
function computeWompiChecksum(transactionId, amountInCents, currency, timestamp, eventsSecret) {
  const concatenated = `${transactionId}${amountInCents}${currency}${timestamp}${eventsSecret}`;
  return sha256Hex(concatenated);
}

/**
 * Firma oficial de eventos Wompi Colombia:
 * SHA256(valores de signature.properties + timestamp + secreto de eventos)
 */
function computeOfficialEventChecksum(payload, eventsSecret) {
  const properties = payload.signature?.properties;
  if (!Array.isArray(properties) || properties.length === 0) {
    return null;
  }
  const propertyValues = properties.map((path) => readPath(payload.data, path)).join('');
  return sha256Hex(`${propertyValues}${payload.timestamp}${eventsSecret}`);
}

function extractReceivedChecksum(payload, req) {
  const fromBody = payload.signature?.checksum;
  const fromHeader = req?.headers?.['x-event-checksum'];
  return fromBody || fromHeader || '';
}

function verifyWompiChecksum(payload, eventsSecret, req) {
  const received = extractReceivedChecksum(payload, req);
  if (!received || !eventsSecret) {
    return false;
  }

  const official = computeOfficialEventChecksum(payload, eventsSecret);
  if (official && safeEqualHex(official, received)) {
    return true;
  }

  const txn = payload.data?.transaction;
  if (!txn) {
    return false;
  }

  const courseChecksum = computeWompiChecksum(
    txn.id,
    txn.amount_in_cents,
    txn.currency,
    payload.timestamp,
    eventsSecret,
  );
  return safeEqualHex(courseChecksum, received);
}

/**
 * Limpia secretos de Wompi: quita espacios y comillas que a veces se pegan en .env.
 */
function cleanWompiSecret(value) {
  return String(value || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '');
}

function assertIntegrityPair(publicKey, integritySecret) {
  const pub = cleanWompiSecret(publicKey);
  const secret = cleanWompiSecret(integritySecret);
  if (!secret) {
    throw new Error(
      'Falta WOMPI_INTEGRITY_SECRET en el API. En el dashboard de Wompi → Desarrolladores → Secretos para integración técnica.',
    );
  }
  if (secret.startsWith('test_events_') || secret.startsWith('prod_events_')) {
    throw new Error(
      'WOMPI_INTEGRITY_SECRET parece ser el secreto de eventos. Usa el de integridad (test_integrity_… / prod_integrity_…).',
    );
  }
  const pubTest = pub.startsWith('pub_test_');
  const pubProd = pub.startsWith('pub_prod_');
  const secTest = secret.startsWith('test_integrity_');
  const secProd = secret.startsWith('prod_integrity_');
  if ((pubTest && !secTest) || (pubProd && !secProd)) {
    throw new Error(
      'La llave pública y el secreto de integridad no son del mismo ambiente (pruebas vs producción).',
    );
  }
  return secret;
}

/**
 * Firma del Widget: SHA256(reference + amountInCents + currency + integritySecret)
 * amountInCents debe ser entero (p. ej. $9.500 COP → 950000).
 */
function createWidgetIntegritySignature(reference, amountInCents, currency, integritySecret, expirationTime) {
  const secret = cleanWompiSecret(integritySecret);
  if (!secret) {
    return null;
  }
  const amount = Number(amountInCents);
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    throw new Error('amountInCents inválido para la firma de Wompi');
  }
  const expiration = expirationTime ? String(expirationTime).trim() : '';
  const payload = `${String(reference)}${amount}${String(currency)}${expiration}${secret}`;
  return sha256Hex(payload);
}

function wompiBaseUrl() {
  const raw = String(process.env.WOMPI_BASE_URL || 'https://sandbox.wompi.co/v1').trim();
  return raw.replace(/\/$/, '');
}

function wompiRedirectUrl() {
  const fromEnv = String(process.env.WOMPI_REDIRECT_URL || '').trim();
  if (fromEnv) return fromEnv;
  return 'https://liveboomapp.com/billetera';
}

/** GET público: valida que la llave pública exista en Wompi (widget/checkout). */
async function getWompiMerchant(publicKey) {
  const key = cleanWompiSecret(publicKey);
  if (!key) return null;
  const baseUrl = wompiBaseUrl();
  const response = await fetch(`${baseUrl}/merchants/${encodeURIComponent(key)}`);
  if (!response.ok) return null;
  const json = await response.json();
  return json?.data ?? null;
}

async function isWompiMerchantActive(publicKey) {
  const merchant = await getWompiMerchant(publicKey);
  return Boolean(merchant?.active);
}

/** Checkout hospedado Wompi (no requiere firma de integridad en el cliente). */
async function wompiPrivateGet(path) {
  const privateKey = cleanWompiSecret(process.env.WOMPI_PRIVATE_KEY);
  if (!privateKey) {
    throw new Error('WOMPI_PRIVATE_KEY no configurada');
  }
  const baseUrl = wompiBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${privateKey}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Wompi API ${path}: ${response.status} ${body}`);
  }
  const json = await response.json();
  return json?.data ?? null;
}

/** Consulta transacción por id (redirect ?id=… o verificación servidor). */
async function getWompiTransaction(transactionId) {
  const id = String(transactionId || '').trim();
  if (!id) return null;
  return wompiPrivateGet(`/transactions/${encodeURIComponent(id)}`);
}

async function createPaymentLink(input) {
  const privateKey = cleanWompiSecret(process.env.WOMPI_PRIVATE_KEY);
  if (!privateKey) {
    throw new Error('WOMPI_PRIVATE_KEY no configurada');
  }
  const sku = String(input.reference || '').trim().slice(0, 36);
  const baseUrl = wompiBaseUrl();
  const response = await fetch(`${baseUrl}/payment_links`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${privateKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: input.name,
      description: input.description || `Recarga LiveBoom — ${input.name}`,
      single_use: true,
      collect_shipping: false,
      currency: 'COP',
      amount_in_cents: input.amountInCents,
      redirect_url: wompiRedirectUrl(),
      sku: sku || undefined,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Wompi payment link failed: ${response.status} ${body}`);
  }
  const json = await response.json();
  const id = json?.data?.id;
  if (!id) {
    throw new Error('Wompi no devolvió id del link de pago');
  }
  const checkoutBase = baseUrl.includes('sandbox')
    ? 'https://checkout.wompi.co/l'
    : 'https://checkout.wompi.co/l';
  return { id: String(id), url: `${checkoutBase}/${id}` };
}

module.exports = {
  computeWompiChecksum,
  computeOfficialEventChecksum,
  verifyWompiChecksum,
  createWidgetIntegritySignature,
  createWompiReference,
  cleanWompiSecret,
  assertIntegrityPair,
  createPaymentLink,
  getWompiTransaction,
  getWompiMerchant,
  isWompiMerchantActive,
  wompiBaseUrl,
  wompiRedirectUrl,
};
