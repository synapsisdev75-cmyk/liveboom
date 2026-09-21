const { getAdminDb, firestoreConfigured } = require('../lib/firestoreAdmin');
const { OWNER_EMAIL, hasCapability } = require('../lib/superAdminCapabilities');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function readSuperAdminsDoc() {
  if (!firestoreConfigured()) return { emails: [OWNER_EMAIL], grants: {} };
  try {
    const snap = await getAdminDb().doc('config/superAdmins').get();
    return snap.exists ? snap.data() || {} : { emails: [OWNER_EMAIL], grants: {} };
  } catch (error) {
    console.warn('[auth] superAdmins lookup', error.message);
    return { emails: [OWNER_EMAIL], grants: {} };
  }
}

async function isSuperAdminEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return false;
  if (e === OWNER_EMAIL) return true;
  const doc = await readSuperAdminsDoc();
  const raw = Array.isArray(doc.emails) ? doc.emails : [];
  return raw.some((item) => normalizeEmail(item) === e);
}

async function emailHasCapability(email, capability) {
  const doc = await readSuperAdminsDoc();
  return hasCapability(email, capability, doc);
}

function requestEmail(req) {
  return req.user?.email || req.dbUser?.email || '';
}

function requireSuperAdmin(req, res, next) {
  const email = requestEmail(req);
  Promise.resolve(isSuperAdminEmail(email))
    .then((ok) => {
      if (!ok) {
        res.status(403).json({ error: 'Solo super-admin puede realizar esta acción' });
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

function requireCapability(capability) {
  return function requireSuperAdminCapability(req, res, next) {
    const email = requestEmail(req);
    Promise.resolve(emailHasCapability(email, capability))
      .then((ok) => {
        if (!ok) {
          res.status(403).json({
            error: 'El dueño no te asignó esta función de Super Admin.',
          });
          return;
        }
        next();
      })
      .catch((error) => {
        console.error('[auth] requireCapability', capability, error);
        if (!res.headersSent) {
          res.status(403).json({ error: 'No se pudo verificar la función de Super Admin' });
        }
      });
  };
}

module.exports = requireSuperAdmin;
module.exports.requireSuperAdmin = requireSuperAdmin;
module.exports.requireCapability = requireCapability;
module.exports.isSuperAdminEmail = isSuperAdminEmail;
module.exports.emailHasCapability = emailHasCapability;
module.exports.default = requireSuperAdmin;
