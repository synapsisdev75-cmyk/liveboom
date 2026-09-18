const express = require('express');
const { asFn } = require('../lib/asFn');
const presence = require('../lib/livePresence');
const invites = require('../lib/liveInvites');
const liveLocks = require('../lib/liveLocks');
const reelStore = require('../lib/reelStore');
const liveHistory = require('../lib/liveHistory');
const liveSession = require('../lib/liveSession');
const social = require('../lib/socialMemory');
const { getProfile, findByUsername, saveProfile } = require('../lib/profileMemory');
const { getBalance } = require('../lib/walletMemory');
const { getAdminDb, firestoreConfigured } = require('../lib/firestoreAdmin');
const livePrivate = require('../lib/livePrivateSession');
const viewerKick = require('../lib/liveViewerKick');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const livekit = () => require('../lib/livekit');

const upsertLive = presence.upsertLive || presence.default?.upsertLive;
const removeLive = presence.removeLive || presence.default?.removeLive;
const listLives = presence.listLives || presence.default?.listLives;
const getLive = presence.getLive || presence.default?.getLive;

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
}

/** Grant durable en Firestore (sessionId + accessGranted). */
async function syncDurablePrivateUnlock(roomName, uid) {
  if (!uid || !firestoreConfigured()) return false;
  try {
    const key = normalize(roomName);
    const db = getAdminDb();
    const roomSnap = await db.collection('liveRooms').doc(key).get();
    const sessionId = roomSnap.exists ? String(roomSnap.data()?.privateSessionId || '') : '';
    if (!sessionId) return false;
    const grantSnap = await db
      .collection('liveRooms')
      .doc(key)
      .collection('privateGrants')
      .doc(String(uid))
      .get();
    if (!grantSnap.exists) return false;
    const data = grantSnap.data() || {};
    if (String(data.sessionId || '') !== sessionId) return false;
    if (!data.accessGranted && data.source !== 'host' && data.source !== 'unlock') return false;
    liveLocks.markUnlocked(roomName, uid);
    return true;
  } catch {
    return false;
  }
}

function identitiesFromToken(decoded) {
  const emailHandle = decoded.email ? String(decoded.email).split('@')[0] : '';
  const named = decoded.name || emailHandle || decoded.uid;
  const base =
    normalize(named).replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 20) || 'user';
  const profile = getProfile(decoded.uid);
  return [
    decoded.uid,
    emailHandle,
    normalize(emailHandle),
    `${base}_${String(decoded.uid).slice(0, 8)}`,
    base,
    named,
    profile?.username,
  ]
    .map((item) => normalize(item))
    .filter(Boolean);
}

/**
 * Host = dueño del username de la sala (perfil) o identidades del token Firebase.
 * Si el cliente manda ?handle= igual a la sala, vinculamos ese username al uid
 * (Firestore/perfil real) para que canPublish no falle al transmitir.
 */
function isRoomHost(decoded, roomName, claimedHandle) {
  const room = normalize(roomName);
  const uid = String(decoded.uid || '');
  if (!room || !uid) return false;

  const claimed = normalize(claimedHandle || '');
  if (claimed && claimed === room) {
    const owner = findByUsername(room);
    if (!owner || owner.firebaseUid === uid) {
      const prev = getProfile(uid) || {};
      saveProfile(uid, {
        ...prev,
        firebaseUid: uid,
        username: room,
        email: prev.email || decoded.email || `${uid}@users.liveboom.local`,
        displayName: prev.displayName || decoded.name || room,
        avatarUrl: prev.avatarUrl ?? decoded.picture ?? null,
      });
    }
  }

  const owner = findByUsername(room);
  if (owner?.firebaseUid && owner.firebaseUid === uid) return true;

  const profile = getProfile(uid);
  if (profile?.username && normalize(profile.username) === room) return true;

  return identitiesFromToken(decoded).includes(room);
}

function canGuestPublish(decoded, roomName) {
  return invites.hasInvite(roomName, identitiesFromToken(decoded));
}

async function canGuestPublishAsync(decoded, roomName) {
  const ids = identitiesFromToken(decoded);
  if (await invites.isBanned(roomName, ids)) return false;
  const member = await invites.loadMember(roomName, decoded.uid);
  if (member) return member.status === 'ACTIVE';
  if (invites.hasInvite(roomName, ids)) return true;
  return invites.hasInvitePersisted(roomName, ids);
}

