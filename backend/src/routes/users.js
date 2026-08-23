const express = require('express');
const { asFn } = require('../lib/asFn');
const { prisma, hasDatabase } = require('../lib/prisma');
const { getBalance } = require('../lib/walletMemory');
const { getProfile, saveProfile, findByUsername } = require('../lib/profileMemory');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const requireDbUser = asFn(require('../middleware/requireDbUser'));
const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

function serializeUser(user) {
  const birth =
    user.birthDate == null
      ? null
      : typeof user.birthDate === 'string'
        ? user.birthDate.slice(0, 10)
        : new Date(user.birthDate).toISOString().slice(0, 10);
  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    username: user.username,
    displayName: user.displayName || user.username,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
    birthDate: birth,
    category: user.category ?? null,
    coinsBalance: Number(user.coinsBalance ?? 0),
    createdAt: user.createdAt || new Date().toISOString(),
    updatedAt: user.updatedAt || new Date().toISOString(),
  };
}

function parseUsername(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/^@/, '').toLowerCase();
}

function yearsOld(isoDate) {
  const birth = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

async function updateProfile(req, res) {
  const username = parseUsername(req.body?.username);
  const displayName =
    typeof req.body?.displayName === 'string' ? req.body.displayName.trim().slice(0, 48) : '';
  const bio = typeof req.body?.bio === 'string' ? req.body.bio.trim().slice(0, 280) : '';
  const avatarUrl =
    typeof req.body?.avatarUrl === 'string' ? req.body.avatarUrl.trim().slice(0, 350000) : '';
  const birthDateRaw = typeof req.body?.birthDate === 'string' ? req.body.birthDate.trim() : '';
  const category =
    typeof req.body?.category === 'string' ? req.body.category.trim().toLowerCase() : '';

  if (!USERNAME_RE.test(username)) {
    res.status(400).json({ error: 'El usuario debe tener 3-24 caracteres (a-z, 0-9, _).' });
    return;
  }
  if (!birthDateRaw) {
    res.status(400).json({ error: 'La fecha de nacimiento es obligatoria.' });
    return;
  }
  const age = yearsOld(birthDateRaw);
  if (age == null) {
    res.status(400).json({ error: 'Fecha de nacimiento inválida.' });
    return;
  }
  if (age < 18) {
    res.status(400).json({ error: 'Debes ser mayor de 18 años para usar Liveboom.' });
    return;
  }

  const uid = req.user.uid;

  try {
    if (!hasDatabase || !prisma) {
      const existing = findByUsername(username);
      if (existing && existing.firebaseUid !== uid) {
        res.status(409).json({ error: 'Ese nombre de usuario ya está en uso.' });
        return;
      }
      const saved = saveProfile(uid, {
        id: uid,
        firebaseUid: uid,
        email: req.dbUser?.email || req.user.email || `${uid}@users.liveboom.local`,
        username,
        displayName: displayName || username,
        bio: bio || null,
        category: category || null,
        avatarUrl: avatarUrl || req.dbUser?.avatarUrl || req.user.picture || null,
        birthDate: birthDateRaw,
        coinsBalance: getBalance(uid),
      });
      res.json(serializeUser(saved));
      return;
    }

    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3)',
    ).catch(() => undefined);

    const taken = await prisma.user.findFirst({
      where: {
        username,
        NOT: { firebaseUid: uid },
      },
      select: { id: true },
    });
    if (taken) {
      res.status(409).json({ error: 'Ese nombre de usuario ya está en uso.' });
      return;
    }

    const user = await prisma.user.upsert({
      where: { firebaseUid: uid },
      update: {
        username,
        bio: bio || null,
        avatarUrl: avatarUrl || undefined,
        birthDate: new Date(`${birthDateRaw}T00:00:00.000Z`),
        email: req.user.email || undefined,
      },
      create: {
        firebaseUid: uid,
        email: req.user.email || `${uid}@users.liveboom.local`,
        username,
        bio: bio || null,
        avatarUrl: avatarUrl || null,
        birthDate: new Date(`${birthDateRaw}T00:00:00.000Z`),
        coinsBalance: 0,
      },
    });

    res.json(serializeUser(user));
  } catch (error) {
    console.error('[users/profile]', error);
    // Fallback online sin Postgres
    const saved = saveProfile(uid, {
      id: uid,
      firebaseUid: uid,
      email: req.dbUser?.email || req.user.email || `${uid}@users.liveboom.local`,
      username,
      displayName: displayName || username,
      bio: bio || null,
      category: category || null,
      avatarUrl: avatarUrl || req.dbUser?.avatarUrl || null,
      birthDate: birthDateRaw,
      coinsBalance: getBalance(uid),
    });
    res.json(serializeUser(saved));
  }
}

router.get('/profile', requireAuth, requireDbUser, (req, res) => {
  const memory = getProfile(req.user.uid);
  if (memory) {
    res.json(
      serializeUser({
        ...memory,
        coinsBalance: getBalance(req.user.uid),
      }),
    );
    return;
  }
  res.json(
    serializeUser({
      ...req.dbUser,
      coinsBalance: getBalance(req.user.uid),
    }),
  );
});

router.patch('/profile', requireAuth, requireDbUser, updateProfile);
router.put('/profile', requireAuth, requireDbUser, updateProfile);

module.exports = router;
module.exports.default = router;
