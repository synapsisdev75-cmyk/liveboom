const express = require('express');
const { asFn } = require('../lib/asFn');
const {
  bearerFromReq,
  canCallUser,
  chatIdFor,
  callRoomName,
  firestoreGet,
  unwrapFields,
} = require('../lib/canCallUser');
const { validateCallGiftId } = require('../lib/callPricing');
const { claimUsersBusy, releaseCallById } = require('../lib/callBusy');

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
  const authorizationId = String(req.body?.authorizationId || '').trim();
  const giftId = String(req.body?.giftId || '').trim();
  if (!targetUid || targetUid === me) {
    res.status(400).json({ error: 'Destino inválido', code: 'CALL_BAD_TARGET', stage: 'start' });
    return;
  }

  if (giftId) {
    try {
      if (!String(giftId).startsWith('platform_')) {
        validateCallGiftId(giftId);
      }
    } catch (error) {
      res.status(400).json({
        error: error.message || 'Tarifa de llamada inválida',
        code: error.code || 'CALL_RATE_NOT_ALLOWED',
        stage: 'rate',
      });
      return;
    }
  }

  const idToken = bearerFromReq(req);
  const chatId = chatIdFor(me, targetUid);
  let allowed = false;
  try {
    allowed = await canCallUser(me, targetUid, idToken);
    if (!allowed && authorizationId) {
      let data = null;
      const authz = await firestoreGet(
        `users/${targetUid}/callAuthorizations/${authorizationId}`,
        idToken,
      );
      if (authz) data = unwrapFields(authz.fields);
      if (!data) {
        const chat = await firestoreGet(`chats/${chatId}`, idToken);
        const chatData = chat ? unwrapFields(chat.fields) : {};
        const fromChat = chatData.callAuthorization;
        if (fromChat && typeof fromChat === 'object' && String(fromChat.id || '') === authorizationId) {
          data = fromChat;
        }
      }
      if (data) {
        const expiresAtMs = Number(data.expiresAtMs) || 0;
        const callType = data.callType === 'video' ? 'video' : 'audio';
        allowed =
          String(data.callerId) === me &&
          callType === type &&
          (!expiresAtMs || expiresAtMs > Date.now());
      }
    }
  } catch (error) {
    console.error('[LiveKit ERROR]', {
      callId: null,
      roomName: null,
      stage: 'friendship',
      errorCode: error.status || 500,
    });
    res.status(500).json({
      error: 'No se pudo validar el permiso de llamada',
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

  const requestedId = String(req.body?.callId || '').trim();
  const callId = /^[a-zA-Z0-9_-]{6,80}$/.test(requestedId)
    ? requestedId
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const roomName = callRoomName(chatId, callId);
  const displayName = req.user.name || req.user.uid.slice(0, 8);
  const liveKitUrl = typeof lk.publicLiveKitUrl === 'function' ? lk.publicLiveKitUrl() : String(process.env.LIVEKIT_URL || '').trim();

  console.info('[CALL CREATE]', {
    callId,
    callerId: me,
    receiverId: targetUid,
    type,
  });

  let claimed = { ok: true };
  try {
    claimed = await claimUsersBusy({
      callerId: me,
      receiverId: targetUid,
      callId,
      chatId,
    });
  } catch (error) {
    console.error('[callBusy] claim failed', error?.message || error);
    res.status(500).json({
      error: 'No se pudo comprobar la disponibilidad.',
      code: 'CALL_BUSY_CHECK_FAILED',
      stage: 'busy',
    });
    return;
  }

  if (!claimed?.ok) {
    if (claimed.code === 'USER_ALREADY_IN_CALL') {
      res.status(409).json({
        error: 'Ya tienes una llamada en curso.',
        code: 'USER_ALREADY_IN_CALL',
        stage: 'busy',
      });
      return;
    }
    res.status(409).json({
      error: 'Esta persona está ocupada en otra llamada.',
      code: 'USER_BUSY',
      stage: 'busy',
    });
    return;
  }

  try {
    console.info('[CallConnect] tokenGenerated', {
      callId,
      roomName,
      callerId: me,
      receiverId: targetUid,
      identity: me,
      tokenGenerated: false,
      liveKitUrlPresent: Boolean(liveKitUrl),
      callStatus: 'start',
    });
    const token = await lk.createLivekitToken({
      identity: me,
      name: displayName,
      room: roomName,
      canPublish: true,
      ensureRoom: false,
    });
    console.info('[CallConnect] tokenGenerated', {
      callId,
      roomName,
      callerId: me,
      receiverId: targetUid,
      identity: me,
      tokenGenerated: true,
      liveKitUrlPresent: Boolean(liveKitUrl),
      callStatus: 'start',
    });
    console.info('[TOKEN]', { roomName, identity: me, tokenGenerated: true });
    res.json({
      serverUrl: liveKitUrl,
      token,
      roomName,
      callId,
      chatId,
      type,
    });
  } catch (error) {
    await releaseCallById(me, callId).catch(() => undefined);
    console.error('[ERROR]', {
      name: error?.name || 'Error',
      message: error?.message || String(error || ''),
      status: error?.status || 500,
      callId,
      roomName,
      stage: 'token',
    });
    res.status(500).json({
      error: 'No se pudo iniciar la llamada. Intenta de nuevo.',
      code: 'LIVEKIT_TOKEN_FAILED',
      stage: 'token',
    });
  }
});

router.post('/release', requireAuth, async (req, res) => {
  const callId = String(req.body?.callId || '').trim();
  if (!callId) {
    res.status(400).json({ error: 'callId requerido', code: 'CALL_BAD_TARGET', stage: 'busy' });
    return;
  }
  try {
    await releaseCallById(req.user.uid, callId);
    res.json({ ok: true });
  } catch (error) {
    console.error('[callBusy] release failed', error?.message || error);
    res.json({ ok: true });
  }
});

const billing = () => require('../lib/callBillingService');

router.get('/billing/quote', requireAuth, async (req, res) => {
  try {
    const callType = String(req.query?.callType || req.query?.type || 'voice');
    const quality = req.query?.quality || null;
    const normalized = billing().normalizeCallType(callType, quality);
    const quote = await billing().checkBalance(req.user.uid, normalized);
    res.json({
      ...quote,
      callType: normalized,
      pricingLabel: billing().pricingLabel(normalized),
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || 'No se pudo consultar la tarifa',
      code: error.code || 'CALL_BILLING_QUOTE_FAILED',
    });
  }
});

router.post('/billing/start', requireAuth, async (req, res) => {
  try {
    const me = req.user.uid;
    const callId = String(req.body?.callId || '').trim();
    const chatId = String(req.body?.chatId || '').trim();
    const receiverId = String(req.body?.receiverId || '').trim();
    const callerId = String(req.body?.callerId || me).trim();
    const video = Boolean(req.body?.video);
    const callType = String(req.body?.callType || (video ? 'video_720' : 'voice'));
    const quality = req.body?.quality || null;

    if (callerId !== me) {
      res.status(403).json({ error: 'Solo el caller puede iniciar el cobro', code: 'CALL_BILLING_FORBIDDEN' });
      return;
    }

    const quote = await billing().checkBalance(me, billing().normalizeCallType(callType, quality));
    if (!quote.enoughToStart) {
      res.status(402).json({
        error: 'Saldo insuficiente. Necesitas Blast para iniciar esta llamada.',
        code: 'CALL_INSUFFICIENT_BLAST',
        ...quote,
      });
      return;
    }

    const session = await billing().startBilling({
      callId,
      chatId,
      callerId: me,
      receiverId,
      callType,
      quality,
      video,
    });
    res.json(session);
  } catch (error) {
    const status = error.code === 'CALL_BILLING_FORBIDDEN' ? 403 : 400;
    res.status(status).json({
      error: error.message || 'No se pudo iniciar el cobro',
      code: error.code || 'CALL_BILLING_START_FAILED',
    });
  }
});

router.post('/billing/sync', requireAuth, async (req, res) => {
  try {
    const me = req.user.uid;
    const callId = String(req.body?.callId || '').trim();
    // connectedSeconds es pista; el backend recalcula con connectedAtMs.
    const connectedSeconds = Math.max(0, Math.floor(Number(req.body?.connectedSeconds) || 0));
    const result = await billing().updateBilling({
      callId,
      callerId: me,
      connectedSeconds,
    });
    res.json(result);
  } catch (error) {
    const status =
      error.code === 'CALL_BILLING_FORBIDDEN'
        ? 403
        : error.code === 'CALL_BILLING_NOT_STARTED'
          ? 404
          : 400;
    res.status(status).json({
      error: error.message || 'No se pudo sincronizar el cobro',
      code: error.code || 'CALL_BILLING_SYNC_FAILED',
    });
  }
});

router.post('/billing/stop', requireAuth, async (req, res) => {
  try {
    const me = req.user.uid;
    const callId = String(req.body?.callId || '').trim();
    const connectedSeconds = Math.max(0, Math.floor(Number(req.body?.connectedSeconds) || 0));
    const result = await billing().stopBilling({
      callId,
      callerId: me,
      connectedSeconds,
    });
    res.json(result);
  } catch (error) {
    const status = error.code === 'CALL_BILLING_FORBIDDEN' ? 403 : 400;
    res.status(status).json({
      error: error.message || 'No se pudo finalizar el cobro',
      code: error.code || 'CALL_BILLING_STOP_FAILED',
    });
  }
});

module.exports = router;
module.exports.default = router;
