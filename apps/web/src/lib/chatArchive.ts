import { deleteField, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';

export type ArchivedChatMap = Record<string, { archivedAtMs: number }>;

function prefsRef(uid: string) {
  return doc(db, 'users', uid, 'private', 'chatPrefs');
}

export function listenArchivedChats(
  uid: string,
  onChange: (archived: ArchivedChatMap) => void,
): Unsubscribe {
  if (!uid) {
    onChange({});
    return () => undefined;
  }
  return onSnapshot(prefsRef(uid), (snap) => {
    const raw = snap.data()?.archived;
    if (!raw || typeof raw !== 'object') {
      onChange({});
      return;
    }
    const next: ArchivedChatMap = {};
    for (const [chatId, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value && typeof value === 'object' && Number((value as { archivedAtMs?: number }).archivedAtMs) > 0) {
        next[chatId] = { archivedAtMs: Number((value as { archivedAtMs: number }).archivedAtMs) };
      } else if (value) {
        next[chatId] = { archivedAtMs: Date.now() };
      }
    }
    onChange(next);
  });
}

export async function archiveConversationForUser(uid: string, chatId: string) {
  await setDoc(
    prefsRef(uid),
    {
      archived: { [chatId]: { archivedAtMs: Date.now() } },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function unarchiveConversationForUser(uid: string, chatId: string) {
  await updateDoc(prefsRef(uid), {
    [`archived.${chatId}`]: deleteField(),
    updatedAt: serverTimestamp(),
  }).catch(async () => {
    await setDoc(prefsRef(uid), { archived: {}, updatedAt: serverTimestamp() }, { merge: true });
  });
}
