import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { api, ApiError } from './api';
import { normalizeBlastBalances } from './blastBalances';
import { db } from './firebase';
import { findLiveGift } from './liveboomGifts';
import { publishLiveGift } from './liveGiftsFirestore';
import { fetchPublicUserByUid, fetchPublicUserByUsername } from './profileFirestore';

export type GiftContentType =
  | 'post'
  | 'boom_clip'
  | 'flashboom'
  | 'live'
  | 'battle'
  | 'chat'
  | 'call';

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
  contentType?: GiftContentType;
  source?: string;
};

export type SendGiftResult = {
  senderBalance: number;
  purchasedBlastBalance?: number;
  earnedBlastBalance?: number;
  usedFallback: boolean;
  creditedFirestore?: boolean;
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
async function debitSenderCoins(senderUid: string, amount: number): Promise<{
  coinsBalance: number;
  purchasedBlastBalance: number;
  earnedBlastBalance: number;
}> {
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
        earnedBlastWithdrawn: next.earnedBlastWithdrawn,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return {
      coinsBalance: next.coinsBalance,
      purchasedBlastBalance: next.purchasedBlastBalance,
      earnedBlastBalance: next.earnedBlastBalance,
    };
  });
}

type GiftInboxMeta = {
  senderUid: string;
  senderName?: string;
  giftId?: string;
  giftName?: string;
  emoji?: string;
  clientId?: string;
  postId?: string | null;
  roomName?: string | null;
  multiplier?: number;
  source: string;
  contentType?: GiftContentType | null;
};

/** El remitente no puede editar el saldo del receptor: deja el regalo pendiente. */
async function enqueueGiftInbox(
  recipientUid: string,
  amount: number,
  meta: GiftInboxMeta,
): Promise<void> {
  const coins = Math.max(0, Math.floor(Number(amount) || 0));
  if (!coins) return;
  const inboxRef = meta.clientId
    ? doc(db, 'users', recipientUid, 'giftInbox', String(meta.clientId).slice(0, 80))
    : doc(collection(db, 'users', recipientUid, 'giftInbox'));
  await setDoc(inboxRef, {
    senderUid: meta.senderUid,
    senderName: meta.senderName || null,
    recipientUid,
    giftId: meta.giftId || null,
    giftName: meta.giftName || null,
    emoji: meta.emoji || null,
    coins,
    multiplier: meta.multiplier || 1,
    postId: meta.postId ?? null,
    roomName: meta.roomName ?? null,
    clientId: meta.clientId || null,
    source: meta.source,
    contentType: meta.contentType || null,
    processed: false,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
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
        earnedBlastSpent: next.earnedBlastSpent,
        earnedBlastWithdrawn: next.earnedBlastWithdrawn,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  return credited;
}

export function listenUnprocessedGifts(uid: string, onPending: () => void): Unsubscribe {
  const id = String(uid || '').trim();
  if (!id) return () => undefined;
  const q = query(
    collection(db, 'users', id, 'giftInbox'),
    where('processed', '==', false),
    limit(25),
  );
  return onSnapshot(q, (snap) => {
    if (!snap.empty) onPending();
  });
}

function inboxMeta(
  input: SendGiftInput,
  catalog: NonNullable<ReturnType<typeof findLiveGift>>,
): GiftInboxMeta {
  const isLive = Boolean(input.roomName) && !String(input.roomName).startsWith('chat:');
  return {
    senderUid: input.senderUid,
    senderName: input.senderName,
    giftId: catalog.id,
    giftName: catalog.name,
    emoji: catalog.emoji,
    clientId: input.clientId,
    postId: input.postId || null,
    roomName: input.roomName || null,
    multiplier: input.multiplier ?? 1,
    source: input.source || (isLive ? 'live_gift' : input.postId ? 'gift' : 'gift'),
    contentType: input.contentType || null,
  };
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

  const sender = await debitSenderCoins(input.senderUid, totalCoins);
  try {
    await enqueueGiftInbox(recipientUid, totalCoins, inboxMeta(input, catalog));
  } catch {
    /* el receptor aún puede recibir si el API ya acreditó */
  }

  const isLive = Boolean(input.roomName) && !String(input.roomName).startsWith('chat:');
  if (isLive && input.roomName) {
    await publishLiveGift(input.roomName, {
      clientId: input.clientId,
      giftId: catalog.id,
      giftName: catalog.name,
      emoji: catalog.emoji,
      senderName: input.senderName,
      senderUid: input.senderUid,
      coins: totalCoins,
      multiplier: input.multiplier ?? 1,
    });
  }

  return {
    senderBalance: sender.coinsBalance,
    purchasedBlastBalance: sender.purchasedBlastBalance,
    earnedBlastBalance: sender.earnedBlastBalance,
    usedFallback: true,
    creditedFirestore: false,
  };
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
  const contentType = input.contentType;
  const source =
    input.source ||
    (contentType === 'battle'
      ? 'battle'
      : contentType === 'live'
        ? 'live_gift'
        : contentType === 'chat'
          ? 'chat'
          : 'gift');

  try {
    const result = await api<{
      senderBalance: number;
      purchasedBlastBalance?: number;
      earnedBlastBalance?: number;
      creditedFirestore?: boolean;
    }>('/api/gifts/send', {
      method: 'POST',
      body: JSON.stringify({
        giftId: catalog.id,
        roomName,
        clientId: input.clientId,
        currentBalance: input.senderBalance,
        multiplier: mult,
        recipientUid: input.recipientUid,
        postId: input.postId || null,
        contentType: contentType || null,
        source,
      }),
    });

    if (!result.creditedFirestore) {
      let sender = {
        coinsBalance: result.senderBalance,
        purchasedBlastBalance: result.purchasedBlastBalance,
        earnedBlastBalance: result.earnedBlastBalance,
      };
      try {
        sender = await debitSenderCoins(input.senderUid, totalCoins);
      } catch {
        /* el API pudo haber cobrado en memoria; el saldo Firestore manda */
      }
      try {
        const recipientUid = await resolveRecipientUid(input.recipientUsername, input.recipientUid);
        await enqueueGiftInbox(recipientUid, totalCoins, inboxMeta({ ...input, source }, catalog));
      } catch {
        /* no bloquear el envío si la bandeja falla */
      }
      return {
        senderBalance: sender.coinsBalance,
        purchasedBlastBalance: sender.purchasedBlastBalance,
        earnedBlastBalance: sender.earnedBlastBalance,
        usedFallback: false,
        creditedFirestore: false,
      };
    }

    return {
      senderBalance: result.senderBalance,
      purchasedBlastBalance: result.purchasedBlastBalance,
      earnedBlastBalance: result.earnedBlastBalance,
      usedFallback: false,
      creditedFirestore: Boolean(result.creditedFirestore),
    };
  } catch (error) {
    if (!shouldFallbackToFirestore(error)) {
      throw error instanceof ApiError
        ? new Error(error.message)
        : error instanceof Error
          ? error
          : new Error('No se pudo enviar el regalo');
    }
    return sendGiftViaFirestore({ ...input, source, contentType, multiplier: mult }, catalog, totalCoins);
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
  return sendLiveboomGift({ ...input, contentType: input.contentType || 'chat', source: input.source || 'chat' });
}

export async function registerGiftTransaction(input: SendGiftInput): Promise<SendGiftResult> {
  return sendPrivateGift(input);
}
