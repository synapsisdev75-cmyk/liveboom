const { randomUUID } = require('crypto');
const express = require('express');
const { asFn } = require('../lib/asFn');
const { prisma, hasDatabase } = require('../lib/prisma');
const { findGift } = require('../lib/gifts');
const { emitGiftReceived } = require('../lib/socket');
const { findByUsername } = require('../lib/profileMemory');
const liveChat = require('../lib/liveChat');
const wallet = require('../lib/walletService');
const { firestoreConfigured, getAdminDb } = require('../lib/firestoreAdmin');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const requireDbUser = asFn(require('../middleware/requireDbUser'));
const requireSuperAdmin = asFn(require('../middleware/requireSuperAdmin'));

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('TIMEOUT');
      error.code = 'TIMEOUT';
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function announceGift(roomName, payload) {
  emitGiftReceived(roomName, payload);
  try {
    const mult = Math.max(1, Math.floor(Number(payload.multiplier) || 1));
    liveChat.appendMessage(roomName, {
      id: `gift-${payload.id}`,
      author: payload.senderName,
      text: mult > 1 ? `envió ${payload.giftName} x${mult}` : `envió ${payload.giftName}`,
      gift: { giftId: payload.giftId, emoji: payload.emoji, name: payload.giftName, multiplier: mult },
    });
  } catch {
    // chat opcional
  }
  try {
    require('../lib/liveSession').addGift(roomName, {
      uid: payload.senderUid,
      name: payload.senderName,
      coins: payload.coins,
    });
  } catch {
    // session opcional
  }
}

async function resolveRecipientUid(roomName, senderUid) {
  const host = findByUsername(roomName);
  if (host?.firebaseUid && host.firebaseUid !== senderUid) return host.firebaseUid;
  if (hasDatabase && prisma) {
    try {
      const creator = await withTimeout(
        prisma.user.findFirst({ where: { username: roomName } }),
        4000,
      );
      if (creator?.firebaseUid && creator.firebaseUid !== senderUid) {
        return creator.firebaseUid;
      }
    } catch (error) {
      console.warn('[gifts/send] prisma lookup', error.message);
    }
  }
  if (firestoreConfigured()) {
    try {
      const db = getAdminDb();
      const q = await db.collection('users').where('username', '==', String(roomName)).limit(1).get();
      if (!q.empty) {
        const id = q.docs[0].id;
        if (id && id !== senderUid) return id;
      }
      const roomId = String(roomName || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_');
      if (roomId) {
        const roomSnap = await db.collection('liveRooms').doc(roomId).get();
        const hostUid = roomSnap.exists ? String(roomSnap.data()?.hostUid || '') : '';
        if (hostUid && hostUid !== senderUid) return hostUid;
      }
    } catch (error) {
      console.warn('[gifts/send] firestore lookup', error.message);
    }
  }
  return null;
}

function earningTypeFromBody(body) {
  const source = String(body?.source || body?.context || '').toLowerCase();
  if (source === 'live' || source === 'live_gift') return 'EARNING_LIVE';
  if (source === 'private' || source === 'live_private') return 'EARNING_PRIVATE';
  if (source === 'call') return 'EARNING_CALL';
  if (source === 'video_call' || source === 'video') return 'EARNING_VIDEO_CALL';
  if (source === 'subscription') return 'EARNING_SUBSCRIPTION';
  return 'EARNING_GIFT';
}

function lookupRoomName(roomName) {
  const raw = String(roomName || '').trim();
  if (/^chat:/i.test(raw)) return raw.slice(5).trim();
  return raw;
}

function giftAlphaHttpStatus(code) {
  if (
    code === 'INVALID_PATH' ||
    code === 'TOO_LARGE' ||
    code === 'INVALID_GIFT' ||
    code === 'UNSUPPORTED' ||
    code === 'CONFIRM' ||
    code === 'LAST_GIFT' ||
    code === 'AUDIO'
  ) {
    return 400;
  }
  if (code === 'BUSY') return 409;
  if (code === 'NOT_FOUND') return 404;
  return 500;
}

router.get('/convert-alpha/limits', requireAuth, requireSuperAdmin, (_req, res) => {
  const { LIMITS } = require('../lib/giftAlphaConvert');
  res.json({
    ok: true,
    maxBytes: LIMITS.maxBytes,
    maxMovBytes: LIMITS.maxMovBytes,
    maxDurationSec: LIMITS.maxDurationSec,
    maxEdge: LIMITS.maxEdge,
  });
});

router.post('/convert-alpha/jobs', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { enqueueGiftAlphaJob, kickGiftAlphaJob } = require('../lib/giftAlphaConvert');
    const job = await enqueueGiftAlphaJob({
      storagePath: typeof req.body?.storagePath === 'string' ? req.body.storagePath : '',
      giftId: typeof req.body?.giftId === 'string' ? req.body.giftId : '',
      createdByUid: req.user?.uid || '',
      keepAudio: req.body?.keepAudio !== false,
      fileName: typeof req.body?.fileName === 'string' ? req.body.fileName : '',
      clientNonce: typeof req.body?.clientNonce === 'string' ? req.body.clientNonce : '',
    });
    res.json({ ok: true, job });
    kickGiftAlphaJob(job.jobId);
  } catch (error) {
    const code = error && error.code ? String(error.code) : '';
    console.error('[gifts/convert-alpha/jobs]', error);
    res.status(giftAlphaHttpStatus(code)).json({
      error: error instanceof Error ? error.message : 'No se pudo iniciar la conversión del MOV',
    });
  }
});

