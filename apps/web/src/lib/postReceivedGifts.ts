import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { findLiveGift } from './liveboomGifts';

export type PostReceivedGiftRow = {
  id: string;
  senderUid: string;
  senderName: string;
  senderUsername: string;
  giftId: string;
  giftName: string;
  units: number;
  createdAtMs: number;
};

const PAGE = 40;

function mapGiftDoc(id: string, data: Record<string, unknown>): PostReceivedGiftRow | null {
  if (data.status && String(data.status) !== 'confirmed') return null;
  const giftId = String(data.giftId || '').trim();
  const units = Math.max(1, Math.floor(Number(data.units) || 1));
  if (!giftId) return null;
  const catalog = findLiveGift(giftId);
  return {
    id,
    senderUid: String(data.senderUid || ''),
    senderName: String(data.senderName || data.senderUsername || 'Liveboomer'),
    senderUsername: String(data.senderUsername || '').replace(/^@/, ''),
    giftId,
    giftName: catalog?.name || String(data.giftName || giftId),
    units,
    createdAtMs: Math.max(0, Math.floor(Number(data.createdAtMs) || 0)),
  };
}

export function listenPostGiftUnits(
  postId: string,
  onUnits: (units: number) => void,
): Unsubscribe {
  const id = String(postId || '').trim();
  if (!id) return () => undefined;
  return onSnapshot(
    doc(db, 'posts', id),
    (snap) => {
      const units = snap.exists()
        ? Math.max(0, Math.floor(Number(snap.data()?.giftUnitsReceived) || 0))
        : 0;
      onUnits(units);
    },
    () => undefined,
  );
}

export function listenPostReceivedGiftsPage(
  postId: string,
  onChange: (result: {
    rows: PostReceivedGiftRow[];
    last: QueryDocumentSnapshot<DocumentData> | null;
    error?: boolean;
  }) => void,
): Unsubscribe {
  const id = String(postId || '').trim();
  if (!id) return () => undefined;
  const q = query(
    collection(db, 'posts', id, 'receivedGifts'),
    orderBy('createdAtMs', 'desc'),
    limit(PAGE),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((item) => mapGiftDoc(item.id, item.data() as Record<string, unknown>))
        .filter((row): row is PostReceivedGiftRow => Boolean(row));
      onChange({
        rows,
        last: snap.docs[snap.docs.length - 1] || null,
      });
    },
    () => onChange({ rows: [], last: null, error: true }),
  );
}

export async function fetchOlderPostReceivedGifts(
  postId: string,
  after: QueryDocumentSnapshot<DocumentData>,
): Promise<{ rows: PostReceivedGiftRow[]; last: QueryDocumentSnapshot<DocumentData> | null }> {
  const id = String(postId || '').trim();
  if (!id) return { rows: [], last: null };
  const q = query(
    collection(db, 'posts', id, 'receivedGifts'),
    orderBy('createdAtMs', 'desc'),
    startAfter(after),
    limit(PAGE),
  );
  const snap = await getDocs(q);
  const rows = snap.docs
    .map((item) => mapGiftDoc(item.id, item.data() as Record<string, unknown>))
    .filter((row): row is PostReceivedGiftRow => Boolean(row));
  return { rows, last: snap.docs[snap.docs.length - 1] || null };
}

export { PAGE as POST_RECEIVED_GIFTS_PAGE };
