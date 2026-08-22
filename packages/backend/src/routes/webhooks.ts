import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/auth.js';
import { loadEnv } from '../env.js';
import { verifyWompiChecksum, type WompiEvent } from '../lib/wompi.js';
import { prisma } from '../lib/prisma.js';
import { creditTopup } from '../services/coins.js';
import { HttpError } from '../middleware/error.js';

const eventSchema = z.object({
  event: z.string(),
  data: z.object({
    transaction: z
      .object({
        id: z.string(),
        status: z.string(),
        reference: z.string().optional(),
        amount_in_cents: z.number().optional(),
      })
      .optional(),
  }),
  timestamp: z.number(),
  signature: z
    .object({
      checksum: z.string(),
      properties: z.array(z.string()),
    })
    .optional(),
});

export const webhooksRouter = Router();

webhooksRouter.post(
  '/wompi',
  asyncHandler(async (req, res) => {
    const env = loadEnv();
    const payload = eventSchema.parse(req.body) as WompiEvent;

    if (!verifyWompiChecksum(env, payload)) {
      throw new HttpError(401, 'Invalid Wompi checksum');
    }

    const txn = payload.data.transaction;
    if (!txn || payload.event !== 'transaction.updated') {
      res.json({ ok: true, ignored: true });
      return;
    }

    if (txn.status !== 'APPROVED') {
      if (txn.reference) {
        await prisma.transaction.updateMany({
          where: { reference: txn.reference, status: 'PENDING' },
          data: { status: 'FAILED', providerRef: txn.id },
        });
      }
      res.json({ ok: true, status: txn.status });
      return;
    }

    const pending = txn.reference
      ? await prisma.transaction.findUnique({ where: { reference: txn.reference } })
      : await prisma.transaction.findFirst({
          where: { providerRef: txn.id },
        });

    if (!pending) {
      res.json({ ok: true, unmatched: true });
      return;
    }

    await creditTopup({
      userId: pending.userId,
      coins: pending.coins,
      providerRef: txn.id,
      amountCents: txn.amount_in_cents,
      reference: pending.reference,
    });

    res.json({ ok: true });
  }),
);