router.get('/convert-alpha/jobs/:jobId', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { readJob, publicJob } = require('../lib/giftAlphaConvert');
    const job = publicJob(await readJob(req.params.jobId));
    if (!job) {
      res.status(404).json({ error: 'Trabajo no encontrado' });
      return;
    }
    res.json({ ok: true, job });
  } catch (error) {
    console.error('[gifts/convert-alpha/jobs/:id]', error);
    res.status(500).json({ error: 'No se pudo leer el estado de conversión' });
  }
});

router.get('/convert-alpha/gifts/:giftId', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { readJob, publicJob, safeGiftId } = require('../lib/giftAlphaConvert');
    const { getAdminDb } = require('../lib/firestoreAdmin');
    const giftId = safeGiftId(req.params.giftId);
    if (!giftId) {
      res.status(400).json({ error: 'Regalo inválido' });
      return;
    }
    const ptr = await getAdminDb().collection('gift_alpha_gifts').doc(giftId).get();
    const latestJobId = ptr.exists ? String(ptr.data()?.latestJobId || '') : '';
    const job = latestJobId ? publicJob(await readJob(latestJobId)) : null;
    res.json({ ok: true, job });
  } catch (error) {
    console.error('[gifts/convert-alpha/gifts/:id]', error);
    res.status(500).json({ error: 'No se pudo leer la conversión del regalo' });
  }
});

router.post('/convert-alpha/jobs/:jobId/retry', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { retryGiftAlphaJob, kickGiftAlphaJob } = require('../lib/giftAlphaConvert');
    const job = await retryGiftAlphaJob(req.params.jobId);
    res.json({ ok: true, job });
    kickGiftAlphaJob(job.jobId);
  } catch (error) {
    const code = error && error.code ? String(error.code) : '';
    res.status(giftAlphaHttpStatus(code)).json({
      error: error instanceof Error ? error.message : 'No se pudo reintentar la conversión',
    });
  }
});

router.post('/media/inspect', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { inspectStorageMedia } = require('../lib/giftBgRemove');
    const media = await inspectStorageMedia(
      typeof req.body?.storagePath === 'string' ? req.body.storagePath : '',
    );
    res.json({ ok: true, media });
  } catch (error) {
    const code = error && error.code ? String(error.code) : '';
    res.status(giftAlphaHttpStatus(code)).json({
      error: error instanceof Error ? error.message : 'No se pudo inspeccionar el video',
    });
  }
});

