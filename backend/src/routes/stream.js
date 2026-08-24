const express = require('express');
const { asFn } = require('../lib/asFn');
const presence = require('../lib/livePresence');
const invites = require('../lib/liveInvites');
const liveLocks = require('../lib/liveLocks');
const reelStore = require('../lib/reelStore');
const liveHistory = require('../lib/liveHistory');
const social = require('../lib/socialMemory');
const { getProfile, findByUsername } = require('../lib/profileMemory');
const { findGift } = require('../lib/gifts');
const { debit, credit, getBalance } = require('../lib/walletMemory');

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

function identitiesFromToken(decoded) {
  const emailHandle = decoded.email ? String(decoded.email).split('@')[0] : '';
  const named = decoded.name || emailHandle || decoded.uid;
  const base =
    normalize(named).replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 20) || 'user';
  return [
    decoded.uid,
    emailHandle,
    normalize(emailHandle),
    `${base}_${String(decoded.uid).slice(0, 8)}`,
    base,
    named,
  ]
    .map((item) => normalize(item))
    .filter(Boolean);
}

function isRoomHost(decoded, roomName) {
  const room = normalize(roomName);
  return identitiesFromToken(decoded).some(
    (identity) => identity === room || identity.startsWith(room) || room.startsWith(identity),
  );
}

function canGuestPublish(decoded, roomName) {
  return invites.hasInvite(roomName, identitiesFromToken(decoded));
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
    });
  }
  const includePrivate = req.query.includePrivate === '1';
  const category =
    typeof req.query.category === 'string' ? normalize(req.query.category) : '';
  let streams = Array.from(byName.values()).filter((item) => includePrivate || !item.isPrivate);
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
  const entry = upsertLive({
    username,
    uid: req.user.uid,
    displayName: req.user.name || req.user.email || username,
    avatarUrl: req.user.picture || null,
    title: typeof req.body?.title === 'string' ? req.body.title.slice(0, 80) : undefined,
    isPrivate: Boolean(req.body?.isPrivate),
    category: typeof req.body?.category === 'string' ? normalize(req.body.category) : 'otro',
  });
  res.status(201).json(entry);
});

router.post('/live/stop', requireAuth, (req, res) => {
  const username =
    typeof req.body?.username === 'string' && req.body.username.trim()
      ? normalize(req.body.username)
      : normalize(req.user.email ? req.user.email.split('@')[0] : req.user.uid);
  removeLive(username);
  invites.clearInvites(username);
  liveLocks.clearLock(username);
  try {
    require('../lib/liveChat').clearRoom(username);
  } catch {
    // optional
  }
  res.json({ ok: true, username });
});

router.post('/invite', requireAuth, (req, res) => {
  const roomName =
    typeof req.body?.roomName === 'string' ? normalize(req.body.roomName) : '';
  const guestHandle =
    typeof req.body?.guestHandle === 'string' ? normalize(req.body.guestHandle) : '';
  if (!roomName || !guestHandle) {
    res.status(400).json({ error: 'roomName y guestHandle son obligatorios' });
    return;
  }
  if (!isRoomHost(req.user, roomName)) {
    res.status(403).json({ error: 'Solo el anfitrión puede invitar a unirse al live' });
    return;
  }
  const guestProfile = findByUsername(guestHandle);
  invites.addInvite(roomName, guestHandle);
  if (guestProfile?.firebaseUid) invites.addInvite(roomName, guestProfile.firebaseUid);
  if (guestProfile?.username) invites.addInvite(roomName, guestProfile.username);
  if (guestProfile?.email) {
    invites.addInvite(roomName, String(guestProfile.email).split('@')[0]);
  }
  res.status(201).json({
    ok: true,
    invite: { room: roomName, guest: guestHandle, uid: guestProfile?.firebaseUid || null },
    pending: invites.listInvites(roomName),
  });
});

