const express = require('express');
const { asFn } = require('../lib/asFn');
const { prisma, hasDatabase } = require('../lib/prisma');
const { getBalance } = require('../lib/walletMemory');
const { getProfile, saveProfile, findByUsername } = require('../lib/profileMemory');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const requireDbUser = asFn(require('../middleware/requireDbUser'));
const USERNAME_RE = /^[a-z0-9_]{3,24}$/;
const PROFILE_ALLOWED = new Set(['username', 'displayName', 'bio', 'avatarUrl', 'birthDate', 'category']);
const PROFILE_PROTECTED = new Set([
  'id',
  'userId',
  'firebaseUid',
  'email',
  'coins',
  'coinsBalance',
  'level',
  'levelXp',
  'xp',
  'role',
  'roles',
  'permissions',
  'verified',
  'wallet',
  'blasts',
  'createdAt',
  'updatedAt',
]);

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

function mergeProfileRecord(uid, dbUser, memory) {
  const { setBalance } = require('../lib/walletMemory');
  const coinsBalance = Number(dbUser?.coinsBalance ?? getBalance(uid));
  setBalance(uid, coinsBalance);
  if (!memory) {
    return serializeUser({ ...dbUser, coinsBalance });
  }
  const memUpdated = memory.updatedAt ? new Date(memory.updatedAt).getTime() : 0;
  const dbUpdated = dbUser?.updatedAt ? new Date(dbUser.updatedAt).getTime() : 0;
  const preferMemory = memUpdated >= dbUpdated;
  const base = preferMemory ? { ...dbUser, ...memory } : { ...memory, ...dbUser };
  return serializeUser({
    ...base,
    id: memory.id || dbUser?.id || uid,
    firebaseUid: uid,
    email: memory.email || dbUser?.email,
    username: memory.username || dbUser?.username,
    displayName: memory.displayName || dbUser?.displayName || memory.username || dbUser?.username,
    avatarUrl: memory.avatarUrl ?? dbUser?.avatarUrl ?? null,
    bio: memory.bio ?? dbUser?.bio ?? null,
    birthDate: memory.birthDate ?? dbUser?.birthDate ?? null,
    category: memory.category ?? dbUser?.category ?? null,
    coinsBalance,
  });
}

function buildProfilePayload(uid, req, fields) {
  return {
    id: fields.id || uid,
    firebaseUid: uid,
    email: fields.email || req.dbUser?.email || req.user.email || `${uid}@users.liveboom.local`,
    username: fields.username,
    displayName: fields.displayName || fields.username,
    bio: fields.bio || null,
    category: fields.category || null,
    avatarUrl: fields.avatarUrl || req.dbUser?.avatarUrl || req.user.picture || null,
    birthDate: fields.birthDate,
    coinsBalance: getBalance(uid),
  };
}

