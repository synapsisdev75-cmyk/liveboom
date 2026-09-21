/**
 * Auditoría Super Admin vía Admin SDK. Inmutable desde el cliente.
 * No guarda contraseñas, tokens, documentos completos ni cuentas bancarias.
 */
const { FieldValue } = require('firebase-admin/firestore');
const { firestoreConfigured, getAdminDb } = require('./firestoreAdmin');

const AUDIT_COL = 'adminAuditLogs';
const SECRET_KEY = /pass(word)?|token|secret|authorization|idToken|refresh|pin|vault|accountNumber|documentNumber|iban|cvv|otp/i;
const MAX_META_KEYS = 24;
const MAX_STRING = 500;

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function sanitizeValue(value, depth = 0) {
  if (value == null) return null;
  if (depth > 3) return '[…]';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.slice(0, MAX_STRING);
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    let count = 0;
    for (const [key, item] of Object.entries(value)) {
      if (count >= MAX_META_KEYS) break;
      if (SECRET_KEY.test(key)) continue;
      out[String(key).slice(0, 80)] = sanitizeValue(item, depth + 1);
      count += 1;
    }
    return out;
  }
  return String(value).slice(0, MAX_STRING);
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  return sanitizeValue(meta) || {};
}

async function writeAdminAudit(input) {
  const actorUid = String(input?.actorUid || '').trim();
  const actorEmail = normalizeEmail(input?.actorEmail);
  const action = String(input?.action || '')
    .trim()
    .slice(0, 80);
  if (!actorUid || !actorEmail || !action) return null;
  const row = {
    actorUid,
    actorEmail,
    uid: actorUid,
    email: actorEmail,
    action,
    resourceType: String(input?.resourceType || '').slice(0, 80),
    resourceId: String(input?.resourceId || '').slice(0, 160),
    result: String(input?.result || 'ok').slice(0, 32),
    reason: String(input?.reason || '').slice(0, 400),
    before: sanitizeMeta(input?.before),
    after: sanitizeMeta(input?.after),
    meta: sanitizeMeta(input?.meta),
    requestId: String(input?.requestId || '').slice(0, 80),
    createdAt: FieldValue.serverTimestamp(),
    createdAtMs: Date.now(),
  };
  if (!firestoreConfigured()) {
    return { ...row, id: `mem_${row.createdAtMs}`, createdAt: null };
  }
  try {
    const ref = await getAdminDb().collection(AUDIT_COL).add(row);
    return { id: ref.id, ...row, createdAt: undefined };
  } catch (error) {
    console.warn('[adminAudit] write', error.message);
    return null;
  }
}

async function listAdminAudit({ cursor = null, limit = 40 } = {}) {
  const take = Math.min(80, Math.max(1, Math.floor(Number(limit) || 40)));
  if (!firestoreConfigured()) {
    return { logs: [], nextCursor: null };
  }
  let q = getAdminDb().collection(AUDIT_COL).orderBy('createdAtMs', 'desc').limit(take + 1);
  const cursorMs = Number(cursor);
  if (Number.isFinite(cursorMs) && cursorMs > 0) {
    q = q.startAfter(cursorMs);
  }
  const snap = await q.get();
  const docs = snap.docs.slice(0, take);
  const logs = docs.map((doc) => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      actorUid: data.actorUid || data.uid || '',
      actorEmail: data.actorEmail || data.email || '',
      action: data.action || '',
      resourceType: data.resourceType || '',
      resourceId: data.resourceId || '',
      result: data.result || '',
      reason: data.reason || '',
      before: data.before || {},
      after: data.after || {},
      meta: data.meta || {},
      requestId: data.requestId || '',
      createdAtMs: Number(data.createdAtMs) || 0,
    };
  });
  const extra = snap.docs[take];
  return {
    logs,
    nextCursor: extra ? String(extra.data()?.createdAtMs || extra.id) : null,
  };
}

module.exports = {
  writeAdminAudit,
  listAdminAudit,
  sanitizeMeta,
  SECRET_KEY,
};
module.exports.default = module.exports;
