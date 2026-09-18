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
import { normalizeBlastBalances } from './blastBalances';
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

/** Debita Blast del remitente: primero comprados, luego ganados. */
async function debitSenderCoins(senderUid: string, amount: number): Promise<number> {
  const coins = Math.max(1, Math.floor(Number(amount) || 0));
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'users', senderUid);
    const snap = await tx.get(ref);
    const bal = normalizeBlastBalances(
      snap.exists() ? (snap.data() as Record<string, unknown>) : {},
    );
    if (bal.coinsBalance < coins) {
      throw new Error('Saldo insuficiente');
    }
    const usePurchased = Math.min(bal.purchasedBlastBalance, coins);
    const useEarned = coins - usePurchased;
    const next = normalizeBlastBalances({
      purchasedBlastBalance: bal.purchasedBlastBalance - usePurchased,
      earnedBlastBalance: bal.earnedBlastBalance - useEarned,
      earnedBlastSpent: bal.earnedBlastSpent + useEarned,
      earnedBlastWithdrawn: bal.earnedBlastWithdrawn,
    });
    tx.set(
      ref,
      {
        coinsBalance: next.coinsBalance,
        purchasedBlastBalance: next.purchasedBlastBalance,
        earnedBlastBalance: next.earnedBlastBalance,
        earnedBlastSpent: next.earnedBlastSpent,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return next.coinsBalance;
  });
}

