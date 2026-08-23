const express = require('express');
const { asFn } = require('../lib/asFn');
const { prisma, hasDatabase } = require('../lib/prisma');
const { getBalance } = require('../lib/walletMemory');
const { getProfile, saveProfile } = require('../lib/profileMemory');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));

function usernameFromToken(decoded) {
  const fromName = String(decoded.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 20);
  if (fromName && fromName.length >= 3) return fromName;
  const raw = decoded.email ? decoded.email.split('@')[0] : decoded.uid;
  const base =
    String(raw)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 20) || 'user';
  return `${base}_${decoded.uid.slice(0, 8)}`;
}

function fallbackUser(uid, email, username, avatarUrl, displayName) {
  const memory = getProfile(uid);
  const saved = saveProfile(uid, {
    id: uid,
    firebaseUid: uid,
    email: memory?.email || email,
    username: memory?.username || username,
    displayName: memory?.displayName || displayName || memory?.username || username,
    avatarUrl: memory?.avatarUrl ?? avatarUrl,
    bio: memory?.bio ?? null,
    birthDate: memory?.birthDate ?? null,
    coinsBalance: getBalance(uid),
  });
  return {
    ...saved,
    coinsBalance: getBalance(uid),
  };
}

router.post('/sync', requireAuth, async (req, res) => {
  const decoded = req.user;
  const uid = decoded.uid;
  const email = decoded.email || `${uid}@users.liveboom.local`;
  const username = usernameFromToken(decoded);
  const avatarUrl = decoded.picture || null;
  const displayName = decoded.name || username;

  try {
    if (!hasDatabase || !prisma) {
      res.json(fallbackUser(uid, email, username, avatarUrl, displayName));
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

    const memory = getProfile(uid);
    const saved = saveProfile(uid, {
      id: user.id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      username: memory?.username || user.username,
      displayName: memory?.displayName || displayName || user.username,
      avatarUrl: memory?.avatarUrl ?? user.avatarUrl ?? avatarUrl,
      bio: memory?.bio ?? user.bio ?? null,
      birthDate: memory?.birthDate ?? (user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null),
      category: memory?.category ?? null,
      coinsBalance: getBalance(uid),
    });

    res.json({ ...saved, coinsBalance: getBalance(uid) });
  } catch (error) {
    console.error('[auth/sync]', error);
    res.json(fallbackUser(uid, email, username, avatarUrl, displayName));
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
