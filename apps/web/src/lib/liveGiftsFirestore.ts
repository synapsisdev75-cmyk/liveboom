import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
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

/** Marca la sala como en vivo (nueva transmisión). */
export async function markLiveRoomActive(roomName: string, hostUid: string) {
  await setDoc(
    doc(db, 'liveRooms', roomKey(roomName)),
    {
      status: 'live',
      hostUid,
      startedAtMs: Date.now(),
      endedAtMs: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Marca la sala como cerrada cuando el anfitrión deja de transmitir. */
export async function markLiveRoomEnded(roomName: string) {
  await setDoc(
    doc(db, 'liveRooms', roomKey(roomName)),
    {
      status: 'ended',
      endedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function listenLiveRoomStatus(
  roomName: string,
  onChange: (status: 'live' | 'ended' | 'unknown') => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'liveRooms', roomKey(roomName)),
    (snap) => {
      if (!snap.exists()) {
        onChange('unknown');
        return;
      }
      const status = String(snap.data()?.status || 'unknown');
      onChange(status === 'ended' ? 'ended' : status === 'live' ? 'live' : 'unknown');
    },
    () => onChange('unknown'),
  );
}

/** Borra mensajes y regalos de la sala para que una transmisión nueva arranque con chat vacío. */
export async function resetLiveRoomChat(roomName: string) {
  const key = roomKey(roomName);

  async function wipe(subcollection: 'messages' | 'gifts') {
    const col = collection(db, 'liveRooms', key, subcollection);
    for (;;) {
      const snap = await getDocs(query(col, limit(400)));
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.docs.forEach((item) => batch.delete(item.ref));
      await batch.commit();
    }
  }

  await wipe('messages');
  await wipe('gifts');
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