router.get('/live', async (req, res) => {
  const lk = livekit();
  const listActiveLiveRooms = lk.listActiveLiveRooms || lk.default?.listActiveLiveRooms;
  const memory = typeof listLives === 'function' ? listLives() : [];
  const fromLivekit = typeof listActiveLiveRooms === 'function' ? await listActiveLiveRooms() : [];
  const byName = new Map();
  for (const item of [...memory, ...fromLivekit]) {
    if (!item?.username) continue;
    const prev = byName.get(item.username);
    byName.set(item.username, {
      ...prev,
      ...item,
      viewers: Math.max(Number(prev?.viewers || 0), Number(item.viewers || 0)),
      title: item.title || prev?.title || `Live de ${item.username}`,
      displayName: item.displayName || prev?.displayName || item.username,
      isPrivate: Boolean(item.isPrivate ?? prev?.isPrivate ?? false),
      lockGiftId: item.lockGiftId ?? prev?.lockGiftId ?? null,
    });
  }
  const includePrivate = req.query.includePrivate === '1';
  const category =
    typeof req.query.category === 'string' ? normalize(req.query.category) : '';
  let streams = Array.from(byName.values()).filter((item) => {
    // Llamadas privadas 1:1 nunca aparecen como LIVE.
    if (/^dm[_-]/i.test(String(item.username || ''))) return false;
    if (includePrivate) return true;
    if (item.isPrivate) return false;
    return true;
  });
  if (category) {
    streams = streams.filter((item) => normalize(item.category || 'otro') === category);
  }
  res.json({ streams });
});

router.post('/live/start', requireAuth, (req, res) => {
  const username =
    typeof req.body?.username === 'string' && req.body.username.trim()
      ? normalize(req.body.username)
      : normalize(req.user.email ? req.user.email.split('@')[0] : req.user.uid);
  const goalCoins = Number(req.body?.goalCoins) || 0;
  const goalLabel = typeof req.body?.goalLabel === 'string' ? req.body.goalLabel.trim().slice(0, 80) : '';
  try {
    require('../lib/liveChat').clearRoom(username);
  } catch {
    // optional
  }
  // Nueva sesión: limpia invitaciones y expulsiones de la sala anterior.
  invites.clearInvites(username);
  invites.clearBans(username);
  invites.clearPendingInvites(username);
  viewerKick.clearKicks(username);
  void invites.persistClear(username);
  const entry = upsertLive({
    username,
    uid: req.user.uid,
    displayName: req.user.name || req.user.email || username,
    avatarUrl: req.user.picture || null,
    title: typeof req.body?.title === 'string' ? req.body.title.slice(0, 80) : undefined,
    isPrivate: Boolean(req.body?.isPrivate),
    category: typeof req.body?.category === 'string' ? normalize(req.body.category) : 'otro',
    goalCoins,
    goalLabel,
  });
  liveSession.startSession(username, {
    ...(goalCoins > 0 ? { goalCoins } : {}),
    ...(goalLabel ? { goalLabel } : {}),
  });
  res.status(201).json(entry);
});

router.post('/live/stop', requireAuth, async (req, res) => {
  const username =
    typeof req.body?.username === 'string' && req.body.username.trim()
      ? normalize(req.body.username)
      : normalize(req.user.email ? req.user.email.split('@')[0] : req.user.uid);
  await livePrivate.stopSession(username, { reason: 'live_stop' }).catch(() => undefined);
  removeLive(username);
  invites.clearInvites(username);
  invites.clearBans(username);
  invites.clearPendingInvites(username);
  viewerKick.clearKicks(username);
  void invites.persistClear(username);
  liveLocks.clearLock(username);
  try {
    require('../lib/liveChat').clearRoom(username);
  } catch {
    // optional
  }
  res.json({ ok: true, username });
});

router.post('/invite', requireAuth, async (req, res) => {
  const roomName =
    typeof req.body?.roomName === 'string' ? normalize(req.body.roomName) : '';
  const liveId =
    typeof req.body?.liveId === 'string' && req.body.liveId.trim()
      ? normalize(req.body.liveId)
      : roomName;
  let viewerId = typeof req.body?.viewerId === 'string' ? String(req.body.viewerId).trim() : '';
  const requestedHandle =
    typeof req.body?.guestHandle === 'string' ? String(req.body.guestHandle).trim() : '';
  const targetSlot = String(req.body?.targetSlot || invites.TARGET_SLOT_SALA_1).toUpperCase();
  if (!roomName) {
    res.status(400).json({ error: 'roomName es obligatorio' });
    return;
  }
  if (liveId && liveId !== roomName) {
    res.status(400).json({ error: 'La invitación no corresponde a este LIVE' });
    return;
  }
  if (!isRoomHost(req.user, roomName, req.body?.handle)) {
    res.status(403).json({ error: 'Solo el anfitrión puede invitar a unirse al live' });
    return;
  }
  if (!(await invites.isLiveRoomActive(roomName))) {
    res.status(409).json({ error: 'Este LIVE ya no está activo', code: 'SALA_UNAVAILABLE' });
    return;
  }
  if (targetSlot !== invites.TARGET_SLOT_SALA_1) {
    res.status(409).json({ error: 'Sala 1 no está disponible', code: 'SALA_UNAVAILABLE' });
    return;
  }
  const viewer = viewerId
    ? await invites.readActiveViewer(roomName, viewerId)
    : requestedHandle
      ? await invites.findActiveViewerByUsername(roomName, requestedHandle)
      : null;
  if (!viewer) {
    res.status(403).json({
      error: 'Solo puedes invitar a espectadores que están viendo este LIVE ahora',
      code: 'VIEWER_NOT_IN_LIVE',
    });
    return;
  }
  viewerId = viewer.uid;
  if (viewerId === req.user.uid) {
    res.status(400).json({ error: 'No puedes invitarte a ti mismo' });
    return;
  }
  const guestHandle = normalize(viewer.username || requestedHandle || viewerId);
  const guestProfile = getProfile(viewerId);
  const banKeys = [
    viewerId,
    guestHandle,
    guestProfile?.firebaseUid,
    guestProfile?.username,
    guestProfile?.email ? String(guestProfile.email).split('@')[0] : null,
  ].filter(Boolean);
  if (await invites.isBanned(roomName, banKeys)) {
    res.status(403).json({
      error: 'Este usuario fue expulsado de la sala de este live y no puede volver a entrar',
      code: 'SALA_BANNED',
    });
    return;
  }
  if (await invites.hasActiveMembership(roomName, viewerId)) {
    res.status(409).json({ error: 'Ese espectador ya está en Sala 1', code: 'ALREADY_GUEST' });
    return;
  }
  try {
    const invite = await invites.createPendingInvite({
      liveId: roomName,
      roomName,
      hostId: req.user.uid,
      viewerId,
      guestHandle,
      targetSlot: invites.TARGET_SLOT_SALA_1,
    });
    res.status(201).json({
      ok: true,
      invite: {
        inviteId: invite.inviteId,
        liveId: invite.liveId,
        roomName: invite.roomName,
        hostId: invite.hostId,
        viewerId: invite.viewerId,
        guestHandle,
        targetSlot: invite.targetSlot,
        uid: viewerId,
      },
    });
  } catch (error) {
    res.status(error.code === 'SLOT_UNAVAILABLE' ? 409 : 400).json({
      error: error.message || 'No se pudo crear la invitación',
      code: error.code || 'INVITE_FAILED',
    });
  }
});

