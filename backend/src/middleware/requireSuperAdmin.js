const { getAdminDb, firestoreConfigured } = require('../lib/firestoreAdmin');
const { OWNER_EMAIL, isOwnerEmail, hasCapability } = require('../lib/superAdminCapabilities');

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
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

function requestUid(req) {
  return req.user?.uid || req.dbUser?.firebaseUid || '';
}

function expiresAtMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Las escrituras del panel exigen la misma sesión de bóveda que las reglas de Firestore.
 * Sin Firestore (tests locales) se omite.
 */
async function hasValidVaultSession(uid, email) {
  if (!firestoreConfigured()) return true;
  const id = String(uid || '').trim();
  const e = normalizeEmail(email);
  if (!id || !e) return false;
  try {
    const snap = await getAdminDb().collection('adminSessions').doc(id).get();
    if (!snap.exists) return false;
    const data = snap.data() || {};
    if (expiresAtMs(data.expiresAt) <= Date.now()) return false;
    return normalizeEmail(data.email) === e;
  } catch (error) {
    console.warn('[auth] vault session', error.message);
    return false;
  }
}

function deny(res, status, error) {
  if (!res.headersSent) res.status(status).json({ error });
}

function requireVaultThen(check, deniedMessage) {
  return function gated(req, res, next) {
    const email = requestEmail(req);
    const uid = requestUid(req);
    Promise.resolve(hasValidVaultSession(uid, email))
      .then((vaultOk) => {
        if (!vaultOk) {
          deny(res, 403, 'Abre la bóveda Super Admin con Google para continuar.');
          return null;
        }
        return check(req);
      })
      .then((ok) => {
        if (ok == null) return;
        if (!ok) {
          deny(res, 403, deniedMessage || 'No autorizado para esta función de Super Admin.');
          return;
        }
        next();
      })
      .catch((error) => {
        console.error('[auth] super-admin gate', error);
        deny(res, 403, 'No se pudo verificar Super Admin');
      });
  };
}

function requireSuperAdmin(req, res, next) {
  requireVaultThen((r) => isSuperAdminEmail(requestEmail(r)), 'Solo super-admin puede realizar esta acción')(
    req,
    res,
    next,
  );
}

function requireCapability(capability) {
  return requireVaultThen(
    (req) => emailHasCapability(requestEmail(req), capability),
    'El dueño no te asignó esta función de Super Admin.',
  );
}

function requireOwner(req, res, next) {
  requireVaultThen((r) => isOwnerEmail(requestEmail(r)), 'Solo el dueño puede realizar esta acción')(
    req,
    res,
    next,
  );
}

module.exports = requireSuperAdmin;
module.exports.requireSuperAdmin = requireSuperAdmin;
module.exports.requireCapability = requireCapability;
module.exports.requireOwner = requireOwner;
module.exports.isSuperAdminEmail = isSuperAdminEmail;
module.exports.emailHasCapability = emailHasCapability;
module.exports.hasValidVaultSession = hasValidVaultSession;
module.exports.default = requireSuperAdmin;
