const express = require('express');
const { asFn } = require('../lib/asFn');
const { emitGiftReceived } = require('../lib/socket');
const liveChat = require('../lib/liveChat');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));

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

router.post('/send', requireAuth, async (req, res) => {
  try {
    const senderName =
      req.user.name ||
      req.user.email?.split('@')[0] ||
      'Liveboomer';
    const { sendGiftTransaction } = require('../lib/giftTransactions');
    const result = await sendGiftTransaction({
      senderUid: req.user.uid,
      senderName,
      giftId: req.body?.giftId,
      multiplier: req.body?.multiplier,
      clientId: req.body?.clientId,
      recipientUid: req.body?.recipientUid,
      recipientUsername: req.body?.recipientUsername,
      postId: req.body?.postId,
      roomName: req.body?.roomName,
    });

    if (result.context.roomName && !result.duplicate) {
      announceGift(result.context.roomName, {
        ...result.gift,
        id: result.gift.clientId,
        roomName: result.context.roomName,
      });
    }

    res.json({
      ok: true,
      duplicate: result.duplicate,
      gift: result.gift,
      source: result.context.source,
      senderBalance: result.senderBalances.coinsBalance,
      purchasedBlastBalance: result.senderBalances.purchasedBlastBalance,
      earnedBlastBalance: result.senderBalances.earnedBlastBalance,
      creatorBalance: result.recipientBalances.coinsBalance,
      creatorEarnedBlastBalance: result.recipientBalances.earnedBlastBalance,
    });
  } catch (error) {
    console.error('[gifts/send]', error);
    res.status(Number(error?.status) || 500).json({
      error: error instanceof Error ? error.message : 'No se pudo enviar el regalo',
      code: error?.code,
    });
  }
});

module.exports = router;
module.exports.default = router;