router.post('/invite/accept', requireAuth, async (req, res) => {
  const roomName =
    typeof req.body?.roomName === 'string' ? normalize(req.body.roomName) : '';
  const liveId =
    typeof req.body?.liveId === 'string' && req.body.liveId.trim()
      ? normalize(req.body.liveId)
      : roomName;
  const inviteId = typeof req.body?.inviteId === 'string' ? String(req.body.inviteId).trim() : '';
  if (!roomName || !inviteId) {
    res.status(400).json({ error: 'roomName e inviteId son obligatorios' });
    return;
  }
  if (liveId && liveId !== roomName) {
    res.status(400).json({ error: 'La invitación no corresponde a este LIVE' });
    return;
  }
  const invite = await invites.loadPendingInvite(inviteId, roomName);
  if (!invite) {
    res.status(410).json({ error: 'La invitación ya no está vigente', code: 'INVITE_EXPIRED' });
    return;
  }
  if (invite.roomName !== roomName || invite.liveId !== roomName) {
    res.status(400).json({ error: 'La invitación no corresponde a este LIVE' });
    return;
  }
  if (invite.viewerId !== req.user.uid) {
    res.status(403).json({ error: 'Esta invitación no es para ti' });
    return;
  }
  if (!(await invites.isLiveRoomActive(roomName))) {
    res.status(409).json({ error: 'Este LIVE ya no está activo', code: 'SALA_UNAVAILABLE' });
    return;
  }
  const stillWatching = await invites.readActiveViewer(roomName, req.user.uid);
  if (!stillWatching) {
    res.status(403).json({
      error: 'Debes estar viendo este LIVE para unirte a Sala 1',
      code: 'VIEWER_NOT_IN_LIVE',
    });
    return;
  }
  if (await invites.isBanned(roomName, [req.user.uid, invite.guestHandle])) {
    res.status(403).json({
      error: 'Este usuario fue expulsado de la sala de este live y no puede volver a entrar',
      code: 'SALA_BANNED',
    });
    return;
  }
  const guestProfile = require('../lib/profileMemory').getProfile(req.user.uid);
  await invites.activateGuest(
    roomName,
    req.user.uid,
    [
      req.user.uid,
      invite.guestHandle,
      guestProfile?.username,
      guestProfile?.email ? String(guestProfile.email).split('@')[0] : null,
    ],
    { inviteId: invite.inviteId, guestHandle: invite.guestHandle },
  );
  await invites.markPendingStatus(invite, 'accepted');
  res.json({
    ok: true,
    invite: {
      inviteId: invite.inviteId,
      liveId: invite.liveId,
      roomName: invite.roomName,
      hostId: invite.hostId,
      viewerId: invite.viewerId,
      targetSlot: invite.targetSlot,
      status: 'accepted',
    },
  });
});

