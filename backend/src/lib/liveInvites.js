const { getAdminDb, hasAdminCredentials, firestoreConfigured } = require('./firestoreAdmin');
const { FieldValue } = require('firebase-admin/firestore');

const invitesByRoom = new Map();
/** Expulsados de la Sala Boom de este live (solo esa sala/sesión). */
const bannedByRoom = new Map();
/** Invitaciones Sala 1 pendientes (aún no aceptadas = aún no pueden publicar). */
const pendingById = new Map();
const pendingByRoom = new Map();

const VIEWER_HEARTBEAT_TTL_MS = 45_000;
const SALA_INVITE_TTL_MS = 2 * 60 * 1000;
const TARGET_SLOT_SALA_1 = 'SALA_1';

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
  if (!canUseAdminDb()) return;
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
  if (!canUseAdminDb()) return;
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
  if (!canUseAdminDb()) return;
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

async function persistClearMembers(roomName) {
  if (!canUseAdminDb()) return;
  const room = normalize(roomName);
  if (!room) return;
  try {
    const snap = await getAdminDb().collection('liveRooms').doc(room).collection('salaMembers').get();
    if (snap.empty) return;
    const db = getAdminDb();
    const batch = db.batch();
    snap.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
  } catch (error) {
    console.warn('[invites] persist members clear', error.message);
  }
}

async function persistClear(roomName) {
  if (!hasAdminCredentials() && !firestoreConfigured()) return;
  const room = normalize(roomName);
  if (!room) return;
  try {
    const db = getAdminDb();
    await db.collection('liveRooms').doc(room).set({ guestInvites: [], guestBanned: [] }, { merge: true });
    await persistClearPending(room);
    await persistClearMembers(room);
  } catch (error) {
    console.warn('[invites] persist clear', error.message);
  }
}

function identityKeys(values) {
  const list = Array.isArray(values) ? values : [values];
  return [...new Set(list.map((item) => normalize(item)).filter(Boolean))];
}

