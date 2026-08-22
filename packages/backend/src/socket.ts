import type { Server as HttpServer } from 'node:http';
import { getAuth } from 'firebase-admin/auth';
import { Server } from 'socket.io';
import { prisma } from './lib/prisma.js';

export type ChatPayload = {
  id: string;
  author: string;
  avatar: string | null;
  text: string;
  isHost?: boolean;
  donation?: number;
  createdAt: string;
};

export type GiftPayload = {
  id: string;
  emoji: string;
  name: string;
  price: number;
  senderName: string;
  senderAvatar: string | null;
};

let ioRef: Server | null = null;

export function attachSocket(httpServer: HttpServer, origin: string): Server {
  const io = new Server(httpServer, {
    cors: { origin, credentials: true },
  });
  ioRef = io;

  io.use(async (socket, next) => {
    try {
      const token = String(socket.handshake.auth.token ?? '');
      const decoded = await getAuth().verifyIdToken(token);
      const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
      if (!user) {
        next(new Error('User not provisioned'));
        return;
      }
      socket.data.user = user;
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('room:join', async (streamId: string) => {
      if (typeof streamId !== 'string') return;
      const exists = await prisma.stream.findUnique({ where: { id: streamId } });
      if (!exists) return;
      await socket.join(streamId);
      socket.emit('room:joined', streamId);
    });

    socket.on('chat:send', (input: { streamId: string; text: string }) => {
      const user = socket.data.user as { displayName: string; avatarUrl: string | null; id: string };
      const text = input.text?.trim().slice(0, 280);
      if (!text || !input.streamId) return;

      const payload: ChatPayload = {
        id: crypto.randomUUID(),
        author: user.displayName,
        avatar: user.avatarUrl,
        text,
        createdAt: new Date().toISOString(),
      };
      io.to(input.streamId).emit('chat:message', payload);
    });
  });

  return io;
}

export function emitGift(streamId: string, gift: GiftPayload) {
  ioRef?.to(streamId).emit('gift:sent', gift);
  ioRef?.to(streamId).emit('chat:message', {
    id: gift.id,
    author: gift.senderName,
    avatar: gift.senderAvatar,
    text: `Envió ${gift.name}`,
    donation: gift.price,
    createdAt: new Date().toISOString(),
  } satisfies ChatPayload);
}