router.post('/invite/decline', requireAuth, async (req, res) => {
  const roomName =
    typeof req.body?.roomName === 'string' ? normalize(req.body.roomName) : '';
  const guestHandle =
    typeof req.body?.guestHandle === 'string'
      ? normalize(req.body.guestHandle)
      : normalize(req.user.email ? String(req.user.email).split('@')[0] : req.user.uid);
  const inviteId = typeof req.body?.inviteId === 'string' ? String(req.body.inviteId).trim() : '';
  if (!roomName) {
    res.status(400).json({ error: 'roomName es obligatorio' });
    return;
  }
  if (inviteId) {
    const invite = await invites.loadPendingInvite(inviteId, roomName);
    if (invite && invite.viewerId !== req.user.uid && !isRoomHost(req.user, roomName, req.body?.handle)) {
      res.status(403).json({ error: 'No puedes rechazar esta invitación' });
      return;
    }
    if (invite) await invites.markPendingStatus(invite, 'declined');
  }
  invites.removeInvite(roomName, guestHandle);
  invites.removeInvite(roomName, req.user.uid);
  void Promise.all([
    invites.persistRemove(roomName, guestHandle),
    invites.persistRemove(roomName, req.user.uid),
  ]);
  res.json({ ok: true, room: roomName });
});

router.post('/invite/leave', requireAuth, async (req, res) => {
  const roomName =
    typeof req.body?.roomName === 'string' ? normalize(req.body.roomName) : '';
  const inviteId = typeof req.body?.inviteId === 'string' ? String(req.body.inviteId).trim() : '';
  if (!roomName) {
    res.status(400).json({ error: 'roomName es obligatorio' });
    return;
  }
  const guestProfile = getProfile(req.user.uid);
  await invites.endGuestParticipation(
    roomName,
    req.user.uid,
    identitiesFromToken(req.user).concat(
      guestProfile?.username,
      guestProfile?.email ? String(guestProfile.email).split('@')[0] : null,
      req.body?.guestHandle,
    ),
    inviteId,
  );
  res.json({ ok: true, room: roomName, membership: 'LEFT' });
});

router.post('/invite/kick', requireAuth, async (req, res) => {
  const roomName =
    typeof req.body?.roomName === 'string' ? normalize(req.body.roomName) : '';
  const guestHandle =
    typeof req.body?.guestHandle === 'string' ? normalize(req.body.guestHandle) : '';
  const guestUid = typeof req.body?.guestUid === 'string' ? String(req.body.guestUid).trim() : '';
  if (!roomName || (!guestHandle && !guestUid)) {
    res.status(400).json({ error: 'roomName y guestHandle son obligatorios' });
    return;
  }
  if (!isRoomHost(req.user, roomName, req.body?.handle)) {
    res.status(403).json({ error: 'Solo el anfitrión puede sacar a un invitado' });
    return;
  }
  const guestProfile = guestUid
    ? getProfile(guestUid)
    : guestHandle
      ? findByUsername(guestHandle)
      : null;
  const targetUid = guestUid || guestProfile?.firebaseUid || '';
  const banKeys = [
    guestHandle,
    guestUid,
    guestProfile?.firebaseUid,
    guestProfile?.username,
    guestProfile?.email ? String(guestProfile.email).split('@')[0] : null,
  ].filter(Boolean);

  await invites.endGuestParticipation(roomName, targetUid, banKeys);

  for (const key of banKeys) {
    invites.addBan(roomName, key);
    invites.removeInvite(roomName, key);
  }
  await Promise.all(banKeys.map((key) => invites.persistBanAdd(roomName, key)));

  res.json({ ok: true, room: roomName, banned: invites.listBans(roomName) });
});

router.post('/viewers/kick', requireAuth, async (req, res) => {
  const roomName =
    typeof req.body?.roomName === 'string' ? normalize(req.body.roomName) : '';
  const viewerUid = String(req.body?.viewerUid || req.body?.guestUid || '').trim();
  const viewerHandle = normalize(req.body?.viewerHandle || req.body?.guestHandle || '');
  if (!roomName || (!viewerUid && !viewerHandle)) {
    res.status(400).json({ error: 'roomName y el espectador son obligatorios' });
    return;
  }
  if (!isRoomHost(req.user, roomName, req.body?.handle)) {
    res.status(403).json({ error: 'Solo el anfitrión puede expulsar espectadores' });
    return;
  }
  const viewerProfile = viewerUid
    ? getProfile(viewerUid)
    : viewerHandle
      ? findByUsername(viewerHandle)
      : null;
  const targetUid = viewerUid || viewerProfile?.firebaseUid || '';
  if (!targetUid || targetUid === req.user.uid) {
    res.status(400).json({ error: 'No puedes expulsar a este usuario' });
    return;
  }
  const kickKeys = [
    targetUid,
    viewerUid,
    viewerHandle,
    viewerProfile?.firebaseUid,
    viewerProfile?.username,
    viewerProfile?.email ? String(viewerProfile.email).split('@')[0] : null,
  ].filter(Boolean);

  for (const key of kickKeys) {
    viewerKick.addKick(roomName, key);
  }
  await Promise.all(kickKeys.map((key) => viewerKick.persistKickAdd(roomName, key)));
  await viewerKick.removeViewerPresence(roomName, targetUid);

  const lk = livekit();
  const removeLivekitParticipant = lk.removeLivekitParticipant || lk.default?.removeLivekitParticipant;
  if (typeof removeLivekitParticipant === 'function') {
    await removeLivekitParticipant(roomName, targetUid).catch(() => undefined);
  }

  res.json({ ok: true, room: roomName, kicked: targetUid });
});

