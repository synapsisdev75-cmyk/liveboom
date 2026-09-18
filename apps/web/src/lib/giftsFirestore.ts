import { collection, getDocs, limit, query, runTransaction, where } from 'firebase/firestore';
import { api, ApiError } from './api';
import { db } from './firebase';
import { findLiveGift } from './liveboomGifts';
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

/**
 * Marca la bandeja como procesada. El crédito de coins lo hace el backend (Admin SDK);
 * el cliente no puede escribir coinsBalance (walletBalancesUnchanged en rules).
 */
export async function processGiftInbox(uid: string): Promise<number> {
  const id = String(uid || '').trim();
  if (!id) return 0;

  const snap = await getDocs(
    query(collection(db, 'users', id, 'giftInbox'), where('processed', '==', false), limit(25)),
  );
  if (snap.empty) return 0;

  await runTransaction(db, async (tx) => {
    for (const item of snap.docs) {
      tx.set(item.ref, { processed: true, processedAtMs: Date.now() }, { merge: true });
    }
  });

  return 0;
}

function giftApiSource(input: SendGiftInput): 'live_gift' | 'gift' | 'private' {
  const room = String(input.roomName || '');
  if (room.startsWith('chat:')) return 'private';
  if (input.roomName) return 'live_gift';
  return 'gift';
}

function lookupRoomName(input: SendGiftInput): string {
  const source = giftApiSource(input);
  if (source === 'private') return String(input.recipientUsername || '').trim();
  return String(input.roomName || input.recipientUsername || '').trim();
}

/** Mensaje usable: el cobro va por API; no se mutan saldos desde el cliente. */
export function giftSendErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '');
  const status = error instanceof ApiError ? error.status : 0;
  if (/insufficient permissions|permission-denied|Missing or insufficient/i.test(raw)) {
    return 'No se pudo completar el envío. Intenta de nuevo en un momento.';
  }
  if (status === 402 || /insuficiente|saldo/i.test(raw)) {
    return 'Saldo insuficiente. Recarga coins para continuar.';
  }
  if (status === 401 || /no hay sesión/i.test(raw)) {
    return 'Inicia sesión para enviar regalos';
  }
  if (status === 400 && /ti mismo|self/i.test(raw)) {
    return 'No puedes enviarte regalos a ti mismo';
  }
  if (raw && raw.length < 160 && !/FirebaseError|\[code\]/i.test(raw)) return raw;
  return 'No se pudo enviar el regalo';
}

/** Envía regalo vía API (Admin SDK). Los saldos no se escriben desde el cliente. */
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
  const roomName = lookupRoomName(input);
  const source = giftApiSource(input);

  if (!roomName) {
    throw new Error('No encontramos al creador de este contenido');
  }

  if (input.senderBalance < totalCoins) {
    throw new Error('Saldo insuficiente. Recarga coins para continuar.');
  }

  if (input.recipientUid && input.recipientUid === input.senderUid) {
    throw new Error('No puedes enviarte regalos a ti mismo');
  }

  try {
    const result = await api<{ senderBalance: number }>('/api/gifts/send', {
      method: 'POST',
      body: JSON.stringify({
        giftId: catalog.id,
        roomName,
        clientId: input.clientId,
        currentBalance: input.senderBalance,
        multiplier: mult,
        source,
        recipientUid: input.recipientUid || undefined,
        postId: input.postId || undefined,
      }),
    });
    return { senderBalance: result.senderBalance, usedFallback: false };
  } catch (error) {
    throw new Error(giftSendErrorMessage(error));
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

export { resolveRecipientUid };
