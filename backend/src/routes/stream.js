const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { livekitEnabled, createLivekitToken } = require('../lib/livekit');

const router = express.Router();

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

router.get('/token/:roomName', requireAuth, async (req, res) => {
  if (!livekitEnabled()) {
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
