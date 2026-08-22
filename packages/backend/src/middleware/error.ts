import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Invalid payload', details: error.flatten() });
    return;
  }

  const message = error instanceof Error ? error.message : 'Internal error';
  const isAuth = message.toLowerCase().includes('token') || message.toLowerCase().includes('firebase');
  console.error(error);
  res.status(isAuth ? 401 : 500).json({ error: isAuth ? 'Invalid Firebase token' : message });
}