async function persistMember(roomName, uid, patch) {
  if (!canUseAdminDb()) return;
  const room = normalize(roomName);
  const id = String(uid || '').trim();
  if (!room || !id) return;
  try {
    await getAdminDb()
      .collection('liveRooms')
      .doc(room)
      .collection('salaMembers')
      .doc(id)
      .set(
        {
          uid: id,
          ...patch,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch (error) {
    console.warn('[invites] persist member', error.message);
  }
}

async function loadMember(roomName, uid) {
  if (!canUseAdminDb()) return null;
  const room = normalize(roomName);
  const id = String(uid || '').trim();
  if (!room || !id) return null;
  try {
    const snap = await getAdminDb()
      .collection('liveRooms')
      .doc(room)
      .collection('salaMembers')
      .doc(id)
      .get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    return {
      uid: id,
      status: String(data.status || ''),
      inviteId: String(data.inviteId || ''),
      handle: normalize(data.handle || ''),
    };
  } catch (error) {
    console.warn('[invites] member read', error.message);
    return null;
  }
}

async function hasActiveMembership(roomName, uid) {
  const member = await loadMember(roomName, uid);
  return member?.status === 'ACTIVE';
}

async function consumeViewerInvites(roomName, uid, inviteId) {
  if (!canUseAdminDb()) return;
  const room = normalize(roomName);
  const viewer = String(uid || '').trim();
  const matchId = String(inviteId || '').trim();
  if (!room) return;
  try {
    const snap = await getAdminDb().collection('liveRooms').doc(room).collection('salaInvites').get();
    if (snap.empty) return;
    const db = getAdminDb();
    const batch = db.batch();
    let writes = 0;
    snap.docs.forEach((item) => {
      const data = item.data() || {};
      const status = String(data.status || '');
      const sameId = matchId && item.id === matchId;
      const sameViewer = viewer && String(data.viewerId || '') === viewer;
      if (!sameId && !sameViewer) return;
      if (status === 'consumed' || status === 'declined' || status === 'rejected') return;
      batch.set(
        item.ref,
        { status: 'consumed', updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      writes += 1;
    });
    if (writes) await batch.commit();
  } catch (error) {
    console.warn('[invites] consume invites', error.message);
  }
}

async function activateGuest(roomName, uid, identities, { inviteId, guestHandle } = {}) {
  const keys = identityKeys([uid, ...(Array.isArray(identities) ? identities : [identities])]);
  for (const key of keys) addInvite(roomName, key);
  await Promise.all(keys.map((key) => persistAdd(roomName, key)));
  if (uid) {
    await persistMember(roomName, uid, {
      status: 'ACTIVE',
      role: 'GUEST',
      inviteId: inviteId || null,
      handle: normalize(guestHandle || ''),
      joinedAtMs: Date.now(),
      leftAtMs: null,
    });
  }
  return keys;
}

async function endGuestParticipation(roomName, uid, identities, inviteId) {
  const keys = identityKeys([uid, ...(Array.isArray(identities) ? identities : [identities])]);
  for (const key of keys) removeInvite(roomName, key);
  if (uid) {
    await persistMember(roomName, uid, {
      status: 'LEFT',
      leftAtMs: Date.now(),
    });
  }
  await consumeViewerInvites(roomName, uid, inviteId);
  await Promise.all(keys.map((key) => persistRemove(roomName, key)));
  return keys;
}

function canUseAdminDb() {
  return hasAdminCredentials() || firestoreConfigured();
}

function rememberPending(invite) {
  if (!invite?.inviteId) return;
  pendingById.set(invite.inviteId, invite);
  const room = normalize(invite.roomName || invite.liveId);
  if (!room) return;
  const set = pendingByRoom.get(room) || new Set();
  set.add(invite.inviteId);
  pendingByRoom.set(room, set);
}

function forgetPending(invite) {
  if (!invite?.inviteId) return;
  pendingById.delete(invite.inviteId);
  const room = normalize(invite.roomName || invite.liveId);
  const set = pendingByRoom.get(room);
  if (!set) return;
  set.delete(invite.inviteId);
  if (!set.size) pendingByRoom.delete(room);
}

function clearPendingInvites(roomName) {
  const room = normalize(roomName);
  const set = pendingByRoom.get(room);
  if (!set) return;
  for (const id of Array.from(set)) pendingById.delete(id);
  pendingByRoom.delete(room);
}

function newInviteId() {
  return `sala1_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function isInviteFresh(invite) {
  if (!invite || invite.status !== 'pending') return false;
  const expires = Number(invite.expiresAtMs || 0);
  return expires > Date.now();
}

async function persistPending(invite) {
  if (!canUseAdminDb() || !invite?.inviteId) return;
  try {
    await getAdminDb()
      .collection('liveRooms')
      .doc(normalize(invite.roomName))
      .collection('salaInvites')
      .doc(invite.inviteId)
      .set(
        {
          inviteId: invite.inviteId,
          liveId: invite.liveId,
          roomName: invite.roomName,
          hostId: invite.hostId,
          viewerId: invite.viewerId,
          guestHandle: invite.guestHandle,
          targetSlot: invite.targetSlot || TARGET_SLOT_SALA_1,
          status: invite.status,
          createdAtMs: invite.createdAtMs,
          expiresAtMs: invite.expiresAtMs,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch (error) {
    console.warn('[invites] persist pending', error.message);
  }
}

async function persistClearPending(roomName) {
  if (!canUseAdminDb()) return;
  const room = normalize(roomName);
  if (!room) return;
  try {
    const snap = await getAdminDb().collection('liveRooms').doc(room).collection('salaInvites').get();
    if (snap.empty) return;
    const db = getAdminDb();
    const batch = db.batch();
    snap.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
  } catch (error) {
    console.warn('[invites] persist pending clear', error.message);
  }
}

async function readActiveViewer(roomName, viewerId) {
  if (!canUseAdminDb()) return null;
  const room = normalize(roomName);
  const uid = String(viewerId || '').trim();
  if (!room || !uid) return null;
  try {
    const snap = await getAdminDb().collection('liveRooms').doc(room).collection('viewers').doc(uid).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    const heartbeatAtMs = Number(data.heartbeatAtMs || data.joinedAtMs || 0);
    if (!(heartbeatAtMs > 0 && Date.now() - heartbeatAtMs <= VIEWER_HEARTBEAT_TTL_MS)) {
      return null;
    }
    return {
      uid,
      username: String(data.username || uid),
      displayName: String(data.displayName || data.username || uid),
    };
  } catch (error) {
    console.warn('[invites] viewer read', error.message);
    return null;
  }
}

async function findActiveViewerByUsername(roomName, guestHandle) {
  if (!canUseAdminDb()) return null;
  const room = normalize(roomName);
  const needle = normalize(guestHandle);
  if (!room || !needle) return null;
  try {
    const snap = await getAdminDb().collection('liveRooms').doc(room).collection('viewers').get();
    for (const item of snap.docs) {
      const data = item.data() || {};
      const username = normalize(data.username || '');
      if (username === needle || normalize(item.id) === needle) {
        return readActiveViewer(roomName, item.id);
      }
    }
    return null;
  } catch (error) {
    console.warn('[invites] viewer by handle', error.message);
    return null;
  }
}

async function isLiveRoomActive(roomName) {
  if (!canUseAdminDb()) return true;
  const room = normalize(roomName);
  try {
    const snap = await getAdminDb().collection('liveRooms').doc(room).get();
    if (!snap.exists) return false;
    const data = snap.data() || {};
    if (String(data.status || '') === 'ended') return false;
    if (Number(data.endedAtMs || 0) > 0) return false;
    return true;
  } catch (error) {
    console.warn('[invites] live read', error.message);
    return true;
  }
}

async function loadPendingInvite(inviteId, roomName) {
  const id = String(inviteId || '').trim();
  if (id && pendingById.has(id)) {
    const memory = pendingById.get(id);
    if (isInviteFresh(memory)) return memory;
    forgetPending(memory);
  }
  if (!canUseAdminDb() || !id) return null;
  const room = normalize(roomName);
  try {
    let snap = null;
    if (room) {
      snap = await getAdminDb().collection('liveRooms').doc(room).collection('salaInvites').doc(id).get();
    }
    if (!snap?.exists) return null;
    const data = snap.data() || {};
    const invite = {
      inviteId: id,
      liveId: normalize(data.liveId || data.roomName || room),
      roomName: normalize(data.roomName || data.liveId || room),
      hostId: String(data.hostId || ''),
      viewerId: String(data.viewerId || ''),
      guestHandle: normalize(data.guestHandle || ''),
      targetSlot: String(data.targetSlot || TARGET_SLOT_SALA_1),
      status: String(data.status || 'pending'),
      createdAtMs: Number(data.createdAtMs || 0),
      expiresAtMs: Number(data.expiresAtMs || 0),
    };
    if (!isInviteFresh(invite)) return null;
    rememberPending(invite);
    return invite;
  } catch (error) {
    console.warn('[invites] pending read', error.message);
    return null;
  }
}

async function createPendingInvite({ liveId, roomName, hostId, viewerId, guestHandle, targetSlot }) {
  const room = normalize(roomName || liveId);
  const slot = String(targetSlot || TARGET_SLOT_SALA_1).toUpperCase();
  if (slot !== TARGET_SLOT_SALA_1) {
    const error = new Error('Solo se puede invitar a Sala 1');
    error.code = 'SLOT_UNAVAILABLE';
    throw error;
  }
  const invite = {
    inviteId: newInviteId(),
    liveId: normalize(liveId || room),
    roomName: room,
    hostId: String(hostId || ''),
    viewerId: String(viewerId || ''),
    guestHandle: normalize(guestHandle || viewerId),
    targetSlot: TARGET_SLOT_SALA_1,
    status: 'pending',
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + SALA_INVITE_TTL_MS,
  };
  rememberPending(invite);
  await persistPending(invite);
  return invite;
}

async function markPendingStatus(invite, status) {
  if (!invite) return null;
  const next = { ...invite, status };
  if (status === 'pending') {
    rememberPending(next);
  } else {
    forgetPending(invite);
  }
  await persistPending(next);
  return next;
}

function grantGuestPublish(roomName, identities) {
  const list = Array.isArray(identities) ? identities : [identities];
  const granted = [];
  for (const item of list) {
    if (!item) continue;
    addInvite(roomName, item);
    granted.push(item);
  }
  return granted;
}

async function hasInvitePersisted(roomName, identities) {
  if (!canUseAdminDb()) return false;
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
  if (!canUseAdminDb()) return false;
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
  persistClearPending,
  persistClearMembers,
  persistMember,
  loadMember,
  hasActiveMembership,
  activateGuest,
  endGuestParticipation,
  consumeViewerInvites,
  clearPendingInvites,
  readActiveViewer,
  findActiveViewerByUsername,
  isLiveRoomActive,
  loadPendingInvite,
  createPendingInvite,
  markPendingStatus,
  grantGuestPublish,
  TARGET_SLOT_SALA_1,
  normalize,
};
