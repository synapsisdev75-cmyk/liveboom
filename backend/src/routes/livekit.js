const express = require('express');
const { asFn } = require('../lib/asFn');
const {
  bearerFromReq,
  canCallUser,
  callRoomName,
  loadChatCall,
  otherUidFromChatId,
} = require('../lib/canCallUser');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const livekit = () => require('../lib/livekit');

router.get('/status', requireAuth, (_req, res) => {
  const lk = livekit();
  const missing = typeof lk.livekitMissing === 'function' ? lk.livekitMissing() : [];
  res.json({
    configured: missing.length === 0,
    missing,
  });
});

router.post('/token', requireAuth, async (req, res) => {
  const lk = livekit();
  const livekitEnabled = lk.livekitEnabled || lk.default?.livekitEnabled;
  const createLivekitToken = lk.createLivekitToken || lk.default?.createLivekitToken;

  if (typeof livekitEnabled !== 'function' || !livekitEnabled()) {
    res.status(503).json(lk.livekitConfigError ? lk.livekitConfigError() : { error: 'LiveKit no está configurado en el API' });
    return;
  }

  const callId = typeof req.body?.callId === 'string' ? req.body.callId.trim() : '';
  const chatId = typeof req.body?.chatId === 'string' ? req.body.chatId.trim() : '';
  const identity = req.user.uid;
  const name = req.user.name || req.user.email || identity.slice(0, 8);

  if (callId) {
    if (!chatId) {
      res.status(400).json({ error: 'chatId es obligatorio', code: 'CALL_BAD_TARGET', stage: 'token' });
      return;
    }
    const idToken = bearerFromReq(req);
    const otherUid = otherUidFromChatId(chatId, identity);
    if (!otherUid) {
      res.status(403).json({ error: 'No perteneces a esta llamada', code: 'CALL_NOT_ALLOWED', stage: 'token' });
      return;
    }

    try {
      const allowed = await canCallUser(identity, otherUid, idToken);
      if (!allowed) {
        res.status(403).json({
          error: 'Solo puedes llamar a tus amigos.',
          code: 'CALL_NOT_ALLOWED',
          stage: 'friendship',
        });
        return;
      }
      const call = await loadChatCall(chatId, idToken);
      if (call && call.id && call.id !== callId) {
        res.status(409).json({
          error: 'La llamada ya no está activa',
          code: 'CALL_STALE',
          stage: 'token',
        });
        return;
      }
      const members = [call?.fromUid, call?.toUid, call?.callerId, call?.receiverId].filter(Boolean);
      if (call && members.length > 0 && !members.includes(identity)) {
        res.status(403).json({ error: 'No perteneces a esta llamada', code: 'CALL_NOT_ALLOWED', stage: 'token' });
        return;
      }
    } catch (error) {
      console.error('[LiveKit ERROR]', {
        callId,
        roomName: callRoomName(chatId),
        stage: 'token',
        errorCode: error.status || 500,
      });
      res.status(500).json({
        error: 'No se pudo validar la llamada',
        code: 'CALL_LOOKUP_FAILED',
        stage: 'token',
      });
      return;
    }

    const roomName = callRoomName(chatId);
    try {
      console.info('[LiveKit] requesting token', { callId, roomName, stage: 'join' });
      const token = await createLivekitToken({
        identity,
        name,
        room: roomName,
        canPublish: true,
      });
      console.info('[LiveKit] token received', { callId, roomName, stage: 'join' });
      res.json({
        serverUrl: String(process.env.LIVEKIT_URL || '').trim(),
        token,
        roomName,
        callId,
      });
    } catch (error) {
      console.error('[LiveKit ERROR]', { callId, roomName, stage: 'token', errorCode: 'TOKEN_ISSUE' });
      res.status(500).json({ error: 'No se pudo crear el token de LiveKit', code: 'LIVEKIT_TOKEN_FAILED', stage: 'token' });
    }
    return;
  }

  const role = req.body?.role === 'host' ? 'host' : 'viewer';
  const room =
    typeof req.body?.room === 'string' && req.body.room.trim()
      ? req.body.room.trim().slice(0, 64)
      : `liveboom-${req.user.uid}`;

  try {
    const token = await createLivekitToken({
      identity,
      name,
      room,
      canPublish: role === 'host',
    });
    res.json({
      url: process.env.LIVEKIT_URL,
      serverUrl: process.env.LIVEKIT_URL,
      token,
      room,
      roomName: room,
      role,
    });
  } catch (error) {
    console.error('[livekit/token]', error);
    res.status(500).json({ error: 'No se pudo crear el token de LiveKit' });
  }
});

module.exports = router;
module.exports.default = router;
