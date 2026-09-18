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

router.post('/send', requireAuth, requireDbUser, async (req, res) => {
  const giftId = req.body?.giftId;
  const roomName = typeof req.body?.roomName === 'string' ? req.body.roomName.trim() : '';
  const gift = findGift(giftId);
  const rawMult = Math.floor(Number(req.body?.multiplier) || 1);
  const multiplier = [1, 2, 4, 8].includes(rawMult) ? rawMult : 1;
  const totalCoins = gift ? gift.coins * multiplier : 0;

  if (!gift || !roomName) {
    res.status(400).json({ error: 'giftId y roomName son obligatorios' });
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
    const recipientUid = await resolveRecipientUid(roomName, senderUid);
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
