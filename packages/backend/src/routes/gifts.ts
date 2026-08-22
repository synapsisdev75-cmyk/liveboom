import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { sendGiftAtomic } from '../services/coins.js';
import { emitGift } from '../socket.js';
import { prisma } from '../lib/prisma.js';

const bodySchema = z.object({
  giftId: z.string().min(1),
});

export const giftsRouter = Router();

giftsRouter.post(
  '/:streamId/gifts',
  requireAuth,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthedRequest;
    const { giftId } = bodySchema.parse(req.body);
    const send = await sendGiftAtomic({
      senderId: authReq.dbUser.id,
      streamId: String(req.params.streamId),
      giftId,
    });

    emitGift(send.streamId, {
      id: send.id,
      emoji: send.gift.emoji,
      name: send.gift.name,
      price: send.gift.price,
      senderName: send.sender.displayName,
      senderAvatar: send.sender.avatarUrl,
    });

    const sender = await prisma.user.findUniqueOrThrow({
      where: { id: authReq.dbUser.id },
    });

    res.json({
      ok: true,
      coins: sender.coins,
      gift: {
        id: send.gift.id,
        name: send.gift.name,
        emoji: send.gift.emoji,
        price: send.gift.price,
      },
    });
  }),
);
