import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from './firebase';

export type AdminChatRow = {
  chatId: string;
  participants: string[];
  profiles: Record<
    string,
    { username?: string; displayName?: string; avatarUrl?: string | null }
  >;
  lastMessage: string | null;
  lastAt: string | null;
};

export type AdminChatMessage = {
  id: string;
  text: string;
  fromUid: string;
  createdAt: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  deleted: boolean;
};

function asIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

/** Lista todos los chats privados (solo Super Admin + reglas). */
export async function listAllPrivateChats(max = 150): Promise<AdminChatRow[]> {
  let snap;
  try {
    snap = await getDocs(query(collection(db, 'chats'), orderBy('lastAt', 'desc'), limit(max)));
  } catch {
    snap = await getDocs(query(collection(db, 'chats'), limit(max)));
  }

  const rows: AdminChatRow[] = snap.docs.map((d) => {
    const data = d.data() as {
      participants?: string[];
      profiles?: AdminChatRow['profiles'];
      lastMessage?: string | null;
      lastAt?: unknown;
    };
    return {
      chatId: d.id,
      participants: Array.isArray(data.participants) ? data.participants.map(String) : [],
      profiles: data.profiles || {},
      lastMessage: data.lastMessage ?? null,
      lastAt: data.lastAt ? asIso(data.lastAt) : null,
    };
  });

  rows.sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')));
  return rows;
}

export async function listChatMessagesAdmin(
  chatId: string,
  max = 300,
): Promise<AdminChatMessage[]> {
  const id = String(chatId || '').trim();
  if (!id) return [];
  let snap;
  try {
    snap = await getDocs(
      query(collection(db, 'chats', id, 'messages'), orderBy('createdAt', 'asc'), limit(max)),
    );
  } catch {
    snap = await getDocs(query(collection(db, 'chats', id, 'messages'), limit(max)));
  }

  return snap.docs.map((d) => {
    const data = d.data();
    const deleted = Boolean(data.deleted);
    return {
      id: d.id,
      text: deleted ? '(eliminado)' : String(data.text || ''),
      fromUid: String(data.fromUid || ''),
      createdAt: asIso(data.createdAt),
      mediaUrl: deleted ? null : ((data.mediaUrl as string | null) ?? null),
      mediaType: deleted ? null : ((data.mediaType as string | null) ?? null),
      deleted,
    };
  });
}

export function chatParticipantLabel(
  chat: AdminChatRow,
  uid: string,
): string {
  const p = chat.profiles[uid];
  if (p?.displayName) return p.displayName;
  if (p?.username) return `@${p.username}`;
  return uid.slice(0, 8);
}
