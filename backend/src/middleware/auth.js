const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { prisma, hasDatabase } = require('../lib/prisma');
const { getBalance } = require('../lib/walletMemory');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'liveboom-app';

let adminWithCert = false;
let jwks = null;

function parseServiceAccount(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return JSON.parse(Buffer.from(trimmed, 'base64').toString('utf8'));
  }
}

function initFirebaseAdmin() {
  if (getApps().length > 0) {
    return;
  }

  try {
    const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (serviceAccount?.private_key && serviceAccount?.client_email) {
      if (typeof serviceAccount.private_key === 'string') {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || PROJECT_ID,
      });
      adminWithCert = true;
      return;
    }
  } catch (error) {
    console.warn('[auth] FIREBASE_SERVICE_ACCOUNT inválida:', error.message);
  }

  try {
    initializeApp({ projectId: PROJECT_ID });
  } catch (error) {
    console.warn('[auth] init projectId:', error.message);
  }
}

try {
  initFirebaseAdmin();
} catch (error) {
  console.error('[auth] init falló:', error.message);
}

async function verifyWithJwks(token) {
  const jose = require('jose');
  const createRemoteJWKSet = jose.createRemoteJWKSet || jose.default?.createRemoteJWKSet;
  const jwtVerify = jose.jwtVerify || jose.default?.jwtVerify;
  if (typeof createRemoteJWKSet !== 'function' || typeof jwtVerify !== 'function') {
    throw new Error('No se pudo cargar jose para verificar el token');
  }
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(
        'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
      ),
    );
  }
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
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

async function verifyFirebaseIdToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token vacío');
  }

  if (adminWithCert && getApps().length > 0) {
    try {
      return await getAuth().verifyIdToken(token);
    } catch (error) {
      console.warn('[auth] Admin verify falló, usando JWKS:', error.message);
    }
  }

  return verifyWithJwks(token);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Falta el header Authorization: Bearer <token>' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Token vacío' });
    return;
  }

  Promise.resolve()
    .then(() => verifyFirebaseIdToken(token))
    .then((decoded) => {
      if (!decoded?.uid) {
        res.status(401).json({ error: 'Token sin uid' });
        return;
      }
      req.user = decoded;
      next();
    })
    .catch((error) => {
      console.error('[auth] JWT inválido:', error.message);
      if (!res.headersSent) {
        res.status(401).json({ error: 'Token inválido o expirado' });
      }
    });
}

function dbUserFromToken(decoded) {
  const raw = decoded.name || (decoded.email ? decoded.email.split('@')[0] : decoded.uid);
  const base =
    String(raw)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 20) || 'user';
  return {
    id: decoded.uid,
    firebaseUid: decoded.uid,
    email: decoded.email || `${decoded.uid}@users.liveboom.local`,
    username: `${base}_${decoded.uid.slice(0, 8)}`,
    avatarUrl: decoded.picture || null,
    bio: null,
    coinsBalance: getBalance(decoded.uid),
  };
}

async function requireDbUser(req, res, next) {
  if (!hasDatabase || !prisma) {
    req.dbUser = dbUserFromToken(req.user);
    next();
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { firebaseUid: req.user.uid },
    });
    if (!user) {
      req.dbUser = dbUserFromToken(req.user);
      next();
      return;
    }
    req.dbUser = user;
    next();
  } catch (error) {
    console.error('[auth] requireDbUser:', error);
    req.dbUser = dbUserFromToken(req.user);
    next();
  }
}

module.exports = {
  requireAuth,
  requireDbUser,
  dbUserFromToken,
  verifyFirebaseIdToken,
};
