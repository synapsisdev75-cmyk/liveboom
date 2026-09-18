import { api } from './api';
import { findLiveGift } from './liveboomGifts';

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
  purchasedBlastBalance: number;
  earnedBlastBalance: number;
  usedFallback: boolean;
};

/** Acredita Blast pendientes en la bandeja del receptor (como ganados). */
export async function processGiftInbox(uid: string): Promise<number> {
  // Los abonos actuales ya llegan procesados por el API en una transacción atómica.
  // No se acreditan entradas legacy creadas desde cliente porque no son verificables.
  void uid;
  return 0;
}

/*
 * El fallback cliente anterior modificaba saldos directamente y permitía
 * acreditar regalos sin una transacción verificada. Se conserva fuera de
 * compilación solo durante la migración histórica del archivo.
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
*/

/** Envía el regalo al API autoritativo; nunca modifica saldos desde el cliente. */
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
  const result = await api<{
    senderBalance: number;
    purchasedBlastBalance: number;
    earnedBlastBalance: number;
  }>('/api/gifts/send', {
    method: 'POST',
    body: JSON.stringify({
      giftId: catalog.id,
      roomName: input.roomName || null,
      postId: input.postId || null,
      recipientUid: input.recipientUid || null,
      recipientUsername: input.recipientUsername,
      clientId: input.clientId,
      multiplier: mult,
    }),
  });
  return {
    senderBalance: result.senderBalance,
    purchasedBlastBalance: result.purchasedBlastBalance,
    earnedBlastBalance: result.earnedBlastBalance,
    usedFallback: false,
  };
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