router.post('/bg-remove/jobs', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { enqueueGiftBgJob, kickGiftBgJob } = require('../lib/giftBgRemove');
    const job = await enqueueGiftBgJob({
      storagePath: typeof req.body?.storagePath === 'string' ? req.body.storagePath : '',
      giftId: typeof req.body?.giftId === 'string' ? req.body.giftId : '',
      createdByUid: req.user?.uid || '',
      fileName: typeof req.body?.fileName === 'string' ? req.body.fileName : '',
      clientNonce: typeof req.body?.clientNonce === 'string' ? req.body.clientNonce : '',
      mode: req.body?.mode === 'adjust' ? 'adjust' : 'auto',
      similarity: req.body?.similarity,
      blend: req.body?.blend,
    });
    res.json({ ok: true, job });
    kickGiftBgJob(job.jobId);
  } catch (error) {
    const code = error && error.code ? String(error.code) : '';
    console.error('[gifts/bg-remove/jobs]', error);
    res.status(giftAlphaHttpStatus(code)).json({
      error: error instanceof Error ? error.message : 'No se pudo iniciar quitar fondo',
    });
  }
});

router.get('/bg-remove/jobs/:jobId', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { readJob, publicJob } = require('../lib/giftBgRemove');
    const job = publicJob(await readJob(req.params.jobId));
    if (!job) {
      res.status(404).json({ error: 'Trabajo no encontrado' });
      return;
    }
    res.json({ ok: true, job });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo leer el estado de quitar fondo' });
  }
});

router.post('/bg-remove/jobs/:jobId/retry', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { retryGiftBgJob, kickGiftBgJob } = require('../lib/giftBgRemove');
    const job = await retryGiftBgJob(req.params.jobId);
    res.json({ ok: true, job });
    kickGiftBgJob(job.jobId);
  } catch (error) {
    const code = error && error.code ? String(error.code) : '';
    res.status(giftAlphaHttpStatus(code)).json({
      error: error instanceof Error ? error.message : 'No se pudo reintentar quitar fondo',
    });
  }
});

router.post('/catalog/:giftId/delete', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { deleteGiftPermanently } = require('../lib/giftCatalogDelete');
    const result = await deleteGiftPermanently({
      giftId: req.params.giftId,
      adminUserId: req.user?.uid || '',
      adminEmail: req.user?.email || '',
    });
    res.json(result);
  } catch (error) {
    const code = error && error.code ? String(error.code) : '';
    console.error('[gifts/catalog/delete]', error);
    res.status(giftAlphaHttpStatus(code)).json({
      error: error instanceof Error ? error.message : 'No se pudo eliminar el regalo',
    });
  }
});

router.post('/convert-alpha', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { enqueueGiftAlphaJob, kickGiftAlphaJob } = require('../lib/giftAlphaConvert');
    const job = await enqueueGiftAlphaJob({
      storagePath: typeof req.body?.storagePath === 'string' ? req.body.storagePath : '',
      giftId: typeof req.body?.giftId === 'string' ? req.body.giftId : '',
      createdByUid: req.user?.uid || '',
      keepAudio: req.body?.keepAudio !== false,
      fileName: typeof req.body?.fileName === 'string' ? req.body.fileName : '',
      clientNonce: typeof req.body?.clientNonce === 'string' ? req.body.clientNonce : '',
    });
    res.json({ ok: true, jobId: job.jobId, job });
    kickGiftAlphaJob(job.jobId);
  } catch (error) {
    const code = error && error.code ? String(error.code) : '';
    console.error('[gifts/convert-alpha]', error);
    res.status(giftAlphaHttpStatus(code)).json({
      error: error instanceof Error ? error.message : 'No se pudo convertir el MOV 4444',
    });
  }
});

