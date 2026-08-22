const admin = require('firebase-admin');
const { prisma } = require('../lib/prisma');

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
  if (admin.apps.length > 0) {
    return;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = process.env.FIREBASE_PROJECT_ID || 'liveboom-app';

  if (raw) {
    const serviceAccount = parseServiceAccount(raw);
    if (typeof serviceAccount.private_key === 'string') {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || projectId,
    });
    return;
  }

  console.warn(
    '[auth] FIREBASE_SERVICE_ACCOUNT no está definida; se verifica el JWT con projectId',
  );
  admin.initializeApp({ projectId });
}

initFirebaseAdmin();

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

  admin
    .auth()
    .verifyIdToken(token)
    .then((decoded) => {
      req.user = decoded;
      next();
    })
    .catch((error) => {
      console.error('[auth] JWT inválido:', error.message);
      res.status(401).json({ error: 'Token inválido o expirado' });
    });
}

async function requireDbUser(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { firebaseUid: req.user.uid },
    });
    if (!user) {
      res.status(409).json({ error: 'Sincroniza tu cuenta con POST /api/auth/sync' });
      return;
    }
    req.dbUser = user;
    next();
  } catch (error) {
    console.error('[auth] requireDbUser:', error);
    res.status(500).json({ error: 'No se pudo cargar el usuario' });
  }
}

module.exports = { requireAuth, requireDbUser };