/** Candado: arma el regalo (LIVE sigue público) o sella el privado. */
router.post('/lock', requireAuth, async (req, res) => {
  const roomName =
    typeof req.body?.roomName === 'string' ? normalize(req.body.roomName) : '';
  const giftId = typeof req.body?.giftId === 'string' ? req.body.giftId.trim() : '';
  const clear = Boolean(req.body?.clear);
  const seal = Boolean(req.body?.seal);
  const rawReqs = Array.isArray(req.body?.requirements) ? req.body.requirements : null;
  if (!roomName) {
    res.status(400).json({ error: 'roomName es obligatorio' });
    return;
  }
  if (!isRoomHost(req.user, roomName, req.body?.handle)) {
    res.status(403).json({ error: 'Solo quien transmite puede activar el candado' });
    return;
  }
  if (clear || (!seal && !giftId && !(rawReqs && rawReqs.length))) {
    await livePrivate.stopSession(roomName, { reason: 'host_clear' });
    if (typeof upsertLive === 'function') {
      upsertLive({ username: roomName, isPrivate: false, lockGiftId: null });
    }
    res.json({ ok: true, locked: false, isPrivate: false, lock: null });
    return;
  }

  if (seal) {
    const sealed = await livePrivate.sealSession(roomName, { hostUid: req.user.uid });
    if (!sealed.ok) {
      res.status(sealed.status || 400).json({ error: sealed.error || 'No se pudo pasar a privado' });
      return;
    }
    if (typeof upsertLive === 'function') {
      upsertLive({
        username: roomName,
        isPrivate: true,
        lockGiftId: sealed.lock?.giftId || null,
        lockGiftName: sealed.lock?.giftName,
        lockCoins: sealed.lock?.coins,
        lockEmoji: sealed.lock?.emoji,
      });
    }
    res.json({
      ok: true,
      locked: true,
      isPrivate: true,
      lock: sealed.lock,
      privateSessionId: sealed.privateSessionId,
    });
    return;
  }

  const chosenId =
    giftId ||
    (typeof rawReqs?.[0]?.giftId === 'string' ? rawReqs[0].giftId.trim() : '');
  const started = await livePrivate.startSession(roomName, {
    hostUid: req.user.uid,
    giftId: chosenId,
  });
  if (!started.ok) {
    res.status(started.status || 400).json({ error: started.error || 'No se pudo activar el candado' });
    return;
  }
  if (typeof upsertLive === 'function') {
    upsertLive({
      username: roomName,
      isPrivate: false,
      lockGiftId: started.lock?.giftId || chosenId,
      lockGiftName: started.lock?.giftName,
      lockCoins: started.lock?.coins,
      lockEmoji: started.lock?.emoji,
    });
  }
  res.json({
    ok: true,
    locked: true,
    isPrivate: false,
    lock: started.lock,
    privateSessionId: started.privateSessionId,
  });
});

router.get('/lock/:roomName', requireAuth, async (req, res) => {
  const roomName = normalize(req.params.roomName);
  const claimed = typeof req.query.handle === 'string' ? req.query.handle : undefined;
  const lock = await livePrivate.hydrateLock(roomName);
  const host = isRoomHost(req.user, roomName, claimed);
  const sealed = Boolean(lock?.sealed);
  const access = host
    ? { requestStatus: 'approved', privateSessionId: lock?.privateSessionId || null }
    : await livePrivate.readViewerAccess(roomName, req.user.uid);
  const unlocked =
    host ||
    !lock ||
    !sealed ||
    access.requestStatus === 'approved' ||
    liveLocks.isUnlocked(roomName, req.user.uid);
  if (!unlocked && sealed) {
    await syncDurablePrivateUnlock(roomName, req.user.uid);
  }
  res.json({
    locked: Boolean(lock),
    isPrivate: sealed,
    lock,
    unlocked: host || !sealed || liveLocks.isUnlocked(roomName, req.user.uid) || unlocked,
    isHost: host,
    privateSessionId: access.privateSessionId || lock?.privateSessionId || null,
    requestStatus: host ? 'approved' : access.requestStatus,
    coinsBalance: getBalance(req.user.uid),
  });
});

/** Viewer reclama acceso tras completar regalos (grant durable accessGranted). */
router.post('/claim-access', requireAuth, async (req, res) => {
  const roomName =
    typeof req.body?.roomName === 'string' ? normalize(req.body.roomName) : '';
  if (!roomName) {
    res.status(400).json({ error: 'roomName es obligatorio' });
    return;
  }
  if (isRoomHost(req.user, roomName, req.body?.handle)) {
    res.json({ ok: true, unlocked: true, host: true });
    return;
  }
  if (liveLocks.isUnlocked(roomName, req.user.uid)) {
    res.json({ ok: true, unlocked: true });
    return;
  }
  const ok = await syncDurablePrivateUnlock(roomName, req.user.uid);
  if (!ok) {
    res.status(403).json({ error: 'Aún no completaste los regalos del candado' });
    return;
  }
  res.json({ ok: true, unlocked: true });
});

