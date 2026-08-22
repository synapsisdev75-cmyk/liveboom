const { verifyFirebaseIdToken } = require('../lib/firebaseAuth');
const { prisma, hasDatabase } = require('../lib/prisma');
const { getBalance } = require('../lib/walletMemory');

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

  verifyFirebaseIdToken(token)
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

module.exports = { requireAuth, requireDbUser, dbUserFromToken };