/** Acredita Blast al receptor como ganados (regalos / llamadas). */
async function creditRecipientEarned(
  recipientUid: string,
  amount: number,
  meta: {
    senderUid: string;
    senderName?: string;
    giftId?: string;
    giftName?: string;
    emoji?: string;
    clientId?: string;
    postId?: string | null;
    source: 'gift' | 'live_gift' | 'call_billing';
  },
): Promise<number> {
  const coins = Math.max(0, Math.floor(Number(amount) || 0));
  if (!coins) return 0;
  return runTransaction(db, async (tx) => {
    const userRef = doc(db, 'users', recipientUid);
    const userSnap = await tx.get(userRef);
    const bal = normalizeBlastBalances(
      userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : {},
    );
    const next = normalizeBlastBalances({
      purchasedBlastBalance: bal.purchasedBlastBalance,
      earnedBlastBalance: bal.earnedBlastBalance + coins,
      earnedBlastSpent: bal.earnedBlastSpent,
      earnedBlastWithdrawn: bal.earnedBlastWithdrawn,
    });
    const inboxRef = meta.clientId
      ? doc(db, 'users', recipientUid, 'giftInbox', String(meta.clientId).slice(0, 80))
      : doc(collection(db, 'users', recipientUid, 'giftInbox'));
    const existingInbox = meta.clientId ? await tx.get(inboxRef) : null;
    if (existingInbox?.exists() && existingInbox.data()?.processed) {
      return bal.earnedBlastBalance;
    }
    tx.set(
      userRef,
      {
        coinsBalance: next.coinsBalance,
        purchasedBlastBalance: next.purchasedBlastBalance,
        earnedBlastBalance: next.earnedBlastBalance,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    tx.set(inboxRef, {
      senderUid: meta.senderUid,
      senderName: meta.senderName || null,
      recipientUid,
      giftId: meta.giftId || null,
      giftName: meta.giftName || null,
      emoji: meta.emoji || null,
      coins,
      postId: meta.postId ?? null,
      clientId: meta.clientId || null,
      source: meta.source,
      processed: true,
      processedAtMs: Date.now(),
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    });
    return next.earnedBlastBalance;
  });
}

/** Acredita Blast pendientes en la bandeja del receptor (como ganados). */
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
    const bal = normalizeBlastBalances(
      userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : {},
    );
    let purchased = bal.purchasedBlastBalance;
    let earned = bal.earnedBlastBalance;
    let earnedSpent = bal.earnedBlastSpent;
    const earnedWithdrawn = bal.earnedBlastWithdrawn;

    for (const item of snap.docs) {
      const data = item.data();
      const coins = Math.floor(Number(data.coins || 0));
      if (coins > 0) {
        earned += coins;
        credited += coins;
      }
      tx.set(item.ref, { processed: true, processedAtMs: Date.now() }, { merge: true });
    }

    const next = normalizeBlastBalances({
      purchasedBlastBalance: purchased,
      earnedBlastBalance: earned,
      earnedBlastSpent: earnedSpent,
      earnedBlastWithdrawn: earnedWithdrawn,
    });
    tx.set(
      userRef,
      {
        coinsBalance: next.coinsBalance,
        purchasedBlastBalance: next.purchasedBlastBalance,
        earnedBlastBalance: next.earnedBlastBalance,
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
    await creditRecipientEarned(recipientUid, totalCoins, {
      senderUid: input.senderUid,
      senderName: input.senderName,
      giftId: catalog.id,
      giftName: catalog.name,
      emoji: catalog.emoji,
      clientId: input.clientId,
      source: 'live_gift',
    });
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
    const recipientRef = doc(db, 'users', recipientUid);
    const [senderSnap, recipientSnap] = await Promise.all([tx.get(senderRef), tx.get(recipientRef)]);
    const bal = normalizeBlastBalances(
      senderSnap.exists() ? (senderSnap.data() as Record<string, unknown>) : {},
    );
    if (bal.coinsBalance < totalCoins) {
      throw new Error('Saldo insuficiente');
    }
    const usePurchased = Math.min(bal.purchasedBlastBalance, totalCoins);
    const useEarned = totalCoins - usePurchased;
    const next = normalizeBlastBalances({
      purchasedBlastBalance: bal.purchasedBlastBalance - usePurchased,
      earnedBlastBalance: bal.earnedBlastBalance - useEarned,
      earnedBlastSpent: bal.earnedBlastSpent + useEarned,
      earnedBlastWithdrawn: bal.earnedBlastWithdrawn,
    });
    const recipientBal = normalizeBlastBalances(
      recipientSnap.exists() ? (recipientSnap.data() as Record<string, unknown>) : {},
    );
    const recipientNext = normalizeBlastBalances({
      purchasedBlastBalance: recipientBal.purchasedBlastBalance,
      earnedBlastBalance: recipientBal.earnedBlastBalance + totalCoins,
      earnedBlastSpent: recipientBal.earnedBlastSpent,
      earnedBlastWithdrawn: recipientBal.earnedBlastWithdrawn,
    });
    tx.set(
      senderRef,
      {
        coinsBalance: next.coinsBalance,
        purchasedBlastBalance: next.purchasedBlastBalance,
        earnedBlastBalance: next.earnedBlastBalance,
        earnedBlastSpent: next.earnedBlastSpent,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    tx.set(
      recipientRef,
      {
        coinsBalance: recipientNext.coinsBalance,
        purchasedBlastBalance: recipientNext.purchasedBlastBalance,
        earnedBlastBalance: recipientNext.earnedBlastBalance,
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
      source: 'gift',
      processed: true,
      processedAtMs: Date.now(),
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    });

    return next.coinsBalance;
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
  if (catalog.liveOnly && !input.roomName) {
    throw new Error('Este filtro AR solo se puede usar en LIVE');
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
        source: input.roomName ? 'live_gift' : 'gift',
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

export function validateCoinsBalance(balance: number, cost: number): boolean {
  return Number(balance) >= Number(cost);
}

export function openRechargeCoins() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('liveboom:open-recharge'));
}

/** Mismo envío de coins que LIVE/feed, para chat o llamada privada. */
export async function sendPrivateGift(input: SendGiftInput): Promise<SendGiftResult> {
  return sendLiveboomGift(input);
}

export async function registerGiftTransaction(input: SendGiftInput): Promise<SendGiftResult> {
  return sendPrivateGift(input);
}
