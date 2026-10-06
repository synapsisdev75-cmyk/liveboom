const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { decodeProtectedHeader, importX509, jwtVerify } = require('jose');

/** IDs tal como quedaron en App Store Connect (sin el prefijo com.). */
const APPLE_BLAST_PRODUCTS = {
  'iveboom.app.blast.25': 25,
  'iveboom.app.blast.125': 125,
  'iveboom.app.blast.150': 150,
  'iveboom.app.blast.200': 200,
  'iveboom.app.blast.350': 350,
  'iveboom.app.blast.500': 500,
  'iveboom.app.blast.750': 750,
  'iveboom.app.blast.1000': 1000,
  'iveboom.app.blast.1500': 1500,
  'iveboom.app.blast.2500': 2500,
  'iveboom.app.blast.5000': 5000,
  'iveboom.app.blast.7500': 7500,
  'iveboom.app.blast.10000': 10000,
  'iveboom.app.blast.25000': 25000,
};

const BUNDLE_ID = 'com.liveboom.app';

/** OID del certificado con el que Apple firma transacciones de StoreKit. */
const APPLE_IAP_OID = Buffer.from('2a864886f76364060b01', 'hex');

const ROOTS = ['AppleRootCA-G3.cer', 'AppleRootCA-G2.cer'].map((name) =>
  new crypto.X509Certificate(fs.readFileSync(path.join(__dirname, 'certs', name))),
);

function coinsForAppleProduct(productId) {
  const id = String(productId || '').trim();
  const coins = APPLE_BLAST_PRODUCTS[id];
  return coins || 0;
}

function pemFromDerBase64(b64) {
  const body = String(b64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
  const lines = body.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
}

function anchorsToAppleRoot(cert) {
  for (const root of ROOTS) {
    if (cert.fingerprint256 === root.fingerprint256) return true;
    try {
      if (cert.verify(root.publicKey)) return true;
    } catch {
      /* prueba la otra raíz */
    }
  }
  return false;
}

function assertAppleTransactionPayload(payload) {
  const productId = String(payload?.productId || '').trim();
  const coins = coinsForAppleProduct(productId);
  if (!coins) {
    const error = new Error('Producto de Apple no reconocido');
    error.code = 'UNKNOWN_PRODUCT';
    throw error;
  }
  if (String(payload?.bundleId || '') !== BUNDLE_ID) {
    const error = new Error('La compra no es de LiveBoom');
    error.code = 'BUNDLE_MISMATCH';
    throw error;
  }
  if (payload?.revocationDate) {
    const error = new Error('Apple revirtió esta compra');
    error.code = 'REVOKED';
    throw error;
  }
  const ownership = String(payload?.inAppOwnershipType || 'PURCHASED');
  if (ownership !== 'PURCHASED') {
    const error = new Error('Esta compra no está pagada');
    error.code = 'NOT_PURCHASED';
    throw error;
  }
  const transactionId = String(payload?.transactionId || '').trim();
  if (!transactionId) {
    const error = new Error('Falta el identificador de la compra');
    error.code = 'NO_TRANSACTION';
    throw error;
  }
  return { productId, coins, transactionId, environment: String(payload?.environment || '') };
}

async function verifyAppleSignedTransaction(jws) {
  const signed = String(jws || '').trim();
  if (!signed || signed.split('.').length !== 3) {
    const error = new Error('Comprobante de Apple inválido');
    error.code = 'BAD_JWS';
    throw error;
  }
  let header;
  try {
    header = decodeProtectedHeader(signed);
  } catch {
    const error = new Error('Comprobante de Apple inválido');
    error.code = 'BAD_JWS';
    throw error;
  }
  const chain = Array.isArray(header.x5c) ? header.x5c : [];
  if (chain.length < 2) {
    const error = new Error('Apple no firmó este comprobante');
    error.code = 'APPLE_CERT_CHAIN';
    throw error;
  }
  const certs = chain.map((part) => new crypto.X509Certificate(Buffer.from(part, 'base64')));
  if (!certs[0].raw.includes(APPLE_IAP_OID)) {
    const error = new Error('El comprobante no es una compra de App Store');
    error.code = 'APPLE_CERT_OID';
    throw error;
  }
  for (let i = 0; i < certs.length - 1; i += 1) {
    if (!certs[i].verify(certs[i + 1].publicKey)) {
      const error = new Error('La cadena de Apple no es válida');
      error.code = 'APPLE_CERT_CHAIN';
      throw error;
    }
  }
  if (!anchorsToAppleRoot(certs[certs.length - 1])) {
    const error = new Error('La compra no está firmada por Apple');
    error.code = 'APPLE_ROOT';
    throw error;
  }
  const key = await importX509(pemFromDerBase64(chain[0]), 'ES256');
  const { payload } = await jwtVerify(signed, key, { algorithms: ['ES256'] });
  return assertAppleTransactionPayload(payload);
}

module.exports = {
  APPLE_BLAST_PRODUCTS,
  BUNDLE_ID,
  coinsForAppleProduct,
  assertAppleTransactionPayload,
  verifyAppleSignedTransaction,
};