/** Viewer reserva el regalo de acceso (HOLD). No acredita al host ni desbloquea. */
router.post('/unlock', requireAuth, async (req, res) => {
  const roomName =
    typeof req.body?.roomName === 'string' ? normalize(req.body.roomName) : '';
  if (!roomName) {
    res.status(400).json({ error: 'roomName es obligatorio' });
    return;
  }
  if (isRoomHost(req.user, roomName, req.body?.handle)) {
    res.json({ ok: true, unlocked: true, host: true, requestStatus: 'approved' });
    return;
  }
  await livePrivate.hydrateLock(roomName);
  const lock = liveLocks.getLock(roomName);
  if (!lock) {
    res.json({ ok: true, unlocked: true, locked: false, requestStatus: 'approved' });
    return;
  }
  const giftId =
    (typeof req.body?.giftId === 'string' && req.body.giftId.trim()) || lock.giftId;
  const requested = await livePrivate.requestAccess(roomName, {
    viewerUid: req.user.uid,
    viewerName: req.user.name || req.user.email || 'Liveboomer',
    viewerUsername: req.body?.username,
    viewerAvatarUrl: req.user.picture || null,
    giftId,
    clientId: typeof req.body?.clientId === 'string' ? req.body.clientId : '',
    currentBalance: req.body?.currentBalance,
  });
  if (!requested.ok) {
    res.status(requested.status || 400).json({
      error: requested.error,
      requiredCoins: requested.requiredCoins,
      balance: requested.balance,
      lock,
    });
    return;
  }
  res.json({
    ok: true,
    unlocked: Boolean(requested.unlocked),
    pending: Boolean(requested.pending),
    duplicate: Boolean(requested.duplicate),
    requestStatus: requested.requestStatus,
    senderBalance: requested.senderBalance,
    lock,
  });
});

/** Host acepta: captura el HOLD y otorga acceso. */
router.post('/grant-access', requireAuth, async (req, res) => {
  const roomName =
    typeof req.body?.roomName === 'string' ? normalize(req.body.roomName) : '';
  const viewerUid =
    typeof req.body?.viewerUid === 'string' ? String(req.body.viewerUid).trim() : '';
  if (!roomName || !viewerUid) {
    res.status(400).json({ error: 'roomName y viewerUid son obligatorios' });
    return;
  }
  if (!isRoomHost(req.user, roomName, req.body?.handle)) {
    res.status(403).json({ error: 'Solo el anfitrión puede aceptar solicitudes' });
    return;
  }
  const result = await livePrivate.approveRequest(roomName, {
    actorUid: req.user.uid,
    viewerUid,
  });
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json({ ok: true, unlocked: true, viewerUid, duplicate: Boolean(result.duplicate) });
});

router.post('/reject-access', requireAuth, async (req, res) => {
  const roomName =
    typeof req.body?.roomName === 'string' ? normalize(req.body.roomName) : '';
  const viewerUid =
    typeof req.body?.viewerUid === 'string' ? String(req.body.viewerUid).trim() : '';
  if (!roomName || !viewerUid) {
    res.status(400).json({ error: 'roomName y viewerUid son obligatorios' });
    return;
  }
  if (!isRoomHost(req.user, roomName, req.body?.handle)) {
    res.status(403).json({ error: 'Solo el anfitrión puede rechazar solicitudes' });
    return;
  }
  const result = await livePrivate.rejectRequest(roomName, {
    actorUid: req.user.uid,
    viewerUid,
  });
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json({
    ok: true,
    requestStatus: 'rejected',
    viewerUid,
    duplicate: Boolean(result.duplicate),
  });
});

router.get('/reels', (_req, res) => {
  res.json({ reels: reelStore.listSharedReels() });
});

router.get('/reels/:username', (req, res) => {
  const username = normalize(req.params.username);
  const sharedOnly = req.query.mine !== '1';
  res.json({ reels: reelStore.listReels(username, { sharedOnly }) });
});

router.post('/reels', requireAuth, (req, res) => {
  try {
    const username =
      typeof req.body?.username === 'string' ? normalize(req.body.username) : '';
    const dataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl : '';
    const title = typeof req.body?.title === 'string' ? req.body.title : 'Momento del live';
    const shared = Boolean(req.body?.shared);
    if (!username || !dataUrl.startsWith('data:video/')) {
      res.status(400).json({ error: 'username y dataUrl (video) son obligatorios' });
      return;
    }
    if (!isRoomHost(req.user, username)) {
      res.status(403).json({ error: 'Solo el anfitrión puede guardar reels de su live' });
      return;
    }
    const reel = reelStore.addReel({ username, dataUrl, title, shared });
    res.status(201).json({ reel });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar el reel' });
  }
});

