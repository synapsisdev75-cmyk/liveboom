const express = require('express');
const { asFn } = require('../lib/asFn');
const presence = require('../lib/livePresence');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const livekit = () => require('../lib/livekit');

const upsertLive = presence.upsertLive || presence.default?.upsertLive;
const removeLive = presence.removeLive || presence.default?.removeLive;
const listLives = presence.listLives || presence.default?.listLives;

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

router.get('/live', async (_req, res) => {
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
    });
  }
  res.json({ streams: Array.from(byName.values()) });
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
  });
  res.status(201).json(entry);
});

router.post('/live/stop', requireAuth, (req, res) => {
  const username =
    typeof req.body?.username === 'string' && req.body.username.trim()
      ? normalize(req.body.username)
      : normalize(req.user.email ? req.user.email.split('@')[0] : req.user.uid);
  removeLive(username);
  res.json({ ok: true, username });
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
    const canPublish = isRoomHost(req.user, roomName);
    const displayName = req.user.name || req.user.email || req.user.uid.slice(0, 8);
    const token = await createLivekitToken({
      identity: req.user.uid,
      name: displayName,
      room: roomName,
      canPublish,
    });

    if (canPublish) {
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
    });
  } catch (error) {
    console.error('[stream/token]', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo generar el token de LiveKit',
    });
  }
});

module.exports = router;
module.exports.default = router;
