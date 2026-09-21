import { giftSendErrorMessage, sendPrivateGift, validateCoinsBalance } from './giftsFirestore';
import { findLiveGift, type LiveGift } from './liveboomGifts';
import { addLevelXp } from './profileFirestore';
import { sendChatMessage, type FriendChip } from './socialFirestore';

type SenderProfile = {
  firebaseUid: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  coinsBalance?: number;
};

const SEND_TIMEOUT_MS = 20_000;
const CHAT_RECEIPT_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`${label} tardó demasiado. Intenta de nuevo.`)),
      ms,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function postGiftChatReceipt(
  sender: SenderProfile,
  peer: FriendChip,
  catalog: LiveGift,
  multiplier: 1 | 2 | 4 | 8,
) {
  const text = multiplier > 1 ? `🎁 ${catalog.name} x${multiplier}` : `🎁 ${catalog.name}`;
  await sendChatMessage(
    {
      firebaseUid: sender.firebaseUid,
      handle: sender.handle,
      displayName: sender.displayName,
      avatarUrl: sender.avatarUrl,
    },
    peer,
    text,
    { giftId: catalog.id },
  );
}

/**
 * Cobra el regalo privado (chat / llamada).
 * El mensaje de chat va en segundo plano para no dejar el botón «Enviar» cargando.
 */
export async function sendPrivateGiftToPeer(input: {
  giftId: string;
  sender: SenderProfile;
  peer: FriendChip;
  multiplier?: 1 | 2 | 4 | 8;
  clientId: string;
}): Promise<{ senderBalance: number; catalog: LiveGift; totalCoins: number }> {
  const catalog = findLiveGift(input.giftId);
  if (!catalog) {
    throw new Error('Regalo no válido');
  }
  if (!input.peer.uid && !input.peer.username) {
    throw new Error('No encontramos al destinatario');
  }
  const multiplier = ([1, 2, 4, 8] as const).includes(input.multiplier ?? 1)
    ? (input.multiplier as 1 | 2 | 4 | 8)
    : 1;
  const totalCoins = catalog.coins * multiplier;
  const coins = input.sender.coinsBalance ?? 0;
  if (!validateCoinsBalance(coins, totalCoins)) {
    throw new Error('No tienes Coins suficientes');
  }

  try {
    const result = await withTimeout(
      sendPrivateGift({
        giftId: catalog.id,
        senderUid: input.sender.firebaseUid,
        senderName: input.sender.displayName || input.sender.handle || 'Liveboomer',
        senderBalance: coins,
        recipientUsername: input.peer.username,
        recipientUid: input.peer.uid,
        clientId: input.clientId,
        roomName: `chat:${input.peer.username || input.peer.uid}`,
        multiplier,
      }),
      SEND_TIMEOUT_MS,
      'El envío del regalo',
    );
    void addLevelXp(input.sender.firebaseUid, totalCoins).catch(() => undefined);
    void withTimeout(
      postGiftChatReceipt(input.sender, input.peer, catalog, multiplier),
      CHAT_RECEIPT_TIMEOUT_MS,
      'El mensaje de regalo',
    ).catch(() => undefined);
    return { senderBalance: result.senderBalance, catalog, totalCoins };
  } catch (error) {
    throw new Error(giftSendErrorMessage(error));
  }
}

export { validateCoinsBalance };
