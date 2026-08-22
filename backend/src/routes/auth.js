const express = require('express');
const auth = require('../middleware/auth');
const { prisma, hasDatabase } = require('../lib/prisma');
const { getBalance } = require('../lib/walletMemory');

const router = express.Router();
const requireAuth = auth.requireAuth || auth.default?.requireAuth;

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
    if (!hasDatabase || !prisma) {
      res.json({
        id: uid,
        firebaseUid: uid,
        email,
        username,
        avatarUrl,
        bio: null,
        coinsBalance: getBalance(uid),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    const user = await prisma.user.upsert({
      where: { firebaseUid: uid },
      update: {
        email,
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
    res.json({
      id: uid,
      firebaseUid: uid,
      email,
      username,
      avatarUrl,
      bio: null,
      coinsBalance: getBalance(uid),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
});

router.patch('/profile', requireAuth, async (req, res) => {
  const bio = typeof req.body?.bio === 'string' ? req.body.bio.trim().slice(0, 280) : null;

  try {
    const user = await prisma.user.update({
      where: { firebaseUid: req.user.uid },
      data: { bio },
    });
    res.json(user);
  } catch (error) {
    console.error('[auth/profile]', error);
    res.json({
      firebaseUid: req.user.uid,
      bio,
      ok: true,
    });
  }
});

module.exports = router;
