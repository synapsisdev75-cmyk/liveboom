import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { loadEnv } from '../env.js';
import { createPaymentLink, wompiConfigured } from '../lib/wompi.js';
import { creditTopup, toProfile } from '../services/coins.js';
import { HttpError } from '../middleware/error.js';

const checkoutSchema = z.object({
  packageId: z.string().min(1),
});

export const walletRouter = Router();

walletRouter.use(requireAuth);

walletRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const authReq = req as AuthedRequest;
    const [user, packages, transactions] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: authReq.dbUser.id } }),
      prisma.coinPackage.findMany({ orderBy: { coins: 'asc' } }),
      prisma.transaction.findMany({
        where: { userId: authReq.dbUser.id },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
    ]);

    res.json({
      user: toProfile(user),
      packages,
      transactions,
    });
  }),
);

walletRouter.post(
  '/checkout',
  asyncHandler(async (req, res) => {
    const env = loadEnv();
    const authReq = req as AuthedRequest;
    const { packageId } = checkoutSchema.parse(req.body);
    const pack = await prisma.coinPackage.findUnique({ where: { id: packageId } });
    if (!pack) {
      throw new HttpError(404, 'Package not found');
    }

    const reference = `lb_${authReq.dbUser.id}_${randomUUID()}`;
    await prisma.transaction.create({
      data: {
        userId: authReq.dbUser.id,
        type: 'TOPUP',
        status: 'PENDING',
        coins: pack.coins,
        amountCents: pack.amountCents,
        currency: 'COP',
        provider: 'wompi',
        reference,
        metadata: { packageId: pack.id },
      },
    });

    if (!wompiConfigured(env)) {
      res.json({
        mock: true,
        reference,
        checkoutUrl: null,
        message:
          'Wompi no está configurado. En desarrollo puedes confirmar la recarga con POST /api/wallet/simulate.',
      });
      return;
    }

    const link = await createPaymentLink(env, {
      name: pack.name,
      amountCents: pack.amountCents,
      sku: reference,
    });

    await prisma.transaction.update({
      where: { reference },
      data: { metadata: { packageId: pack.id, wompiLinkId: link.id } },
    });

    res.json({ mock: false, reference, checkoutUrl: link.url });
  }),
);

walletRouter.post(
  '/simulate',
  asyncHandler(async (req, res) => {
    const env = loadEnv();
    if (env.NODE_ENV === 'production') {
      throw new HttpError(403, 'Simulate is disabled in production');
    }
    const authReq = req as AuthedRequest;
    const { reference } = z.object({ reference: z.string().min(1) }).parse(req.body);
    const pending = await prisma.transaction.findUnique({ where: { reference } });
    if (!pending || pending.userId !== authReq.dbUser.id) {
      throw new HttpError(404, 'Pending topup not found');
    }

    const result = await creditTopup({
      userId: authReq.dbUser.id,
      coins: pending.coins,
      providerRef: `sim_${reference}`,
      amountCents: pending.amountCents ?? undefined,
      reference,
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: authReq.dbUser.id } });
    res.json({ user: toProfile(user), duplicate: result.duplicate });
  }),
);
