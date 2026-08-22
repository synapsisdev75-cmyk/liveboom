const express = require('express');
const auth = require('../middleware/auth');
const livekit = require('../lib/livekit');

const router = express.Router();
const requireAuth = auth.requireAuth || auth.default?.requireAuth;
const livekitEnabled = livekit.livekitEnabled || livekit.default?.livekitEnabled;
const createLivekitToken = livekit.createLivekitToken || livekit.default?.createLivekitToken;

router.post('/token', requireAuth, async (req, res) => {
  if (!livekitEnabled()) {
    res.status(503).json({ error: 'LiveKit no está configurado' });
    return;
  }

  const role = req.body?.role === 'host' ? 'host' : 'viewer';
  const room =
    typeof req.body?.room === 'string' && req.body.room.trim()
      ? req.body.room.trim().slice(0, 64)
      : `liveboom-${req.user.uid}`;
  const identity = req.user.uid;
  const name = req.user.name || req.user.email || identity.slice(0, 8);

  try {
    const token = await createLivekitToken({
      identity,
      name,
      room,
      canPublish: role === 'host',
    });
    res.json({
      url: process.env.LIVEKIT_URL,
      token,
      room,
      role,
    });
  } catch (error) {
    console.error('[livekit/token]', error);
    res.status(500).json({ error: 'No se pudo crear el token de LiveKit' });
  }
});

module.exports = router;
