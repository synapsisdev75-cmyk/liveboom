const express = require('express');
const { mw } = require('../lib/bind');
const { prisma } = require('../lib/prisma');

const router = express.Router();
const auth = () => require('../middleware/auth');
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

let profileColumnsReady = false;

function serializeUser(user) {
  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    username: user.username,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    birthDate: user.birthDate ? new Date(user.birthDate).toISOString().slice(0, 10) : null,
    coinsBalance: user.coinsBalance,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
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

async function ensureProfileColumns() {
  if (profileColumnsReady) return;
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3)',
  );
  profileColumnsReady = true;
}

async function updateProfile(req, res) {
  const username = parseUsername(req.body?.username);
  const bio = typeof req.body?.bio === 'string' ? req.body.bio.trim().slice(0, 280) : '';
  const avatarUrl =
    typeof req.body?.avatarUrl === 'string' ? req.body.avatarUrl.trim().slice(0, 350000) : '';
  const birthDateRaw = typeof req.body?.birthDate === 'string' ? req.body.birthDate.trim() : '';

  if (!USERNAME_RE.test(username)) {
    res.status(400).json({ error: 'El usuario debe tener 3-20 caracteres (a-z, 0-9, _).' });
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

  try {
    await ensureProfileColumns();

    const taken = await prisma.user.findFirst({
      where: {
        username,
        NOT: { id: req.dbUser.id },
      },
      select: { id: true },
    });
    if (taken) {
      res.status(409).json({ error: 'Ese nombre de usuario ya está en uso.' });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.dbUser.id },
      data: {
        username,
        bio: bio || null,
        avatarUrl: avatarUrl || req.dbUser.avatarUrl,
        birthDate: new Date(`${birthDateRaw}T00:00:00.000Z`),
      },
    });

    res.json(serializeUser(user));
  } catch (error) {
    console.error('[users/profile]', error);
    res.status(500).json({ error: 'No se pudo actualizar el perfil en PostgreSQL' });
  }
}

router.use(async (_req, _res, next) => {
  try {
    await ensureProfileColumns();
  } catch {
    /* ignore */
  }
  next();
});

router.get('/profile', requireAuth, requireDbUser, (req, res) => {
  res.json(serializeUser(req.dbUser));
});

router.patch('/profile', requireAuth, requireDbUser, updateProfile);
router.put('/profile', requireAuth, requireDbUser, updateProfile);

module.exports = router;
