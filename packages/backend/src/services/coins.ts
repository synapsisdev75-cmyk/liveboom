import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/error.js';

function slugHandle(name: string, uid: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 16);
  return `${base || 'user'}_${uid.slice(0, 6)}`;
}

export type SessionProfile = {
  id: string;
  firebaseUid: string;
  email: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  coins: number;
};

export function toProfile(user: {
  id: string;
  firebaseUid: string;
  email: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  coins: number;
}): SessionProfile {
  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    displayName: user.displayName,
    handle: user.handle,
    avatarUrl: user.avatarUrl,
    coins: user.coins,
  };
}

/** Busca o crea el usuario. El saldo inicial siempre es 0. */
export async function upsertFromFirebase(input: {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}): Promise<SessionProfile> {
  const email = input.email ?? `${input.uid}@liveboom.local`;
  const displayName = input.name ?? email.split('@')[0] ?? 'Liveboomer';

  const existing = await prisma.user.findUnique({ where: { firebaseUid: input.uid } });
  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        email,
        displayName,
        avatarUrl: input.picture ?? existing.avatarUrl,
      },
    });
    return toProfile(updated);
  }

  const created = await prisma.user.create({
    data: {
      firebaseUid: input.uid,
      email,
      displayName,
      handle: slugHandle(displayName, input.uid),
      avatarUrl: input.picture,
      coins: 0,
    },
  });
  return toProfile(created);
}

export async function sendGiftAtomic(params: {
  senderId: string;
  streamId: string;
  giftId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const gift = await tx.gift.findFirst({
      where: { id: params.giftId, isActive: true },
    });
    if (!gift) {
      throw new HttpError(404, 'Gift not found');
    }

    const stream = await tx.stream.findUnique({ where: { id: params.streamId } });
    if (!stream || stream.status !== 'LIVE') {
      throw new HttpError(404, 'Stream is not live');
    }
    if (stream.hostId === params.senderId) {
      throw new HttpError(400, 'Host cannot gift themselves');
    }

    const ids = [params.senderId, stream.hostId].sort();
    const locked = await tx.$queryRaw<Array<{ id: string; coins: number }>>`
      SELECT id, coins FROM "User"
      WHERE id IN (${ids[0]}, ${ids[1]})
      ORDER BY id
      FOR UPDATE
    `;

    const sender = locked.find((row) => row.id === params.senderId);
    if (!sender) {
      throw new HttpError(404, 'Sender not found');
    }
    if (sender.coins < gift.price) {
      throw new HttpError(402, 'Saldo insuficiente');
    }

    await tx.user.update({
      where: { id: params.senderId },
      data: { coins: { decrement: gift.price } },
    });
    await tx.user.update({
      where: { id: stream.hostId },
      data: { coins: { increment: gift.price } },
    });

    const send = await tx.giftSend.create({
      data: {
        giftId: gift.id,
        senderId: params.senderId,
        receiverId: stream.hostId,
        streamId: stream.id,
        coins: gift.price,
      },
      include: {
        gift: true,
        sender: true,
      },
    });

    await tx.transaction.create({
      data: {
        userId: params.senderId,
        type: 'GIFT_SENT',
        status: 'COMPLETED',
        coins: -gift.price,
        reference: `gift-sent-${send.id}`,
      },
    });
    await tx.transaction.create({
      data: {
        userId: stream.hostId,
        type: 'GIFT_RECEIVED',
        status: 'COMPLETED',
        coins: gift.price,
        reference: `gift-recv-${send.id}`,
      },
    });

    return send;
  });
}

/** Acredita coins con bloqueo de fila. Idempotente vía providerRef único. */
export async function creditTopup(params: {
  userId: string;
  coins: number;
  providerRef: string;
  amountCents?: number;
  reference?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.transaction.findUnique({
      where: { providerRef: params.providerRef },
    });
    if (duplicate?.status === 'COMPLETED') {
      return { duplicate: true as const, coins: duplicate.coins };
    }

    await tx.$queryRaw`
      SELECT id FROM "User" WHERE id = ${params.userId} FOR UPDATE
    `;

    if (params.reference) {
      const pending = await tx.transaction.findUnique({
        where: { reference: params.reference },
      });
      if (pending) {
        await tx.transaction.update({
          where: { id: pending.id },
          data: {
            status: 'COMPLETED',
            providerRef: params.providerRef,
            provider: 'wompi',
          },
        });
      }
    } else {
      await tx.transaction.create({
        data: {
          userId: params.userId,
          type: 'TOPUP',
          status: 'COMPLETED',
          coins: params.coins,
          amountCents: params.amountCents,
          currency: 'COP',
          provider: 'wompi',
          providerRef: params.providerRef,
          reference: `topup-${params.providerRef}`,
        },
      });
    }

    const user = await tx.user.update({
      where: { id: params.userId },
      data: { coins: { increment: params.coins } },
    });

    return { duplicate: false as const, coins: user.coins };
  });
}

export async function topDonors(streamId: string) {
  const grouped = await prisma.giftSend.groupBy({
    by: ['senderId'],
    where: { streamId },
    _sum: { coins: true },
    orderBy: { _sum: { coins: 'desc' } },
    take: 3,
  });

  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((row) => row.senderId) } },
  });

  return grouped.map((row, index) => {
    const user = users.find((item) => item.id === row.senderId);
    return {
      rank: (index + 1) as 1 | 2 | 3,
      id: row.senderId,
      name: user?.displayName ?? 'Usuario',
      avatar: user?.avatarUrl ?? '',
      coins: row._sum.coins ?? 0,
    };
  });
}