/** Candado en vivo: el host elige el regalo que desbloquea la entrada. */
router.post('/lock', requireAuth, (req, res) => {
  const roomName =
    typeof req.body?.roomName === 'string' ? normalize(req.body.roomName) : '';
  const giftId = typeof req.body?.giftId === 'string' ? req.body.giftId.trim() : '';
  const clear = Boolean(req.body?.clear);
  if (!roomName) {
    res.status(400).json({ error: 'roomName es obligatorio' });
    return;
  }
  if (!isRoomHost(req.user, roomName)) {
    res.status(403).json({ error: 'Solo quien transmite puede activar el candado' });
    return;
  }
  if (clear || !giftId) {
    liveLocks.clearLock(roomName);
    if (typeof upsertLive === 'function') {
      upsertLive({ username: roomName, lockGiftId: null });
    }
    res.json({ ok: true, locked: false });
    return;
  }
  const gift = findGift(giftId);
  if (!gift) {
    res.status(400).json({ error: 'Regalo de candado inválido' });
    return;
  }
  const lock = liveLocks.setLock(roomName, {
    giftId: gift.id,
    giftName: gift.name,
    coins: gift.coins,
    emoji: gift.emoji,
  });
  if (typeof upsertLive === 'function') {
    upsertLive({
      username: roomName,
      lockGiftId: gift.id,
      lockGiftName: gift.name,
      lockCoins: gift.coins,
      lockEmoji: gift.emoji,
    });
  }
  res.json({ ok: true, locked: true, lock });
});

router.get('/lock/:roomName', requireAuth, (req, res) => {
  const roomName = normalize(req.params.roomName);
  const lock = liveLocks.getLock(roomName);
  const host = isRoomHost(req.user, roomName);
  res.json({
    locked: Boolean(lock),
    lock,
    unlocked: host || liveLocks.isUnlocked(roomName, req.user.uid),
    isHost: host,
  });
});

/** Espectador envía el regalo del candado para poder entrar. */
router.post('/unlock', requireAuth, async (req, res) => {
  const roomName =
    typeof req.body?.roomName === 'string' ? normalize(req.body.roomName) : '';
  if (!roomName) {
    res.status(400).json({ error: 'roomName es obligatorio' });
    return;
  }
  if (isRoomHost(req.user, roomName)) {
    res.json({ ok: true, unlocked: true, host: true });
    return;
  }
  const lock = liveLocks.getLock(roomName);
  if (!lock) {
    res.json({ ok: true, unlocked: true, locked: false });
    return;
  }
  if (liveLocks.isUnlocked(roomName, req.user.uid)) {
    res.json({ ok: true, unlocked: true, lock });
    return;
  }
  const gift = findGift(lock.giftId);
  if (!gift) {
    res.status(400).json({ error: 'Regalo de candado no disponible' });
    return;
  }
  const next = debit(req.user.uid, gift.coins);
  if (next == null) {
    res.status(402).json({
      error: 'Saldo insuficiente',
      requiredCoins: gift.coins,
      balance: getBalance(req.user.uid),
      lock,
    });
    return;
  }
  const host = findByUsername(roomName);
  if (host?.firebaseUid && host.firebaseUid !== req.user.uid) {
    credit(host.firebaseUid, gift.coins);
  }
  liveLocks.markUnlocked(roomName, req.user.uid);
  res.json({
    ok: true,
    unlocked: true,
    lock,
    senderBalance: next,
    gift: { id: gift.id, name: gift.name, emoji: gift.emoji, coins: gift.coins },
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

router.get('/token/:roomName', requireAuth, async (req, res) => {
  const lk = livekit();
  const livekitEnabled = lk.livekitEnabled || lk.default?.livekitEnabled;
  const createLivekitToken = lk.createLivekitToken || lk.default?.createLivekitToken;

  if (typeof livekitEnabled !== 'function' || !livekitEnabled()) {
    res.status(503).json({ error: 'LiveKit no está configurado en el API' });
    return;
  }

  const roomName = String(req.params.roomName || '')
    .trim()
    .slice(0, 64);
  if (!roomName) {
    res.status(400).json({ error: 'roomName es obligatorio' });
    return;
  }

  try {
    const host = isRoomHost(req.user, roomName);
    const guest = canGuestPublish(req.user, roomName);
    const isDirectCall = /^dm[_-]/.test(roomName);

    if (!host && !isDirectCall && !liveLocks.canEnterLockedLive(roomName, req.user.uid, false)) {
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

    if (host) {
      upsertLive({
        username: normalize(roomName),
        uid: req.user.uid,
        displayName,
        avatarUrl: req.user.picture || null,
      });
    }

    res.json({
      token,
      serverUrl: process.env.LIVEKIT_URL,
      roomName,
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
  });
  res.status(201).json({ message });
});

router.get('/history', optionalAuth, (req, res) => {
  const username =
    typeof req.query.username === 'string' ? normalize(req.query.username) : null;
  res.json({ lives: liveHistory.listHistory({ username, limit: 16 }) });
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
