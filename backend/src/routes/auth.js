const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { prisma } = require('../lib/prisma');

const router = express.Router();

function usernameFromToken(decoded) {
  const raw = decoded.name || (decoded.email ? decoded.email.split('@')[0] : decoded.uid);
  const base =
    String(raw)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 20) || 'user';
  return `${base}_${decoded.uid.slice(0, 8)}`;
}

router.post('/sync', requireAuth, async (req, res) => {
  const decoded = req.user;
  const uid = decoded.uid;
  const email = decoded.email || `${uid}@users.liveboom.local`;
  const username = usernameFromToken(decoded);
  const avatarUrl = decoded.picture || null;

  try {
    const user = await prisma.user.upsert({
      where: { firebaseUid: uid },
      update: {
        email,
        username,
        avatarUrl,
      },
      create: {
        firebaseUid: uid,
        email,
        username,
        avatarUrl,
        coinsBalance: 0,
      },
    });

    res.json(user);
  } catch (error) {
    console.error('[auth/sync]', error);
    if (!process.env.DATABASE_URL) {
      res.json({
        id: uid,
        firebaseUid: uid,
        email,
        username,
        avatarUrl,
        bio: null,
        coinsBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    res.status(500).json({ error: 'No se pudo sincronizar el usuario en PostgreSQL' });
  }
});

module.exports = router;