async function updateProfile(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const incoming = {};
  let sawAllowed = false;
  let sawProtected = false;
  for (const key of Object.keys(body)) {
    if (PROFILE_PROTECTED.has(key)) {
      sawProtected = true;
      continue;
    }
    if (!PROFILE_ALLOWED.has(key)) continue;
    sawAllowed = true;
    incoming[key] = body[key];
  }

  if (!sawAllowed) {
    res.status(400).json({
      error: sawProtected
        ? 'No se puede modificar ese dato.'
        : 'No hay cambios permitidos para guardar.',
    });
    return;
  }

  const uid = req.user.uid;
  const memory = getProfile(uid);
  const current = {
    username: parseUsername(memory?.username || req.dbUser?.username || ''),
    displayName: String(memory?.displayName || req.dbUser?.displayName || '').trim(),
    bio: typeof memory?.bio === 'string' ? memory.bio : req.dbUser?.bio || '',
    avatarUrl: memory?.avatarUrl || req.dbUser?.avatarUrl || req.user.picture || '',
    birthDate:
      (typeof memory?.birthDate === 'string' && memory.birthDate.slice(0, 10)) ||
      (req.dbUser?.birthDate
        ? String(req.dbUser.birthDate).slice(0, 10)
        : ''),
    category: memory?.category || req.dbUser?.category || '',
  };

  const username =
    incoming.username !== undefined ? parseUsername(incoming.username) : current.username;
  const displayName =
    incoming.displayName !== undefined
      ? String(incoming.displayName || '').trim().slice(0, 48)
      : current.displayName;
  const bio =
    incoming.bio !== undefined ? String(incoming.bio || '').trim().slice(0, 280) : current.bio;
  const avatarUrl =
    incoming.avatarUrl !== undefined
      ? String(incoming.avatarUrl || '').trim().slice(0, 350000)
      : current.avatarUrl;
  const birthDateRaw =
    incoming.birthDate !== undefined
      ? String(incoming.birthDate || '').trim()
      : current.birthDate;
  const category =
    incoming.category !== undefined
      ? String(incoming.category || '').trim().toLowerCase()
      : current.category;

  if (incoming.username !== undefined && !USERNAME_RE.test(username)) {
    res.status(400).json({ error: 'El usuario debe tener 3-24 caracteres (a-z, 0-9, _).' });
    return;
  }
  if (incoming.displayName !== undefined) {
    if (!displayName) {
      res.status(400).json({ error: 'El nombre es obligatorio.' });
      return;
    }
    if (/[<>]/.test(displayName)) {
      res.status(400).json({ error: 'El nombre contiene caracteres no permitidos.' });
      return;
    }
  }
  if (incoming.birthDate !== undefined) {
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
  }

  const profileFields = {
    username,
    displayName: displayName || username,
    bio: bio || null,
    category: category || null,
    avatarUrl: avatarUrl || req.dbUser?.avatarUrl || req.user.picture || null,
    birthDate: birthDateRaw || null,
  };

  try {
    if (!hasDatabase || !prisma) {
      if (incoming.username !== undefined) {
        const existing = findByUsername(username);
        if (existing && existing.firebaseUid !== uid) {
          res.status(409).json({ error: 'Ese nombre de usuario ya está en uso.' });
          return;
        }
      }
      const saved = saveProfile(uid, buildProfilePayload(uid, req, profileFields));
      res.json(serializeUser(saved));
      return;
    }

    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3)',
    ).catch(() => undefined);
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "displayName" TEXT',
    ).catch(() => undefined);
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "category" TEXT',
    ).catch(() => undefined);

    if (incoming.username !== undefined) {
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
    }

    const update = {};
    if (incoming.username !== undefined) update.username = username;
    if (incoming.bio !== undefined) update.bio = bio || null;
    if (incoming.avatarUrl !== undefined) update.avatarUrl = avatarUrl || undefined;
    if (incoming.birthDate !== undefined && birthDateRaw) {
      update.birthDate = new Date(`${birthDateRaw}T00:00:00.000Z`);
    }

    const user = await prisma.user.upsert({
      where: { firebaseUid: uid },
      update,
      create: {
        firebaseUid: uid,
        email: req.user.email || `${uid}@users.liveboom.local`,
        username: username || `user_${uid.slice(0, 8)}`,
        bio: bio || null,
        avatarUrl: avatarUrl || null,
        birthDate: birthDateRaw ? new Date(`${birthDateRaw}T00:00:00.000Z`) : undefined,
        coinsBalance: 0,
      },
    });

    if (incoming.displayName !== undefined || incoming.category !== undefined) {
      try {
        const { Prisma } = require('@prisma/client');
        await prisma.$executeRaw(
          Prisma.sql`UPDATE "User" SET "displayName" = ${profileFields.displayName}, "category" = ${profileFields.category} WHERE "firebaseUid" = ${uid}`,
        );
      } catch {
        // columnas opcionales según migración
      }
    }

    const saved = saveProfile(uid, buildProfilePayload(uid, req, { ...profileFields, id: user.id }));
    res.json(serializeUser(saved));
  } catch (error) {
    console.error('[users/profile]', error);
    if (!hasDatabase || !prisma) {
      const saved = saveProfile(uid, buildProfilePayload(uid, req, profileFields));
      res.json(serializeUser(saved));
      return;
    }
    res.status(500).json({ error: 'No se pudo guardar el perfil. Intenta nuevamente.' });
  }
}

router.get('/profile', requireAuth, requireDbUser, async (req, res) => {
  const memory = getProfile(req.user.uid);
  let dbUser = req.dbUser;
  try {
    const { firestoreConfigured, readUserCoinsBalance } = require('../lib/firestoreAdmin');
    if (firestoreConfigured()) {
      const fsCoins = await readUserCoinsBalance(req.user.uid);
      dbUser = { ...dbUser, coinsBalance: fsCoins };
    }
  } catch (error) {
    console.warn('[users/profile] firestore coins:', error.message);
  }
  res.json(mergeProfileRecord(req.user.uid, dbUser, memory));
});

router.patch('/profile', requireAuth, requireDbUser, updateProfile);
router.put('/profile', requireAuth, requireDbUser, updateProfile);

router.delete('/account', requireAuth, async (req, res) => {
  const uid = req.user.uid;
  const social = require('../lib/socialMemory');
  const messages = require('../lib/messageMemory');
  const { deleteProfile } = require('../lib/profileMemory');

  social.purgeUser(uid);
  messages.purgeUser(uid);
  deleteProfile(uid);

  if (hasDatabase && prisma) {
    try {
      await prisma.user.delete({ where: { firebaseUid: uid } });
    } catch {
      // el usuario puede no existir en la base de datos
    }
  }

  res.json({ ok: true });
});

module.exports = router;
module.exports.default = router;
