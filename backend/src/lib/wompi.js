const crypto = require('crypto');

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
 * Limpia secretos de Wompi: quita espacios y comillas que a veces se pegan en Vercel/.env.
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
      'Falta WOMPI_INTEGRITY_SECRET en el API (Vercel). En el dashboard de Wompi → Desarrolladores → Secretos para integración técnica.',
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
function createWidgetIntegritySignature(reference, amountInCents, currency, integritySecret) {
  const secret = cleanWompiSecret(integritySecret);
  if (!secret) {
    return null;
  }
  const amount = Number(amountInCents);
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    throw new Error('amountInCents inválido para la firma de Wompi');
  }
  return sha256Hex(`${String(reference)}${amount}${String(currency)}${secret}`);
}

module.exports = {
  computeWompiChecksum,
  computeOfficialEventChecksum,
  verifyWompiChecksum,
  createWidgetIntegritySignature,
  cleanWompiSecret,
  assertIntegrityPair,
};
