const { randomUUID } = require('crypto');
const express = require('express');
const { asFn } = require('../lib/asFn');
const { prisma, hasDatabase } = require('../lib/prisma');
const { findGift } = require('../lib/gifts');
const { emitGiftReceived } = require('../lib/socket');
const { getBalance, debit, credit } = require('../lib/walletMemory');
const { findByUsername } = require('../lib/profileMemory');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const requireDbUser = asFn(require('../middleware/requireDbUser'));

router.post('/send', requireAuth, requireDbUser, async (req, res) => {
  const giftId = req.body?.giftId;
  const roomName = typeof req.body?.roomName === 'string' ? req.body.roomName.trim() : '';
  const gift = findGift(giftId);

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
    id: randomUUID(),
    roomName,
    giftId: gift.id,
    giftName: gift.name,
    emoji: gift.emoji,
    coins: gift.coins,
    senderName,
  };

  try {
    if (!hasDatabase || !prisma) {
      const next = debit(senderUid, gift.coins);
      if (next == null) {
        res.status(402).json({ error: 'Saldo insuficiente' });
        return;
      }
      const host = findByUsername(roomName);
      if (host?.firebaseUid && host.firebaseUid !== senderUid) {
        credit(host.firebaseUid, gift.coins);
      }
      emitGiftReceived(roomName, payload);
      res.json({
        ok: true,
        gift: payload,
        senderBalance: next,
        creatorBalance: host ? getBalance(host.firebaseUid) : 0,
      });
      return;
    }

    const creator = await prisma.user.findFirst({ where: { username: roomName } });
    if (!creator) {
      // Sin creador en DB: igual descuenta y deja que LiveKit propague el regalo
      const next = debit(senderUid, gift.coins);
      if (next == null) {
        res.status(402).json({ error: 'Saldo insuficiente' });
        return;
      }
      emitGiftReceived(roomName, payload);
      res.json({ ok: true, gift: payload, senderBalance: next, creatorBalance: 0 });
      return;
    }
    if (creator.firebaseUid === senderUid || creator.id === req.dbUser.id) {
      res.status(400).json({ error: 'No puedes enviarte un regalo a ti mismo' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
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
    });

    emitGiftReceived(roomName, payload);

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
    console.error('[gifts/send]', error);
    res.status(500).json({ error: 'No se pudo enviar el regalo' });
  }
});

module.exports = router;
module.exports.default = router;
