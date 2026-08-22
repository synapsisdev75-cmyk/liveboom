import { Router } from 'express';
import { z } from 'zod';
import { getAuth } from 'firebase-admin/auth';
import { asyncHandler } from '../middleware/auth.js';
import { toProfile, upsertFromFirebase } from '../services/coins.js';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/error.js';

const sessionSchema = z.object({
  token: z.string().min(10),
});

export const authRouter = Router();

authRouter.post(
  '/session',
  asyncHandler(async (req, res) => {
    const { token } = sessionSchema.parse(req.body);
    const decoded = await getAuth().verifyIdToken(token);
    const profile = await upsertFromFirebase({
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture,
    });
    res.json({ user: profile });
  }),
);

authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new HttpError(401, 'Missing Bearer token');
    }
    const decoded = await getAuth().verifyIdToken(header.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) {
      throw new HttpError(401, 'User is not provisioned');
    }
    res.json({ user: toProfile(user) });
  }),
);