router.post('/send', requireAuth, requireDbUser, async (req, res) => {
  const giftId = req.body?.giftId;
  const roomName = lookupRoomName(
    typeof req.body?.roomName === 'string' ? req.body.roomName.trim() : '',
  );
  const { isGiftDeleted } = require('../lib/giftCatalogDelete');
  if (await isGiftDeleted(giftId)) {
    res.status(400).json({ error: 'Regalo no válido' });
    return;
  }
  const gift = findGift(giftId);
  const rawMult = Math.floor(Number(req.body?.multiplier) || 1);
  const multiplier = [1, 2, 4, 8].includes(rawMult) ? rawMult : 1;
  const totalCoins = gift ? gift.coins * multiplier : 0;
  const requestedRecipient =
    typeof req.body?.recipientUid === 'string' ? req.body.recipientUid.trim() : '';

  if (!gift || !roomName) {
    res.status(400).json({
      error: !gift ? 'Regalo no válido' : 'giftId y roomName son obligatorios',
    });
    return;
  }

  const senderUid = req.user.uid;
  const senderName =
    req.dbUser?.displayName ||
    req.dbUser?.username ||
    req.user.name ||
    req.user.email?.split('@')[0] ||
    'Liveboomer';

  const payload = {
    id: typeof req.body?.clientId === 'string' && req.body.clientId ? req.body.clientId : randomUUID(),
    roomName,
    giftId: gift.id,
    giftName: gift.name,
    emoji: gift.emoji,
    coins: totalCoins,
    multiplier,
    senderName,
    senderUid,
  };

  try {
    if (requestedRecipient && requestedRecipient === senderUid) {
      res.status(400).json({ error: 'No puedes enviarte un regalo a ti mismo' });
      return;
    }
    const recipientUid =
      requestedRecipient && requestedRecipient !== senderUid
        ? requestedRecipient
        : await resolveRecipientUid(roomName, senderUid);
    if (recipientUid === senderUid) {
      res.status(400).json({ error: 'No puedes enviarte un regalo a ti mismo' });
      return;
    }

    const result = await wallet.transferGift({
      senderUid,
      recipientUid,
      amount: totalCoins,
      idempotencyKey: `GIFT:${payload.id}`,
      earningType: earningTypeFromBody(req.body),
      referenceType: 'gift',
      referenceId: payload.id,
      metadata: {
        giftId: gift.id,
        giftName: gift.name,
        coins: gift.coins,
        blast: totalCoins,
        emoji: gift.emoji,
        roomName,
        multiplier,
        clientId: payload.id,
      },
    });

    if (!result?.ok) {
      if (result?.code === 'SELF_GIFT') {
        res.status(400).json({ error: 'No puedes enviarte un regalo a ti mismo' });
        return;
      }
      res.status(402).json({ error: 'Saldo insuficiente' });
      return;
    }

    const postId =
      typeof req.body?.postId === 'string' ? req.body.postId.trim() : '';
    const isPostGift = earningTypeFromBody(req.body) === 'EARNING_GIFT' && Boolean(postId);
    if (isPostGift && recipientUid && !result.duplicate) {
      try {
        const { recordPostReceivedGift } = require('../lib/postReceivedGifts');
        await recordPostReceivedGift({
          postId,
          recipientUid,
          senderUid,
          senderName,
          senderUsername: req.dbUser?.username || '',
          giftId: gift.id,
          giftName: gift.name,
          units: multiplier,
          clientId: payload.id,
        });
      } catch (error) {
        console.warn('[gifts/send] post history', error.message);
      }
    }

    announceGift(roomName, payload);
    res.json({
      ok: true,
      gift: payload,
      senderBalance: result.senderSummary?.coinsBalance ?? 0,
      creatorBalance: result.recipientSummary?.coinsBalance ?? 0,
      purchasedBlastBalance: result.senderSummary?.purchasedBalance,
      earnedBlastBalance: result.senderSummary?.earnedAvailable,
      duplicate: Boolean(result.duplicate),
    });
  } catch (error) {
    console.error('[gifts/send]', error);
    res.status(500).json({ error: 'No se pudo enviar el regalo' });
  }
});

module.exports = router;
module.exports.default = router;
