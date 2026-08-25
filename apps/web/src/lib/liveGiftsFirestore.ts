import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

export type LiveGiftEvent = {
  id: string;
  giftId: string;
  giftName: string;
  emoji: string;
  senderName: string;
  senderUid: string;
  coins: number;
};

function roomKey(roomName: string) {
  return roomName.trim().toLowerCase() || 'room';
}

export function listenLiveGifts(
  roomName: string,
  onGift: (gift: LiveGiftEvent) => void,
): Unsubscribe {
  const col = collection(db, 'liveRooms', roomKey(roomName), 'gifts');
  let primed = false;
  return onSnapshot(
    col,
    (snap) => {
      if (!primed) {
        primed = true;
        return;
      }
      for (const change of snap.docChanges()) {
        if (change.type !== 'added') continue;
        const data = change.doc.data() as Record<string, unknown>;
        const giftId = String(data.giftId || '');
        if (!giftId) continue;
        onGift({
          id: String(data.clientId || change.doc.id),
          giftId,
          giftName: String(data.giftName || 'Regalo'),
          emoji: String(data.emoji || '🎁'),
          senderName: String(data.senderName || 'Liveboomer'),
          senderUid: String(data.senderUid || ''),
          coins: Number(data.coins || 0),
        });
      }
    },
    (err) => {
      console.error('No se pudieron escuchar los regalos en vivo', err);
    },
  );
}

export async function publishLiveGift(
  roomName: string,
  gift: Omit<LiveGiftEvent, 'id'> & { clientId: string },
) {
  await addDoc(collection(db, 'liveRooms', roomKey(roomName), 'gifts'), {
    clientId: gift.clientId,
    giftId: gift.giftId,
    giftName: gift.giftName,
    emoji: gift.emoji,
    senderName: gift.senderName,
    senderUid: gift.senderUid,
    coins: gift.coins,
    createdAt: serverTimestamp(),
  });
}

export type LiveChatMessage = {
  id: string;
  author: string;
  authorUid: string;
  text: string;
  gift?: { giftId: string; emoji: string; name: string } | null;
  createdAtMs: number;
};

export function listenLiveChat(
  roomName: string,
  onChange: (messages: LiveChatMessage[]) => void,
): Unsubscribe {
  const col = collection(db, 'liveRooms', roomKey(roomName), 'messages');

  function emit(docs: QueryDocumentSnapshot<DocumentData>[]) {
    const list = docs
      .map((item) => {
        const data = item.data() as Record<string, unknown>;
        const giftRaw = data.gift && typeof data.gift === 'object' ? (data.gift as Record<string, unknown>) : null;
        return {
          id: String(data.clientId || item.id),
          author: String(data.author || 'Liveboomer'),
          authorUid: String(data.authorUid || ''),
          text: String(data.text || ''),
          gift: giftRaw
            ? {
                giftId: String(giftRaw.giftId || ''),
                emoji: String(giftRaw.emoji || '🎁'),
                name: String(giftRaw.name || 'Regalo'),
              }
            : null,
          createdAtMs: Number(data.createdAtMs || 0),
        };
      })
      .sort((a, b) => a.createdAtMs - b.createdAtMs)
      .slice(-400);
    onChange(list);
  }

  const q = query(col, orderBy('createdAtMs', 'desc'), limit(400));
  let fallback: Unsubscribe | null = null;
  const primary = onSnapshot(
    q,
    (snap) => emit(snap.docs),
    () => {
      fallback = onSnapshot(col, (snap) => emit(snap.docs), (err) => {
        console.error('No se pudo cargar el historial del chat', err);
      });
    },
  );
  return () => {
    primary();
    fallback?.();
  };
}

export async function publishLiveChatMessage(
  roomName: string,
  message: {
    clientId: string;
    authorUid: string;
    author: string;
    text: string;
    gift?: { giftId: string; emoji: string; name: string } | null;
  },
) {
  await addDoc(collection(db, 'liveRooms', roomKey(roomName), 'messages'), {
    clientId: message.clientId,
    authorUid: message.authorUid,
    author: message.author,
    text: message.text.slice(0, 500),
    gift: message.gift || null,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
}
