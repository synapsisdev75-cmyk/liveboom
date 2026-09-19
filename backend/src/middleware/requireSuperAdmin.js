const { getAdminDb, firestoreConfigured } = require('../lib/firestoreAdmin');

const OWNER_EMAIL = 'synapsisdev75@gmail.com';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function isSuperAdminEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return false;
  if (e === OWNER_EMAIL) return true;
  if (!firestoreConfigured()) return false;
  try {
    const snap = await getAdminDb().doc('config/superAdmins').get();
    const raw = snap.exists && Array.isArray(snap.data()?.emails) ? snap.data().emails : [];
    return raw.some((item) => normalizeEmail(item) === e);
  } catch (error) {
    console.warn('[auth] superAdmins lookup', error.message);
    return false;
  }
}

function requireSuperAdmin(req, res, next) {
  const email = req.user?.email || req.dbUser?.email || '';
  Promise.resolve(isSuperAdminEmail(email))
    .then((ok) => {
      if (!ok) {
        res.status(403).json({ error: 'Solo super-admin puede convertir animaciones' });
        return;
      }
      next();
    })
    .catch((error) => {
      console.error('[auth] requireSuperAdmin', error);
      if (!res.headersSent) {
        res.status(403).json({ error: 'No se pudo verificar super-admin' });
      }
    });
}

module.exports = requireSuperAdmin;
module.exports.requireSuperAdmin = requireSuperAdmin;
module.exports.default = requireSuperAdmin;
