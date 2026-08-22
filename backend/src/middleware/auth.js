const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { prisma, hasDatabase } = require('../lib/prisma');
const { getBalance } = require('../lib/walletMemory');

function parseServiceAccount(raw) {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    return JSON.parse(decoded);
  }
}

function initFirebaseAdmin() {
  if (getApps().length > 0) {
    return;
  }

  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    const projectId = process.env.FIREBASE_PROJECT_ID || 'liveboom-app';

    if (raw) {
      const serviceAccount = parseServiceAccount(raw);
      if (typeof serviceAccount.private_key === 'string') {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId,
      });
      return;
    }

    console.warn(
      '[auth] FIREBASE_SERVICE_ACCOUNT no está definida; se verifica el JWT con projectId',
    );
    initializeApp({ projectId });
  } catch (error) {
    console.error('[auth] no se pudo iniciar Firebase Admin:', error.message);
  }
}

try {
  initFirebaseAdmin();
} catch (error) {
  console.error('[auth] init falló:', error.message);
}

function requireAuth(req, res, next) {
  try {
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

    getAuth()
      .verifyIdToken(token)
      .then((decoded) => {
        req.user = decoded;
        next();
      })
      .catch((error) => {
        console.error('[auth] JWT inválido:', error.message);
        if (!res.headersSent) {
          res.status(401).json({ error: 'Token inválido o expirado' });
        }
      });
  } catch (error) {
    console.error('[auth] requireAuth:', error);
    if (!res.headersSent) {
      res.status(401).json({ error: 'No se pudo verificar la sesión' });
    }
  }
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

module.exports = { requireAuth, requireDbUser, dbUserFromToken };
