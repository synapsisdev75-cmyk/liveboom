const { randomUUID } = require('crypto');
const express = require('express');
const { asFn } = require('../lib/asFn');
const { findGift } = require('../lib/gifts');
const { emitGiftReceived } = require('../lib/socket');
const {
  getBalances,
  debitSplit,
  creditEarned,
  setBalances,
} = require('../lib/walletMemory');
const { findByUsername } = require('../lib/profileMemory');
const liveChat = require('../lib/liveChat');
const {
  firestoreConfigured,
  transferGiftBlast,
  resolveUidByUsername,
} = require('../lib/firestoreAdmin');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const requireDbUser = asFn(require('../middleware/requireDbUser'));

function announceGift(roomName, payload) {
  if (!roomName || String(roomName).startsWith('chat:')) return;
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

async function resolveRecipientUid(roomName, explicitUid) {
  const hinted = String(explicitUid || '').trim();
  if (hinted) return hinted;
  const key = String(roomName || '')
    .trim()
    .replace(/^@/, '')
    .replace(/^chat:/, '');
  if (!key) return null;
  const mem = findByUsername(key);
  if (mem?.firebaseUid) return mem.firebaseUid;
  if (!firestoreConfigured()) return null;
  try {
    return await resolveUidByUsername(key);
  } catch {
    return null;
  }
}

function memorySend(senderUid, recipientUid, totalCoins) {
  if (!recipientUid) return { error: 'No encontramos al creador de este contenido' };
  if (recipientUid === senderUid) return { error: 'No puedes enviarte un regalo a ti mismo' };
  const spent = debitSplit(senderUid, totalCoins, true);
  if (!spent.ok) return { error: 'Saldo insuficiente' };
  const recipient = creditEarned(recipientUid, totalCoins);
  return {
    sender: spent.balances,
    recipient,
  };
}

router.post('/send', requireAuth, requireDbUser, async (req, res) => {
  const giftId = req.body?.giftId;
  const roomName = typeof req.body?.roomName === 'string' ? req.body.roomName.trim() : '';
  const gift = findGift(giftId);
  const rawMult = Math.floor(Number(req.body?.multiplier) || 1);
  const multiplier = [1, 2, 4, 8].includes(rawMult) ? rawMult : 1;
  const totalCoins = gift ? gift.coins * multiplier : 0;
  const contentType =
    typeof req.body?.contentType === 'string' ? req.body.contentType.trim().slice(0, 32) : '';
  const source =
    typeof req.body?.source === 'string' ? req.body.source.trim().slice(0, 32) : '';

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
    contentType: contentType || null,
    source: source || (roomName.startsWith('chat:') ? 'chat' : 'gift'),
  };

  try {
    const recipientUid = await resolveRecipientUid(roomName, req.body?.recipientUid);
    if (!recipientUid) {
      res.status(404).json({ error: 'No encontramos al creador de este contenido' });
      return;
    }
    if (recipientUid === senderUid) {
      res.status(400).json({ error: 'No puedes enviarte un regalo a ti mismo' });
      return;
    }

    let creditedFirestore = false;
    let senderBal = getBalances(senderUid);
    let recipientBal = getBalances(recipientUid);

    if (firestoreConfigured()) {
      try {
        const transferred = await transferGiftBlast({
          senderUid,
          recipientUid,
          coins: totalCoins,
          clientId: payload.id,
          senderName,
          giftId: gift.id,
          giftName: gift.name,
          emoji: gift.emoji,
          multiplier,
          postId: req.body?.postId || null,
          roomName,
          source: payload.source,
          contentType: contentType || null,
        });
        if (transferred?.ok === false && transferred.error === 'INSUFFICIENT') {
          res.status(402).json({ error: 'Saldo insuficiente' });
          return;
        }
        if (transferred?.ok && transferred.sender) {
          creditedFirestore = true;
          senderBal = transferred.sender;
          recipientBal = transferred.recipient || recipientBal;
          setBalances(senderUid, senderBal);
          if (transferred.recipient) setBalances(recipientUid, transferred.recipient);
        }
      } catch (error) {
        console.warn('[gifts/send] firestore transfer fallback', error.message);
      }
    }

    if (!creditedFirestore) {
      const sent = memorySend(senderUid, recipientUid, totalCoins);
      if (sent.error) {
        res.status(402).json({ error: sent.error });
        return;
      }
      senderBal = sent.sender;
      recipientBal = sent.recipient;
    }

    announceGift(roomName, payload);
    res.json({
      ok: true,
      gift: payload,
      creditedFirestore,
      senderBalance: senderBal.coinsBalance,
      purchasedBlastBalance: senderBal.purchasedBlastBalance,
      earnedBlastBalance: senderBal.earnedBlastBalance,
      creatorBalance: recipientBal.coinsBalance,
      creatorEarnedBlastBalance: recipientBal.earnedBlastBalance,
    });
  } catch (error) {
    console.error('[gifts/send]', error);
    res.status(500).json({ error: 'No se pudo enviar el regalo' });
  }
});

module.exports = router;
module.exports.default = router;
