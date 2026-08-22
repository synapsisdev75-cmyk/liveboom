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

function createWidgetIntegritySignature(reference, amountInCents, currency, integritySecret) {
  if (!integritySecret) {
    return null;
  }
  return sha256Hex(`${reference}${amountInCents}${currency}${integritySecret}`);
}

module.exports = {
  computeWompiChecksum,
  computeOfficialEventChecksum,
  verifyWompiChecksum,
  createWidgetIntegritySignature,
};
