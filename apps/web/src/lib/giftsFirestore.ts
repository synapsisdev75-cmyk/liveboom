import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { api, ApiError } from './api';
import { db } from './firebase';
import { findLiveGift } from './liveboomGifts';
import { publishLiveGift } from './liveGiftsFirestore';
import { fetchPublicUserByUid, fetchPublicUserByUsername } from './profileFirestore';

export type SendGiftInput = {
  giftId: string;
  senderUid: string;
  senderName: string;
  senderBalance: number;
  recipientUsername: string;
  recipientUid?: string;
  clientId: string;
  postId?: string;
  roomName?: string;
  multiplier?: 1 | 2 | 4 | 8;
};

export type SendGiftResult = {
  senderBalance: number;
  usedFallback: boolean;
};

async function resolveRecipientUid(
  recipientUsername: string,
  recipientUid?: string,
): Promise<string> {
  if (recipientUid) {
    const byUid = await fetchPublicUserByUid(recipientUid);
    if (byUid?.firebaseUid) return byUid.firebaseUid;
  }
  const user = await fetchPublicUserByUsername(recipientUsername);
  if (!user?.firebaseUid) {
    throw new Error('No encontramos al creador de este contenido');
  }
  return user.firebaseUid;
}

/** Debita coins del remitente (solo su propio doc). */
async function debitSenderCoins(senderUid: string, amount: number): Promise<number> {
  const coins = Math.max(1, Math.floor(Number(amount) || 0));
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'users', senderUid);
    const snap = await tx.get(ref);
    const current = snap.exists() ? Number(snap.data()?.coinsBalance ?? 0) : 0;
    if (current < coins) {
      throw new Error('Saldo insuficiente');
    }
    const next = current - coins;
    tx.set(
      ref,
      {
        coinsBalance: next,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return next;
  });
}

/** Acredita coins pendientes en la bandeja del receptor. */
export async function processGiftInbox(uid: string): Promise<number> {
  const id = String(uid || '').trim();
  if (!id) return 0;

  const snap = await getDocs(
    query(collection(db, 'users', id, 'giftInbox'), where('processed', '==', false), limit(25)),
  );
  if (snap.empty) return 0;

  let credited = 0;
  await runTransaction(db, async (tx) => {
    const userRef = doc(db, 'users', id);
    const userSnap = await tx.get(userRef);
    let balance = userSnap.exists() ? Number(userSnap.data()?.coinsBalance ?? 0) : 0;

    for (const item of snap.docs) {
      const data = item.data();
      const coins = Math.floor(Number(data.coins || 0));
      if (coins > 0) {
        balance += coins;
        credited += coins;
      }
      tx.set(item.ref, { processed: true, processedAtMs: Date.now() }, { merge: true });
    }

    tx.set(
      userRef,
      {
        coinsBalance: balance,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  return credited;
}

async function sendGiftViaFirestore(
  input: SendGiftInput,
  catalog: NonNullable<ReturnType<typeof findLiveGift>>,
  totalCoins: number,
): Promise<SendGiftResult> {
  const recipientUid = await resolveRecipientUid(input.recipientUsername, input.recipientUid);
  if (recipientUid === input.senderUid) {
    throw new Error('No puedes enviarte regalos a ti mismo');
  }
  if (input.senderBalance < totalCoins) {
    throw new Error('Saldo insuficiente');
  }

  const mult = input.multiplier ?? 1;
  const isLive = Boolean(input.roomName);

  if (isLive && input.roomName) {
    const senderBalance = await debitSenderCoins(input.senderUid, totalCoins);
    await publishLiveGift(input.roomName, {
      clientId: input.clientId,
      giftId: catalog.id,
      giftName: catalog.name,
      emoji: catalog.emoji,
      senderName: input.senderName,
      senderUid: input.senderUid,
      coins: totalCoins,
      multiplier: mult,
    });
    return { senderBalance, usedFallback: true };
  }

  const senderBalance = await runTransaction(db, async (tx) => {
    const senderRef = doc(db, 'users', input.senderUid);
    const senderSnap = await tx.get(senderRef);
    const current = senderSnap.exists() ? Number(senderSnap.data()?.coinsBalance ?? 0) : 0;
    if (current < totalCoins) {
      throw new Error('Saldo insuficiente');
    }
    const next = current - totalCoins;
    tx.set(
      senderRef,
      {
        coinsBalance: next,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    const inboxRef = doc(collection(db, 'users', recipientUid, 'giftInbox'));
    tx.set(inboxRef, {
      senderUid: input.senderUid,
      senderName: input.senderName,
      recipientUid,
      giftId: catalog.id,
      giftName: catalog.name,
      emoji: catalog.emoji,
      coins: totalCoins,
      multiplier: mult,
      postId: input.postId || null,
      clientId: input.clientId,
      processed: false,
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    });

    return next;
  });

  return { senderBalance, usedFallback: true };
}

function shouldFallbackToFirestore(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 0 || error.status === 404 || error.status >= 500;
  }
  return true;
}

/** Envía regalo vía API en línea; si falla, usa Firestore. */
export async function sendLiveboomGift(input: SendGiftInput): Promise<SendGiftResult> {
  const catalog = findLiveGift(input.giftId);
  if (!catalog) {
    throw new Error('Regalo no válido');
  }

  const mult = [1, 2, 4, 8].includes(input.multiplier ?? 1) ? (input.multiplier as 1 | 2 | 4 | 8) : 1;
  const totalCoins = catalog.coins * mult;
  const roomName = input.roomName || input.recipientUsername;

  try {
    const result = await api<{ senderBalance: number }>('/api/gifts/send', {
      method: 'POST',
      body: JSON.stringify({
        giftId: catalog.id,
        roomName,
        clientId: input.clientId,
        currentBalance: input.senderBalance,
        multiplier: mult,
      }),
    });
    return { senderBalance: result.senderBalance, usedFallback: false };
  } catch (error) {
    if (!shouldFallbackToFirestore(error)) {
      throw error instanceof ApiError
        ? new Error(error.message)
        : error instanceof Error
          ? error
          : new Error('No se pudo enviar el regalo');
    }
    return sendGiftViaFirestore(input, catalog, totalCoins);
  }
}
