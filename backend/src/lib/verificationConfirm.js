const { createHash, randomBytes, timingSafeEqual } = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');
const { firestoreConfigured, getAdminDb } = require('./firestoreAdmin');

const COLLECTION = 'wallet_withdraw_confirms';
const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const memory = new Map();

function hashCode(code) {
  return createHash('sha256').update(String(code || '')).digest('hex');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function newCode() {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return String(n).padStart(6, '0');
}

async function issueConfirm({ userId, coins, accountId, fingerprint }) {
  const confirmId = `wc_${randomBytes(10).toString('hex')}`;
  const code = newCode();
  const row = {
    confirmId,
    userId: String(userId),
    coins: Math.max(0, Math.floor(Number(coins) || 0)),
    accountId: String(accountId || ''),
    fingerprint: String(fingerprint || ''),
    codeHash: hashCode(code),
    attempts: 0,
    used: false,
    expiresAtMs: Date.now() + TTL_MS,
    createdAtMs: Date.now(),
  };
  if (firestoreConfigured()) {
    await getAdminDb().collection(COLLECTION).doc(confirmId).set({
      ...row,
      createdAt: FieldValue.serverTimestamp(),
    });
  } else {
    memory.set(confirmId, row);
  }
  return { confirmId, code, expiresAtMs: row.expiresAtMs };
}

async function consumeConfirm({ confirmId, code, userId, coins, accountId, fingerprint }) {
  const id = String(confirmId || '').trim();
  if (!id) return { ok: false, code: 'CONFIRM_MISSING' };
  let ref = null;
  let row = memory.get(id) || null;
  if (firestoreConfigured()) {
    ref = getAdminDb().collection(COLLECTION).doc(id);
    const snap = await ref.get();
    row = snap.exists ? snap.data() : null;
  }
  if (!row) return { ok: false, code: 'CONFIRM_MISSING' };
  if (row.used) return { ok: false, code: 'CONFIRM_USED' };
  if (Number(row.expiresAtMs) < Date.now()) return { ok: false, code: 'CONFIRM_EXPIRED' };
  if (String(row.userId) !== String(userId)) return { ok: false, code: 'CONFIRM_MISMATCH' };
  if (Math.floor(Number(row.coins) || 0) !== Math.floor(Number(coins) || 0)) {
    return { ok: false, code: 'CONFIRM_STALE' };
  }
  if (String(row.accountId) !== String(accountId || '')) return { ok: false, code: 'CONFIRM_STALE' };
  if (String(row.fingerprint) !== String(fingerprint || '')) return { ok: false, code: 'CONFIRM_STALE' };
  const attempts = Math.floor(Number(row.attempts) || 0) + 1;
  if (attempts > MAX_ATTEMPTS) return { ok: false, code: 'CONFIRM_LOCKED' };
  const ok = safeEqual(row.codeHash, hashCode(code));
  const patch = { attempts, used: Boolean(ok) };
  if (firestoreConfigured() && ref) {
    await ref.set(patch, { merge: true });
  } else if (row) {
    memory.set(id, { ...row, ...patch });
  }
  if (!ok) return { ok: false, code: attempts >= MAX_ATTEMPTS ? 'CONFIRM_LOCKED' : 'CONFIRM_INVALID' };
  return { ok: true, confirmId: id };
}

module.exports = {
  TTL_MS,
  MAX_ATTEMPTS,
  issueConfirm,
  consumeConfirm,
};
module.exports.default = module.exports;
