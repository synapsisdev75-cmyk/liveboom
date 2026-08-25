const { randomUUID } = require('crypto');
const express = require('express');
const { asFn } = require('../lib/asFn');
const { prisma, hasDatabase } = require('../lib/prisma');
const { findGift } = require('../lib/gifts');
const { emitGiftReceived } = require('../lib/socket');
const { getBalance, setBalance, debit, credit } = require('../lib/walletMemory');
const { findByUsername } = require('../lib/profileMemory');
const liveChat = require('../lib/liveChat');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const requireDbUser = asFn(require('../middleware/requireDbUser'));

/** Alinea el wallet en memoria con el saldo que ya ve el usuario (tras recargas). */
function syncSenderFloor(senderUid, floorFromClient = 0) {
  const floor = Math.max(
    getBalance(senderUid),
    Math.max(0, Math.floor(Number(floorFromClient) || 0)),
  );
  if (floor > getBalance(senderUid)) {
    setBalance(senderUid, floor);
  }
  return getBalance(senderUid);
}

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
    liveChat.appendMessage(roomName, {
      id: `gift-${payload.id}`,
      author: payload.senderName,
      text: `envió ${payload.giftName}`,
      gift: { giftId: payload.giftId, emoji: payload.emoji, name: payload.giftName },
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

function memorySend(senderUid, roomName, gift, payload, floorFromClient = 0) {
  syncSenderFloor(senderUid, floorFromClient);
  const next = debit(senderUid, gift.coins);
  if (next == null) return { error: 'Saldo insuficiente' };
  const host = findByUsername(roomName);
  if (host?.firebaseUid && host.firebaseUid !== senderUid) {
    credit(host.firebaseUid, gift.coins);
  }
  announceGift(roomName, payload);
  return {
    senderBalance: next,
    creatorBalance: host ? getBalance(host.firebaseUid) : 0,
  };
}

router.post('/send', requireAuth, requireDbUser, async (req, res) => {
  const giftId = req.body?.giftId;
  const roomName = typeof req.body?.roomName === 'string' ? req.body.roomName.trim() : '';
  const gift = findGift(giftId);

  if (!gift || !roomName) {
    res.status(400).json({ error: 'giftId y roomName son obligatorios' });
    return;
  }

  const senderUid = req.user.uid;
  const floorFromClient = Math.max(0, Math.floor(Number(req.body?.currentBalance) || 0));
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
    coins: gift.coins,
    senderName,
    senderUid,
  };

  try {
    if (!hasDatabase || !prisma) {
      const sent = memorySend(senderUid, roomName, gift, payload, floorFromClient);
      if (sent.error) {
        res.status(402).json({ error: sent.error });
        return;
      }
      res.json({ ok: true, gift: payload, ...sent });
      return;
    }

    let creator = null;
    try {
      creator = await withTimeout(
        prisma.user.findFirst({ where: { username: roomName } }),
        4000,
      );
    } catch (error) {
      console.warn('[gifts/send] prisma lookup timeout', error.message);
    }

    if (!creator) {
      const sent = memorySend(senderUid, roomName, gift, payload, floorFromClient);
      if (sent.error) {
        res.status(402).json({ error: sent.error });
        return;
      }
      res.json({ ok: true, gift: payload, ...sent });
      return;
    }
    if (creator.firebaseUid === senderUid || creator.id === req.dbUser.id) {
      res.status(400).json({ error: 'No puedes enviarte un regalo a ti mismo' });
      return;
    }

    // Sincroniza Prisma con el saldo visible tras recargas (evita 402 falsos).
    syncSenderFloor(senderUid, floorFromClient);
    if (floorFromClient > Number(req.dbUser.coinsBalance || 0)) {
      try {
        await prisma.user.update({
          where: { id: req.dbUser.id },
          data: { coinsBalance: floorFromClient },
        });
        req.dbUser.coinsBalance = floorFromClient;
      } catch (error) {
        console.warn('[gifts/send] sync prisma floor', error.message);
      }
    }

    const result = await withTimeout(
      prisma.$transaction(async (tx) => {
        const deducted = await tx.user.updateMany({
          where: { id: req.dbUser.id, coinsBalance: { gte: gift.coins } },
          data: { coinsBalance: { decrement: gift.coins } },
        });
        if (deducted.count !== 1) {
          const error = new Error('INSUFFICIENT_COINS');
          error.code = 'INSUFFICIENT_COINS';
          throw error;
        }

        const creatorUpdated = await tx.user.update({
          where: { id: creator.id },
          data: { coinsBalance: { increment: gift.coins } },
        });

        await tx.transaction.create({
          data: {
            userId: req.dbUser.id,
            amount: -gift.coins,
            amountInCop: 0,
            type: 'gift_send',
            status: 'completed',
            packageId: gift.id,
            reference: `gift_${randomUUID()}`,
            currency: 'COINS',
          },
        });

        await tx.transaction.create({
          data: {
            userId: creator.id,
            amount: gift.coins,
            amountInCop: 0,
            type: 'gift_receive',
            status: 'completed',
            packageId: gift.id,
            reference: `giftin_${randomUUID()}`,
            currency: 'COINS',
          },
        });

        const sender = await tx.user.findUnique({ where: { id: req.dbUser.id } });
        return { sender, creator: creatorUpdated };
      }),
      6000,
    );

    // Mantén wallet en memoria alineada con Prisma.
    if (result.sender?.coinsBalance != null) {
      setBalance(senderUid, result.sender.coinsBalance);
    }
    if (creator.firebaseUid && result.creator?.coinsBalance != null) {
      setBalance(creator.firebaseUid, result.creator.coinsBalance);
    }

    announceGift(roomName, payload);
    res.json({
      ok: true,
      gift: payload,
      senderBalance: result.sender.coinsBalance,
      creatorBalance: result.creator.coinsBalance,
    });
  } catch (error) {
    if (error.code === 'INSUFFICIENT_COINS' || error.message === 'INSUFFICIENT_COINS') {
      res.status(402).json({ error: 'Saldo insuficiente' });
      return;
    }
    if (error.code === 'TIMEOUT') {
      const sent = memorySend(senderUid, roomName, gift, payload, floorFromClient);
      if (sent.error) {
        res.status(402).json({ error: sent.error });
        return;
      }
      res.json({ ok: true, gift: payload, ...sent });
      return;
    }
    console.error('[gifts/send]', error);
    res.status(500).json({ error: 'No se pudo enviar el regalo' });
  }
});

module.exports = router;
module.exports.default = router;
