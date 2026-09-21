/**
 * Usuarios Super Admin: listado, XP y lectura de saldos oficiales.
 * BLAST se muta solo vía walletService.
 */
const { FieldValue } = require('firebase-admin/firestore');
const { firestoreConfigured, getAdminDb } = require('./firestoreAdmin');
const engine = require('./walletEngine');

const PRESENCE_ONLINE_MS = 90_000;
const PAGE_MAX = 80;

function readLevelXpFields(data) {
  const organic = Math.max(0, Math.floor(Number(data?.levelXp ?? 0)));
  const pinnedRaw = data?.levelXpPinned;
  const pinned =
    pinnedRaw !== undefined && pinnedRaw !== null && pinnedRaw !== ''
      ? Math.max(0, Math.floor(Number(pinnedRaw)))
      : null;
  return { organic, pinned, effective: pinned != null ? pinned : organic };
}

function asIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof value === 'object' && typeof value._seconds === 'number') {
    return new Date(value._seconds * 1000).toISOString();
  }
  return null;
}

function mapUserRow(id, data, presence) {
  const row = data || {};
  const username = String(row.username || '')
    .replace(/^@/, '')
    .toLowerCase();
  const xp = readLevelXpFields(row);
  const balances = engine.normalizeBlastBalances(row);
  const presenceAt = presence?.presenceAt || null;
  return {
    uid: id,
    username,
    displayName: String(row.displayName || username || 'Usuario'),
    email: String(row.email || ''),
    avatarUrl: row.avatarUrl || null,
    levelXp: xp.effective,
    levelXpPinned: xp.pinned,
    levelXpOrganic: xp.organic,
    coinsBalance: balances.coinsBalance,
    purchasedBlastBalance: balances.purchasedBlastBalance,
    earnedBlastBalance: balances.earnedBlastBalance,
    earnedBlastReserved: balances.earnedBlastReserved,
    online: Boolean(presence?.online),
    presenceAt,
    createdAt: asIso(row.createdAt),
    profilePath: `/u/${encodeURIComponent(username || 'user')}?uid=${encodeURIComponent(id)}`,
  };
}

function normalizeQuery(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
}

async function readPresence(db, uid) {
  try {
    const snap = await db.collection('users').doc(uid).collection('presence').doc('now').get();
    if (!snap.exists) return { online: false, presenceAt: null };
    const presenceAt = asIso(snap.data()?.at);
    if (!presenceAt) return { online: false, presenceAt: null };
    const age = Date.now() - new Date(presenceAt).getTime();
    return { online: age < PRESENCE_ONLINE_MS, presenceAt };
  } catch {
    return { online: false, presenceAt: null };
  }
}

async function attachPresence(db, rows) {
  const out = await Promise.all(
    rows.map(async (row) => {
      const presence = await readPresence(db, row.uid);
      return { ...row, ...presence };
    }),
  );
  return out;
}

async function countUsers(db) {
  try {
    const agg = await db.collection('users').count().get();
    return Number(agg.data().count) || 0;
  } catch {
    return 0;
  }
}

async function searchUserDocs(db, needle, take) {
  const found = new Map();
  const byId = await db.collection('users').doc(needle).get();
  if (byId.exists) found.set(byId.id, byId);

  const unameDoc = await db.collection('usernames').doc(needle).get();
  if (unameDoc.exists) {
    const uid = String(unameDoc.data()?.uid || '').trim();
    if (uid && !found.has(uid)) {
      const snap = await db.collection('users').doc(uid).get();
      if (snap.exists) found.set(snap.id, snap);
    }
  }

  const queries = [
    db.collection('users').where('username', '==', needle).limit(take),
    db.collection('users').where('email', '==', needle).limit(take),
    db.collection('users').where('username', '>=', needle).where('username', '<=', `${needle}\uf8ff`).limit(take),
  ];
  for (const q of queries) {
    try {
      const snap = await q.get();
      snap.docs.forEach((doc) => found.set(doc.id, doc));
    } catch (error) {
      console.warn('[adminUsers] search query', error.message);
    }
  }
  return [...found.values()].slice(0, take);
}

async function listAdminUsers({ q = '', cursor = null, limit = 40 } = {}) {
  const take = Math.min(PAGE_MAX, Math.max(1, Math.floor(Number(limit) || 40)));
  const needle = normalizeQuery(q);
  if (!firestoreConfigured()) {
    return { users: [], nextCursor: null, total: 0, truncatedSearch: false };
  }
  const db = getAdminDb();
  const total = await countUsers(db);

  if (needle) {
    const docs = await searchUserDocs(db, needle, take);
    const mapped = docs.map((doc) => mapUserRow(doc.id, doc.data()));
    const users = await attachPresence(db, mapped);
    return { users, nextCursor: null, total, truncatedSearch: false };
  }

  let query = db.collection('users').orderBy('createdAt', 'desc').limit(take + 1);
  if (cursor) {
    try {
      const cursorDoc = await db.collection('users').doc(String(cursor)).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    } catch (error) {
      console.warn('[adminUsers] cursor', error.message);
    }
  }

  let snap;
  try {
    snap = await query.get();
  } catch {
    snap = await db.collection('users').limit(take + 1).get();
  }

  const page = snap.docs.slice(0, take);
  const mapped = page.map((doc) => mapUserRow(doc.id, doc.data()));
  const users = await attachPresence(db, mapped);
  const extra = snap.docs[take];
  return {
    users,
    nextCursor: extra ? extra.id : null,
    total,
    truncatedSearch: false,
  };
}

async function applyXp({ uid, mode, value }) {
  const id = String(uid || '').trim();
  if (!id) {
    const error = new Error('Usuario inválido');
    error.status = 400;
    throw error;
  }
  if (!firestoreConfigured()) {
    const error = new Error('Firestore no configurado');
    error.status = 503;
    throw error;
  }
  const db = getAdminDb();
  const ref = db.collection('users').doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      const error = new Error('Usuario no encontrado');
      error.status = 404;
      throw error;
    }
    const before = readLevelXpFields(snap.data());
    const amount = Math.floor(Number(value) || 0);
    let after = before;
    if (mode === 'set') {
      const next = Math.max(0, amount);
      tx.set(ref, { levelXpPinned: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      after = { ...before, pinned: next, effective: next };
    } else if (mode === 'clear') {
      tx.set(
        ref,
        { levelXpPinned: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      after = { ...before, pinned: null, effective: before.organic };
    } else if (mode === 'adjust') {
      if (!amount) {
        const error = new Error('Delta inválido');
        error.status = 400;
        throw error;
      }
      if (before.pinned != null) {
        const next = Math.max(0, before.pinned + amount);
        tx.set(ref, { levelXpPinned: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        after = { ...before, pinned: next, effective: next };
      } else {
        const next = Math.max(0, before.organic + amount);
        tx.set(ref, { levelXp: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        after = { organic: next, pinned: null, effective: next };
      }
    } else {
      const error = new Error('Modo XP no válido');
      error.status = 400;
      throw error;
    }
    return { uid: id, before, after };
  });
}

module.exports = {
  listAdminUsers,
  applyXp,
  readLevelXpFields,
  mapUserRow,
  normalizeQuery,
};
module.exports.default = module.exports;
