/**
 * Capacidades Super Admin. El dueño tiene todas; cada delegado puede tener un subconjunto.
 */
const OWNER_EMAIL = 'synapsisdev75@gmail.com';

const CAPABILITIES = [
  'messages',
  'gifts',
  'blast',
  'ads',
  'levels',
  'community',
  'requests',
  'withdrawals',
  'verification',
];

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isOwnerEmail(email) {
  return normalizeEmail(email) === OWNER_EMAIL;
}

function isCapability(value) {
  return CAPABILITIES.includes(String(value || ''));
}

function normalizeCapabilities(raw) {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(raw.filter(isCapability).map(String));
  return CAPABILITIES.filter((id) => allowed.has(id));
}

function parseGrants(raw, emails) {
  const map = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const grants = {};
  for (const email of emails) {
    const e = normalizeEmail(email);
    if (!e || isOwnerEmail(e)) continue;
    if (Object.prototype.hasOwnProperty.call(map, e)) {
      grants[e] = normalizeCapabilities(map[e]);
    }
  }
  return grants;
}

function emailsFromDoc(data) {
  const raw = data && Array.isArray(data.emails) ? data.emails : [];
  return [...new Set([OWNER_EMAIL, ...raw.map(normalizeEmail).filter(Boolean)])];
}

function isListed(email, emails) {
  const e = normalizeEmail(email);
  if (!e) return false;
  if (isOwnerEmail(e)) return true;
  return emails.some((item) => normalizeEmail(item) === e);
}

/**
 * @param {string} email
 * @param {string} capability
 * @param {object | null} doc
 */
function hasCapability(email, capability, doc) {
  if (isOwnerEmail(email)) return true;
  const emails = emailsFromDoc(doc);
  if (!isListed(email, emails)) return false;
  if (!isCapability(capability)) return false;
  const grants = parseGrants(doc?.grants, emails);
  const e = normalizeEmail(email);
  if (!Object.prototype.hasOwnProperty.call(grants, e)) return true;
  return grants[e].includes(capability);
}

module.exports = {
  OWNER_EMAIL,
  CAPABILITIES,
  normalizeEmail,
  isOwnerEmail,
  hasCapability,
  parseGrants,
  emailsFromDoc,
};
module.exports.default = module.exports;
