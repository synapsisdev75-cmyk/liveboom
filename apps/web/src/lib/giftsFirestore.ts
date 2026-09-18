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
