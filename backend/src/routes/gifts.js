const { randomUUID } = require('crypto');
const express = require('express');
const auth = require('../middleware/auth');
const { prisma } = require('../lib/prisma');
const { findGift } = require('../lib/gifts');
const { emitGiftReceived } = require('../lib/socket');

const router = express.Router();
const requireAuth = auth.requireAuth || auth.default?.requireAuth;
const requireDbUser = auth.requireDbUser || auth.default?.requireDbUser;

router.post('/send', requireAuth, requireDbUser, async (req, res) => {
  const giftId = req.body?.giftId;
  const roomName = typeof req.body?.roomName === 'string' ? req.body.roomName.trim() : '';
  const gift = findGift(giftId);

  if (!gift || !roomName) {
    res.status(400).json({ error: 'giftId y roomName son obligatorios' });
    return;
  }

  try {
    const creator = await prisma.user.findFirst({ where: { username: roomName } });
    if (!creator) {
      res.status(404).json({ error: 'No existe el creador de esta sala' });
      return;
    }
    if (creator.id === req.dbUser.id) {
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

    const payload = {
      id: randomUUID(),
      roomName,
      giftId: gift.id,
      giftName: gift.name,
      emoji: gift.emoji,
      coins: gift.coins,
      senderName: req.dbUser.username,
    };
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
