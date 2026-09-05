const express = require('express');
const { asFn } = require('../lib/asFn');
const {
  bearerFromReq,
  canCallUser,
  chatIdFor,
  callRoomName,
} = require('../lib/canCallUser');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const livekit = () => require('../lib/livekit');

router.post('/start', requireAuth, async (req, res) => {
  const lk = livekit();
  if (typeof lk.livekitEnabled !== 'function' || !lk.livekitEnabled()) {
    res.status(503).json(lk.livekitConfigError());
    return;
  }

  const me = req.user.uid;
  const targetUid = String(req.body?.targetUid || '').trim();
  const type = req.body?.type === 'video' ? 'video' : 'audio';
  if (!targetUid || targetUid === me) {
    res.status(400).json({ error: 'Destino inválido', code: 'CALL_BAD_TARGET', stage: 'start' });
    return;
  }

  const idToken = bearerFromReq(req);
  let allowed = false;
  try {
    allowed = await canCallUser(me, targetUid, idToken);
  } catch (error) {
    console.error('[LiveKit ERROR]', {
      callId: null,
      roomName: null,
      stage: 'friendship',
      errorCode: error.status || 500,
    });
    res.status(500).json({
      error: 'No se pudo validar la amistad',
      code: 'CALL_FRIENDSHIP_CHECK_FAILED',
      stage: 'friendship',
    });
    return;
  }

  if (!allowed) {
    res.status(403).json({
      error: 'Solo puedes llamar a tus amigos.',
      code: 'CALL_NOT_ALLOWED',
      stage: 'friendship',
    });
    return;
  }

  const chatId = chatIdFor(me, targetUid);
  const roomName = callRoomName(chatId);
  const callId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const displayName = req.user.name || req.user.uid.slice(0, 8);

  try {
    console.info('[LiveKit] requesting token', { callId, roomName, stage: 'start' });
    const token = await lk.createLivekitToken({
      identity: me,
      name: displayName,
      room: roomName,
      canPublish: true,
    });
    console.info('[LiveKit] token received', { callId, roomName, stage: 'start' });
    res.json({
      serverUrl: String(process.env.LIVEKIT_URL || '').trim(),
      token,
      roomName,
      callId,
      chatId,
      type,
    });
  } catch (error) {
    console.error('[LiveKit ERROR]', {
      callId,
      roomName,
      stage: 'token',
      errorCode: 'TOKEN_ISSUE',
    });
    res.status(500).json({
      error: 'No se pudo generar el token de LiveKit',
      code: 'LIVEKIT_TOKEN_FAILED',
      stage: 'token',
    });
  }
});

module.exports = router;
module.exports.default = router;