router.patch('/reels/:reelId/share', requireAuth, (req, res) => {
  const username =
    typeof req.body?.username === 'string' ? normalize(req.body.username) : '';
  const shared = Boolean(req.body?.shared);
  if (!username) {
    res.status(400).json({ error: 'username es obligatorio' });
    return;
  }
  if (!isRoomHost(req.user, username)) {
    res.status(403).json({ error: 'No autorizado' });
    return;
  }
  const reel = reelStore.setReelShared(username, req.params.reelId, shared);
  if (!reel) {
    res.status(404).json({ error: 'Reel no encontrado' });
    return;
  }
  res.json({ reel });
});

/**
 * Token exclusivo para participante técnico de Screen Share nativo Android.
 * Misma sala LiveKit; identity distinta (screen:<uid>) para no desconectar al host.
 */
router.post('/screen-token/:roomName', requireAuth, async (req, res) => {
  const lk = livekit();
  const livekitEnabled = lk.livekitEnabled || lk.default?.livekitEnabled;
  const createLivekitToken = lk.createLivekitToken || lk.default?.createLivekitToken;
  const screenShareIdentityFor =
    lk.screenShareIdentityFor || lk.default?.screenShareIdentityFor;

  if (typeof livekitEnabled !== 'function' || !livekitEnabled()) {
    const payload =
      typeof lk.livekitConfigError === 'function'
        ? lk.livekitConfigError()
        : { error: 'LiveKit no está configurado en el API' };
    res.status(503).json(payload);
    return;
  }

  const roomName = normalize(req.params.roomName).slice(0, 64);
  if (!roomName) {
    res.status(400).json({ error: 'roomName es obligatorio' });
    return;
  }

  try {
    const claimedHandle =
      typeof req.body?.handle === 'string' ? req.body.handle : req.query.handle;
    const host = isRoomHost(req.user, roomName, claimedHandle);
    if (!host) {
      res.status(403).json({ error: 'Solo el host puede publicar Screen Share' });
      return;
    }

    const ownerUid = String(req.user.uid);
    const sessionId =
      typeof req.body?.sessionId === 'string'
        ? String(req.body.sessionId).trim().slice(0, 96)
        : '';
    const identity =
      typeof screenShareIdentityFor === 'function'
        ? screenShareIdentityFor(ownerUid, sessionId || undefined)
        : sessionId
          ? `screen:${ownerUid}:${sessionId}`
          : `screen:${ownerUid}`;
    const metadata = JSON.stringify({
      role: 'screen_share',
      ownerUid,
      roomName,
      sessionId: sessionId || null,
    });
    const token = await createLivekitToken({
      identity,
      name: 'Screen Share',
      room: roomName,
      canPublish: true,
      metadata,
    });

    res.json({
      token,
      serverUrl: process.env.LIVEKIT_URL,
      roomName,
      identity,
      ownerUid,
      sessionId: sessionId || null,
      role: 'screen_share',
    });
  } catch (error) {
    console.error('[stream/screen-token]', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo generar token de Screen Share',
    });
  }
});

router.get('/token/:roomName', requireAuth, async (req, res) => {
  const lk = livekit();
  const livekitEnabled = lk.livekitEnabled || lk.default?.livekitEnabled;
  const createLivekitToken = lk.createLivekitToken || lk.default?.createLivekitToken;

  if (typeof livekitEnabled !== 'function' || !livekitEnabled()) {
    const payload = typeof lk.livekitConfigError === 'function'
      ? lk.livekitConfigError()
      : { error: 'LiveKit no está configurado en el API' };
    res.status(503).json(payload);
    return;
  }

  const roomName = normalize(req.params.roomName).slice(0, 64);
  if (!roomName) {
    res.status(400).json({ error: 'roomName es obligatorio' });
    return;
  }

  try {
    const claimedHandle =
      typeof req.query.handle === 'string' ? req.query.handle : req.body?.handle;
    const host = isRoomHost(req.user, roomName, claimedHandle);
    const guest = await canGuestPublishAsync(req.user, roomName);
    const isDirectCall = /^dm[_-]/.test(roomName);

    if (!host && !isDirectCall && (await viewerKick.isKicked(roomName, identitiesFromToken(req.user)))) {
      res.status(403).json({
        error: 'Fuiste expulsado de este LIVE',
        code: 'VIEWER_KICKED',
      });
      return;
    }

    if (isDirectCall) {
      const { bearerFromReq, canCallUser, isActiveCall, loadChatCall, otherUidFromChatId } = require('../lib/canCallUser');
      const idToken = bearerFromReq(req);
      const chatId = roomName.replace(/^dm[_-]/, '');
      const otherUid = otherUidFromChatId(chatId, req.user.uid);
      if (!otherUid) {
        res.status(403).json({ error: 'No perteneces a esta llamada', code: 'CALL_NOT_ALLOWED', stage: 'token' });
        return;
      }
      const call = await loadChatCall(chatId, idToken);
      const joiningActive = isActiveCall(call, null, req.user.uid);
      if (!joiningActive) {
        const allowed = await canCallUser(req.user.uid, otherUid, idToken);
        if (!allowed) {
          res.status(403).json({
            error: 'Solo puedes llamar a tus amigos.',
            code: 'CALL_NOT_ALLOWED',
            stage: 'friendship',
          });
          return;
        }
      }
    }

    await livePrivate.hydrateLock(roomName);
    const sealedLock = liveLocks.getLock(roomName);
    const sealed = Boolean(sealedLock?.sealed);
    if (!host && !isDirectCall && sealed && !liveLocks.canEnterLockedLive(roomName, req.user.uid, false)) {
      const granted = await syncDurablePrivateUnlock(roomName, req.user.uid);
      if (granted) {
        /* grant durable: sigue a emitir token */
      }
    }
    if (!host && !isDirectCall && sealed && !liveLocks.canEnterLockedLive(roomName, req.user.uid, false)) {
      const lock = liveLocks.getLock(roomName);
      res.status(402).json({
        error: 'Live con candado',
        code: 'LIVE_LOCKED',
        lock,
        message: `Envía ${lock?.emoji || '🎁'} ${lock?.giftName || 'el regalo'} (${lock?.coins || 0} coins) para entrar`,
      });
      return;
    }

    const canPublish = host || guest || isDirectCall;
    const displayName = req.user.name || req.user.email || req.user.uid.slice(0, 8);
    const token = await createLivekitToken({
      identity: req.user.uid,
      name: displayName,
      room: roomName,
      canPublish,
    });

    if (host && !isDirectCall) {
      upsertLive({
        username: roomName,
        uid: req.user.uid,
        displayName,
        avatarUrl: req.user.picture || null,
      });
    }

    const owner = findByUsername(roomName);
    const hostUid = owner?.firebaseUid || (host ? uid : null);

    res.json({
      token,
      serverUrl: process.env.LIVEKIT_URL,
      roomName,
      hostUid,
      canPublish,
      isHost: host,
      isGuest: guest && !host,
      lock: liveLocks.getLock(roomName),
    });
  } catch (error) {
    console.error('[stream/token]', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo generar el token de LiveKit',
    });
  }
});

