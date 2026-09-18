const { getAdminDb, hasAdminCredentials, firestoreConfigured } = require('./firestoreAdmin');
const { FieldValue } = require('firebase-admin/firestore');

/** Expulsados de este LIVE (público o privado) hasta que el host inicie otra sesión. */
const kickedByRoom = new Map();

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
}

function canUseAdminDb() {
  return hasAdminCredentials() || firestoreConfigured();
}

function identityKeys(values) {
  const list = Array.isArray(values) ? values : [values];
  return [...new Set(list.map((item) => normalize(item)).filter(Boolean))];
}

function addKick(roomName, identity) {
  const room = normalize(roomName);
  const key = normalize(identity);
  if (!room || !key) return null;
  const set = kickedByRoom.get(room) || new Set();
  set.add(key);
  kickedByRoom.set(room, set);
  return { room, key };
}

function hasKick(roomName, identities) {
  const room = normalize(roomName);
  const set = kickedByRoom.get(room);
  if (!set || !set.size) return false;
  return identityKeys(identities).some((item) => set.has(item));
}

function clearKicks(roomName) {
  kickedByRoom.delete(normalize(roomName));
}

async function persistKickAdd(roomName, identity) {
  if (!canUseAdminDb()) return;
  const room = normalize(roomName);
  const key = normalize(identity);
  if (!room || !key) return;
  try {
    await getAdminDb()
      .collection('liveRooms')
      .doc(room)
      .set({ viewerKicked: FieldValue.arrayUnion(key) }, { merge: true });
  } catch (error) {
    console.warn('[viewer-kick] persist', error.message);
  }
}

async function persistKickClear(roomName) {
  if (!canUseAdminDb()) return;
  const room = normalize(roomName);
  if (!room) return;
  try {
    await getAdminDb().collection('liveRooms').doc(room).set({ viewerKicked: [] }, { merge: true });
  } catch (error) {
    console.warn('[viewer-kick] persist clear', error.message);
  }
}

async function hasKickPersisted(roomName, identities) {
  if (!canUseAdminDb()) return false;
  const room = normalize(roomName);
  const keys = identityKeys(identities);
  if (!room || !keys.length) return false;
  try {
    const snap = await getAdminDb().collection('liveRooms').doc(room).get();
    const stored = Array.isArray(snap.data()?.viewerKicked) ? snap.data().viewerKicked : [];
    const set = new Set(stored.map(normalize));
    return keys.some((item) => set.has(item));
  } catch (error) {
    console.warn('[viewer-kick] persist read', error.message);
    return false;
  }
}

async function isKicked(roomName, identities) {
  if (hasKick(roomName, identities)) return true;
  return hasKickPersisted(roomName, identities);
}

async function removeViewerPresence(roomName, uid) {
  if (!canUseAdminDb()) return;
  const room = normalize(roomName);
  const id = String(uid || '').trim();
  if (!room || !id) return;
  try {
    await getAdminDb().collection('liveRooms').doc(room).collection('viewers').doc(id).delete();
  } catch (error) {
    console.warn('[viewer-kick] presence', error.message);
  }
}

module.exports = {
  addKick,
  hasKick,
  clearKicks,
  persistKickAdd,
  persistKickClear,
  isKicked,
  removeViewerPresence,
  identityKeys,
};
