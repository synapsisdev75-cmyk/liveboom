const { createRemoteJWKSet, jwtVerify } = require('jose');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const projectId = () => process.env.FIREBASE_PROJECT_ID || 'liveboom-app';

let jwks = null;
let adminReady = false;

function parseServiceAccount(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    return JSON.parse(decoded);
  }
}

function initFirebaseAdmin() {
  if (getApps().length > 0) {
    adminReady = true;
    return;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  try {
    const serviceAccount = parseServiceAccount(raw);
    if (serviceAccount?.private_key && serviceAccount?.client_email) {
      if (typeof serviceAccount.private_key === 'string') {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId(),
      });
      adminReady = true;
      return;
    }
  } catch (error) {
    console.warn('[auth] FIREBASE_SERVICE_ACCOUNT inválida:', error.message);
  }

  try {
    initializeApp({ projectId: projectId() });
  } catch (error) {
    console.warn('[auth] init projectId:', error.message);
  }
}

try {
  initFirebaseAdmin();
} catch (error) {
  console.error('[auth] init falló:', error.message);
}

function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
    );
  }
  return jwks;
}

/**
 * Verifica un ID token de Firebase Auth.
 * Preferencia: Admin SDK si hay service account; si no, JWKS público (Vercel/serverless).
 */
async function verifyFirebaseIdToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token vacío');
  }

  if (adminReady) {
    try {
      return await getAuth().verifyIdToken(token);
    } catch (error) {
      // Sin credenciales reales Admin falla; caemos a JWKS.
      if (!/credential|project|Unable to detect|default credentials/i.test(String(error.message))) {
        throw error;
      }
      console.warn('[auth] Admin verify falló, usando JWKS:', error.message);
    }
  }

  const pid = projectId();
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: `https://securetoken.google.com/${pid}`,
    audience: pid,
  });

  return {
    uid: String(payload.sub || ''),
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

module.exports = { verifyFirebaseIdToken, initFirebaseAdmin, projectId };
