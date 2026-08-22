import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { createViewerToken, livekitEnabled } from '../lib/livekit.js';
import { topDonors } from '../services/coins.js';
import { loadEnv } from '../env.js';
import { HttpError } from '../middleware/error.js';

export const streamsRouter = Router();

streamsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const streams = await prisma.stream.findMany({
      where: { status: 'LIVE' },
      include: { host: true },
      orderBy: { viewerCount: 'desc' },
    });

    res.json({
      streams: streams.map((stream) => ({
        id: stream.id,
        title: stream.title,
        category: stream.category,
        isPrivate: stream.isPrivate,
        lockPrice: stream.lockPrice,
        coverUrl: stream.coverUrl,
        previewUrl: stream.previewUrl,
        viewerCount: stream.viewerCount,
        livekitRoom: stream.livekitRoom,
        creator: {
          id: stream.host.id,
          name: stream.host.displayName,
          handle: `@${stream.host.handle}`,
          avatar: stream.host.avatarUrl ?? '',
          live: true,
          viewers: formatViewers(stream.viewerCount),
        },
      })),
    });
  }),
);

streamsRouter.get(
  '/gifts',
  asyncHandler(async (_req, res) => {
    const gifts = await prisma.gift.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });
    res.json({ gifts });
  }),
);

streamsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const stream = await prisma.stream.findUnique({
      where: { id: String(req.params.id) },
      include: { host: true },
    });
    if (!stream) {
      throw new HttpError(404, 'Stream not found');
    }
    const donors = await topDonors(stream.id);
    res.json({
      stream: {
        id: stream.id,
        title: stream.title,
        category: stream.category,
        isPrivate: stream.isPrivate,
        lockPrice: stream.lockPrice,
        coverUrl: stream.coverUrl,
        previewUrl: stream.previewUrl,
        viewerCount: stream.viewerCount,
        livekitRoom: stream.livekitRoom,
        creator: {
          id: stream.host.id,
          name: stream.host.displayName,
          handle: `@${stream.host.handle}`,
          avatar: stream.host.avatarUrl ?? '',
          live: stream.status === 'LIVE',
          viewers: formatViewers(stream.viewerCount),
        },
      },
      donors,
    });
  }),
);

streamsRouter.get(
  '/:id/livekit-token',
  requireAuth,
  asyncHandler(async (req, res) => {
    const env = loadEnv();
    const authReq = req as AuthedRequest;
    const stream = await prisma.stream.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!stream) {
      throw new HttpError(404, 'Stream not found');
    }
    if (!livekitEnabled(env)) {
      res.json({ enabled: false, token: null, url: null });
      return;
    }
    const token = await createViewerToken(
      env,
      stream.livekitRoom,
      authReq.dbUser.id,
      authReq.dbUser.displayName,
    );
    res.json({ enabled: true, token, url: env.LIVEKIT_URL });
  }),
);

function formatViewers(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return String(count);
}
