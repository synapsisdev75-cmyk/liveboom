import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getAuth } from 'firebase-admin/auth';
import { prisma } from '../lib/prisma.js';
import type { User } from '@prisma/client';

export type AuthedRequest = Request & {
  token: DecodedIdToken;
  dbUser: User;
};

function readBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice(7);
  }
  const query = req.query.token;
  return typeof query === 'string' ? query : null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const jwt = readBearer(req);
  if (!jwt) {
    res.status(401).json({ error: 'Missing Bearer token' });
    return;
  }

  try {
    const token = await getAuth().verifyIdToken(jwt);
    const dbUser = await prisma.user.findUnique({ where: { firebaseUid: token.uid } });
    if (!dbUser) {
      res.status(401).json({ error: 'User is not provisioned. Call POST /api/auth/session first.' });
      return;
    }
    (req as AuthedRequest).token = token;
    (req as AuthedRequest).dbUser = dbUser;
    next();
  } catch (error) {
    next(error);
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}
