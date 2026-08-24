import {
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
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