router.get('/chat/:roomName', requireAuth, (req, res) => {
  const roomName = normalize(req.params.roomName);
  const liveChat = require('../lib/liveChat');
  res.json({ messages: liveChat.listMessages(roomName, { limit: 300 }) });
});

router.post('/chat/:roomName', requireAuth, (req, res) => {
  const roomName = normalize(req.params.roomName);
  const liveChat = require('../lib/liveChat');
  const message = liveChat.appendMessage(roomName, {
    id: req.body?.id,
    author: req.body?.author,
    text: req.body?.text,
    gift: req.body?.gift || null,
    sourceLang: req.body?.sourceLang || null,
  });
  res.status(201).json({ message });
});

router.get('/history', optionalAuth, (req, res) => {
  const username =
    typeof req.query.username === 'string' ? normalize(req.query.username) : null;
  res.json({ lives: liveHistory.listHistory({ username, limit: 16 }) });
});

router.get('/session/:roomName', requireAuth, (req, res) => {
  const roomName = normalize(req.params.roomName);
  res.json({ session: liveSession.getSession(roomName) });
});

router.get('/friends-live', requireAuth, async (req, res) => {
  const lk = livekit();
  const listActiveLiveRooms = lk.listActiveLiveRooms || lk.default?.listActiveLiveRooms;
  const memory = typeof listLives === 'function' ? listLives() : [];
  const fromLivekit = typeof listActiveLiveRooms === 'function' ? await listActiveLiveRooms() : [];
  const active = new Map();
  for (const item of [...memory, ...fromLivekit]) {
    if (item?.username) active.set(item.username, item);
  }
  const me = getProfile(req.user.uid) || findByUsername(req.user.email?.split('@')[0]);
  const myHandle = me?.username;
  const friends = myHandle ? social.listFriends(myHandle) : [];
  const friendUsernames = new Set(friends.map((f) => f.username));
  const online = [];
  for (const [username, stream] of active.entries()) {
    if (friendUsernames.has(username)) {
      online.push(stream);
    }
  }
  res.json({ streams: online });
});

router.get('/friends-history', requireAuth, (req, res) => {
  const me = getProfile(req.user.uid) || findByUsername(req.user.email?.split('@')[0]);
  const friends = me?.username ? social.listFriends(me.username) : [];
  const friendSet = new Set(friends.map((f) => f.username));
  const lives = liveHistory
    .listHistory({ limit: 40 })
    .filter((item) => friendSet.has(item.username))
    .slice(0, 12);
  res.json({ lives });
});

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    req.viewerUid = null;
    next();
    return;
  }
  const verifyMod = require('../lib/verifyFirebaseToken');
  const verifyFirebaseIdToken =
    typeof verifyMod === 'function' ? verifyMod : verifyMod.verifyFirebaseIdToken || verifyMod.default;
  verifyFirebaseIdToken(match[1])
    .then((decoded) => {
      req.viewerUid = decoded.uid;
      req.user = decoded;
      next();
    })
    .catch(() => {
      req.viewerUid = null;
      next();
    });
}

module.exports = router;
module.exports.default = router;
