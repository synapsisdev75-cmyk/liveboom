const crypto = require('crypto');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'liveboom-app';
const CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let certCache = { at: 0, byKid: null };

function decodeJsonPart(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

async function getGoogleCerts() {
  const fresh = certCache.byKid && Date.now() - certCache.at < 55 * 60 * 1000;
  if (fresh) return certCache.byKid;

  const response = await fetch(CERTS_URL);
  if (!response.ok) {
    throw new Error(`No se pudieron obtener claves Firebase (${response.status})`);
  }
  const byKid = await response.json();
  certCache = { at: Date.now(), byKid };
  return byKid;
}

/**
 * Verifica ID tokens de Firebase Auth con crypto nativo (sin jose / firebase-admin).
 * Compatible con Vercel CJS + ESM.
 */
async function verifyFirebaseIdToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token vacío');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('JWT malformado');
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodeJsonPart(headerPart);
  const payload = decodeJsonPart(payloadPart);

  if (header.alg !== 'RS256') {
    throw new Error(`Algoritmo no soportado: ${header.alg}`);
  }
  if (!header.kid) {
    throw new Error('JWT sin kid');
  }

  const certs = await getGoogleCerts();
  const cert = certs[header.kid];
  if (!cert) {
    // Una vez: refrescar por si rotaron claves
    certCache = { at: 0, byKid: null };
    const refreshed = await getGoogleCerts();
    if (!refreshed[header.kid]) {
      throw new Error('kid de Firebase desconocido');
    }
  }

  const pem = (await getGoogleCerts())[header.kid];
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerPart}.${payloadPart}`);
  verifier.end();
  const valid = verifier.verify(pem, Buffer.from(signaturePart, 'base64url'));
  if (!valid) {
    throw new Error('Firma JWT inválida');
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && now >= payload.exp) {
    throw new Error('Token expirado');
  }
  if (typeof payload.iat === 'number' && payload.iat > now + 60) {
    throw new Error('Token emitido en el futuro');
  }
  if (payload.aud !== PROJECT_ID) {
    throw new Error('audiencia inválida');
  }
  if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) {
    throw new Error('emisor inválido');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Token sin uid');
  }
  if (payload.auth_time && Number(payload.auth_time) > now + 60) {
    throw new Error('auth_time inválido');
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
    email_verified: Boolean(payload.email_verified),
    firebase: payload.firebase,
    auth_time: payload.auth_time,
    iat: payload.iat,
    exp: payload.exp,
  };
}

module.exports = verifyFirebaseIdToken;
module.exports.verifyFirebaseIdToken = verifyFirebaseIdToken;
module.exports.default = verifyFirebaseIdToken;
