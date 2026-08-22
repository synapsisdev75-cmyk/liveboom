const express = require('express');
const { asFn } = require('../lib/asFn');
const { prisma, hasDatabase } = require('../lib/prisma');
const { getBalance } = require('../lib/walletMemory');
const { getProfile } = require('../lib/profileMemory');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));

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

function fallbackUser(uid, email, username, avatarUrl) {
  const memory = getProfile(uid);
  return {
    id: uid,
    firebaseUid: uid,
    email: memory?.email || email,
    username: memory?.username || username,
    avatarUrl: memory?.avatarUrl ?? avatarUrl,
    bio: memory?.bio ?? null,
    birthDate: memory?.birthDate ?? null,
    coinsBalance: getBalance(uid),
    createdAt: memory?.createdAt || new Date().toISOString(),
    updatedAt: memory?.updatedAt || new Date().toISOString(),
  };
}

router.post('/sync', requireAuth, async (req, res) => {
  const decoded = req.user;
  const uid = decoded.uid;
  const email = decoded.email || `${uid}@users.liveboom.local`;
  const username = usernameFromToken(decoded);
  const avatarUrl = decoded.picture || null;

  try {
    if (!hasDatabase || !prisma) {
      res.json(fallbackUser(uid, email, username, avatarUrl));
      return;
    }

    const user = await prisma.user.upsert({
      where: { firebaseUid: uid },
      update: { email },
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
    res.json(fallbackUser(uid, email, username, avatarUrl));
  }
});

router.patch('/profile', requireAuth, async (req, res) => {
  const bio = typeof req.body?.bio === 'string' ? req.body.bio.trim().slice(0, 280) : null;
  res.json({
    firebaseUid: req.user.uid,
    bio,
    ok: true,
  });
});

module.exports = router;
module.exports.default = router;
