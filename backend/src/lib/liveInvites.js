const { getAdminDb } = require('./firestoreAdmin');
const { FieldValue } = require('firebase-admin/firestore');

const invitesByRoom = new Map();
/** Expulsados de la Sala Boom de este live (solo esa sala/sesión). */
const bannedByRoom = new Map();

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
}

function addInvite(roomName, guestHandle) {
  const room = normalize(roomName);
  const guest = normalize(guestHandle);
  if (!room || !guest) return null;
  const set = invitesByRoom.get(room) || new Set();
  set.add(guest);
  invitesByRoom.set(room, set);
  return { room, guest };
}

function hasInvite(roomName, identities) {
  const room = normalize(roomName);
  const set = invitesByRoom.get(room);
  if (!set || !set.size) return false;
  const list = Array.isArray(identities) ? identities : [identities];
  return list.some((item) => set.has(normalize(item)));
}

function clearInvites(roomName) {
  invitesByRoom.delete(normalize(roomName));
}

function listInvites(roomName) {
  const set = invitesByRoom.get(normalize(roomName));
  return set ? Array.from(set) : [];
}

function removeInvite(roomName, guestHandle) {
  const room = normalize(roomName);
  const guest = normalize(guestHandle);
  const set = invitesByRoom.get(room);
  if (!set || !guest) return false;
  let removed = set.delete(guest);
  for (const item of Array.from(set)) {
    if (item === guest) {
      set.delete(item);
      removed = true;
    }
  }
  if (!set.size) invitesByRoom.delete(room);
  return removed;
}

function addBan(roomName, guestHandle) {
  const room = normalize(roomName);
  const guest = normalize(guestHandle);
  if (!room || !guest) return null;
  const set = bannedByRoom.get(room) || new Set();
  set.add(guest);
  bannedByRoom.set(room, set);
  return { room, guest };
}

function hasBan(roomName, identities) {
  const room = normalize(roomName);
  const set = bannedByRoom.get(room);
  if (!set || !set.size) return false;
  const list = Array.isArray(identities) ? identities : [identities];
  return list.some((item) => set.has(normalize(item)));
}

function clearBans(roomName) {
  bannedByRoom.delete(normalize(roomName));
}

function listBans(roomName) {
  const set = bannedByRoom.get(normalize(roomName));
  return set ? Array.from(set) : [];
}

async function persistAdd(roomName, guestHandle) {
  const room = normalize(roomName);
  const guest = normalize(guestHandle);
  if (!room || !guest) return;
  try {
    await getAdminDb()
      .collection('liveRooms')
      .doc(room)
      .set({ guestInvites: FieldValue.arrayUnion(guest) }, { merge: true });
  } catch (error) {
    console.warn('[invites] persist add', error.message);
  }
}

async function persistRemove(roomName, guestHandle) {
  const room = normalize(roomName);
  const guest = normalize(guestHandle);
  if (!room || !guest) return;
  try {
    await getAdminDb()
      .collection('liveRooms')
      .doc(room)
      .set({ guestInvites: FieldValue.arrayRemove(guest) }, { merge: true });
  } catch (error) {
    console.warn('[invites] persist remove', error.message);
  }
}

async function persistBanAdd(roomName, guestHandle) {
  const room = normalize(roomName);
  const guest = normalize(guestHandle);
  if (!room || !guest) return;
  try {
    await getAdminDb()
      .collection('liveRooms')
      .doc(room)
      .set(
        {
          guestBanned: FieldValue.arrayUnion(guest),
          guestInvites: FieldValue.arrayRemove(guest),
        },
        { merge: true },
      );
  } catch (error) {
    console.warn('[invites] persist ban', error.message);
  }
}

async function persistClear(roomName) {
  const room = normalize(roomName);
  if (!room) return;
  try {
    await getAdminDb()
      .collection('liveRooms')
      .doc(room)
      .set({ guestInvites: [], guestBanned: [] }, { merge: true });
  } catch (error) {
    console.warn('[invites] persist clear', error.message);
  }
}

async function hasInvitePersisted(roomName, identities) {
  const room = normalize(roomName);
  const list = Array.isArray(identities) ? identities : [identities];
  const keys = list.map(normalize).filter(Boolean);
  if (!room || !keys.length) return false;
  try {
    const snap = await getAdminDb().collection('liveRooms').doc(room).get();
    const stored = Array.isArray(snap.data()?.guestInvites) ? snap.data().guestInvites : [];
    const set = new Set(stored.map(normalize));
    return keys.some((item) => set.has(item));
  } catch (error) {
    console.warn('[invites] persist read', error.message);
    return false;
  }
}

async function hasBanPersisted(roomName, identities) {
  const room = normalize(roomName);
  const list = Array.isArray(identities) ? identities : [identities];
  const keys = list.map(normalize).filter(Boolean);
  if (!room || !keys.length) return false;
  try {
    const snap = await getAdminDb().collection('liveRooms').doc(room).get();
    const stored = Array.isArray(snap.data()?.guestBanned) ? snap.data().guestBanned : [];
    const set = new Set(stored.map(normalize));
    return keys.some((item) => set.has(item));
  } catch (error) {
    console.warn('[invites] persist ban read', error.message);
    return false;
  }
}

async function isBanned(roomName, identities) {
  if (hasBan(roomName, identities)) return true;
  return hasBanPersisted(roomName, identities);
}

module.exports = {
  addInvite,
  hasInvite,
  hasInvitePersisted,
  clearInvites,
  listInvites,
  removeInvite,
  addBan,
  hasBan,
  clearBans,
  listBans,
  isBanned,
  hasBanPersisted,
  persistAdd,
  persistRemove,
  persistBanAdd,
  persistClear,
  normalize,
};
