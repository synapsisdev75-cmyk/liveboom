import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { fetchPublicUserByUsername, type PublicFsUser } from './profileFirestore';
import { uploadUserMedia } from './storage';

export type FriendshipStatus =
  | 'none'
  | 'friends'
  | 'pending_sent'
  | 'pending_received'
  | 'self';

export type FriendChip = {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type FriendRequest = FriendChip & {
  id: string;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  text: string;
  fromUid: string;
  mine: boolean;
  createdAt: string;
};

export type Conversation = FriendChip & {
  chatId: string;
  lastMessage: string | null;
  lastAt: string | null;
};

export type FsPost = {
  id: string;
  authorUid: string;
  username: string;
  type: 'photo' | 'video' | 'text';
  caption: string | null;
  mediaUrl: string | null;
  createdAt: string;
  likes: number;
  viewerReaction: string | null;
};

function chatIdFor(a: string, b: string) {
  return [a, b].sort().join('_');
}

function friendshipId(a: string, b: string) {
  return [a, b].sort().join('_');
}

function asIso(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

export async function getFriendshipStatus(viewerUid: string, targetUsername: string): Promise<FriendshipStatus> {
  const target = await fetchPublicUserByUsername(targetUsername);
  if (!target) return 'none';
  if (target.firebaseUid === viewerUid) return 'self';

  const friendSnap = await getDoc(doc(db, 'friendships', friendshipId(viewerUid, target.firebaseUid)));
  if (friendSnap.exists()) return 'friends';

  const sentQ = query(
    collection(db, 'friendRequests'),
    where('fromUid', '==', viewerUid),
    where('toUid', '==', target.firebaseUid),
    where('status', '==', 'pending'),
    limit(1),
  );
  const sent = await getDocs(sentQ);
  if (!sent.empty) return 'pending_sent';

  const recvQ = query(
    collection(db, 'friendRequests'),
    where('fromUid', '==', target.firebaseUid),
    where('toUid', '==', viewerUid),
    where('status', '==', 'pending'),
    limit(1),
  );
  const recv = await getDocs(recvQ);
  if (!recv.empty) return 'pending_received';

  return 'none';
}

export async function sendFriendRequest(from: PublicFsUser | {
  firebaseUid: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
}, toUsername: string) {
  const target = await fetchPublicUserByUsername(toUsername);
  if (!target) throw new Error('Usuario no encontrado');
  if (target.firebaseUid === from.firebaseUid) throw new Error('No puedes enviarte solicitud a ti mismo');

  const status = await getFriendshipStatus(from.firebaseUid, toUsername);
  if (status === 'friends') return;
  if (status === 'pending_sent') return;
  if (status === 'pending_received') {
    await acceptFriendRequest(from.firebaseUid, toUsername);
    return;
  }

  await addDoc(collection(db, 'friendRequests'), {
    fromUid: from.firebaseUid,
    toUid: target.firebaseUid,
    fromUsername: 'handle' in from ? from.handle : from.username,
    fromDisplayName: from.displayName,
    fromAvatarUrl: from.avatarUrl,
    toUsername: target.username,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export async function cancelFriendRequest(fromUid: string, toUsername: string) {
  const target = await fetchPublicUserByUsername(toUsername);
  if (!target) return;
  const q = query(
    collection(db, 'friendRequests'),
    where('fromUid', '==', fromUid),
    where('toUid', '==', target.firebaseUid),
    where('status', '==', 'pending'),
  );
  const snaps = await getDocs(q);
  await Promise.all(snaps.docs.map((item) => deleteDoc(item.ref)));
}

export async function rejectFriendRequest(toUid: string, fromUsername: string) {
  const from = await fetchPublicUserByUsername(fromUsername);
  if (!from) return;
  const q = query(
    collection(db, 'friendRequests'),
    where('fromUid', '==', from.firebaseUid),
    where('toUid', '==', toUid),
    where('status', '==', 'pending'),
  );
  const snaps = await getDocs(q);
  await Promise.all(snaps.docs.map((item) => deleteDoc(item.ref)));
}

export async function acceptFriendRequest(toUid: string, fromUsername: string) {
  const from = await fetchPublicUserByUsername(fromUsername);
  const to = await getDoc(doc(db, 'users', toUid));
  if (!from || !to.exists()) throw new Error('Usuario no encontrado');
  const toData = to.data() as {
    username?: string;
    displayName?: string;
    avatarUrl?: string | null;
  };

  const q = query(
    collection(db, 'friendRequests'),
    where('fromUid', '==', from.firebaseUid),
    where('toUid', '==', toUid),
    where('status', '==', 'pending'),
  );
  const snaps = await getDocs(q);
  await Promise.all(snaps.docs.map((item) => updateDoc(item.ref, { status: 'accepted' })));

  const id = friendshipId(toUid, from.firebaseUid);
  await setDoc(doc(db, 'friendships', id), {
    uids: [toUid, from.firebaseUid],
    users: {
      [toUid]: {
        username: toData.username || '',
        displayName: toData.displayName || toData.username || '',
        avatarUrl: toData.avatarUrl ?? null,
      },
      [from.firebaseUid]: {
        username: from.username,
        displayName: from.displayName,
        avatarUrl: from.avatarUrl,
      },
    },
    createdAt: serverTimestamp(),
  });
}

export async function removeFriendship(uid: string, otherUsername: string) {
  const other = await fetchPublicUserByUsername(otherUsername);
  if (!other) return;
  await deleteDoc(doc(db, 'friendships', friendshipId(uid, other.firebaseUid)));
}

export function listenIncomingRequests(
  uid: string,
  onChange: (requests: FriendRequest[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'friendRequests'),
    where('toUid', '==', uid),
    where('status', '==', 'pending'),
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs
      .map((item) => {
        const data = item.data();
        return {
          id: item.id,
          uid: String(data.fromUid || ''),
          username: String(data.fromUsername || ''),
          displayName: String(data.fromDisplayName || data.fromUsername || ''),
          avatarUrl: (data.fromAvatarUrl as string | null) ?? null,
          createdAt: asIso(data.createdAt),
        };
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    onChange(list);
  });
}

export function listenFriends(uid: string, onChange: (friends: FriendChip[]) => void): Unsubscribe {
  const q = query(collection(db, 'friendships'), where('uids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const friends: FriendChip[] = [];
    for (const item of snap.docs) {
      const data = item.data() as {
        uids?: string[];
        users?: Record<string, { username?: string; displayName?: string; avatarUrl?: string | null }>;
      };
      const otherUid = (data.uids || []).find((value) => value !== uid);
      if (!otherUid || !data.users?.[otherUid]) continue;
      const profile = data.users[otherUid];
      friends.push({
        uid: otherUid,
        username: profile.username || '',
        displayName: profile.displayName || profile.username || '',
        avatarUrl: profile.avatarUrl ?? null,
      });
    }
    friends.sort((a, b) => a.username.localeCompare(b.username, 'es'));
    onChange(friends);
  });
}

export function listenConversations(
  uid: string,
  onChange: (conversations: Conversation[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'chats'), where('participants', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const list: Conversation[] = snap.docs.map((item) => {
      const data = item.data() as {
        participants?: string[];
        profiles?: Record<string, { username?: string; displayName?: string; avatarUrl?: string | null }>;
        lastMessage?: string | null;
        lastAt?: unknown;
      };
      const otherUid = (data.participants || []).find((value) => value !== uid) || '';
      const profile = data.profiles?.[otherUid] || {};
      return {
        chatId: item.id,
        uid: otherUid,
        username: profile.username || '',
        displayName: profile.displayName || profile.username || '',
        avatarUrl: profile.avatarUrl ?? null,
        lastMessage: data.lastMessage ?? null,
        lastAt: data.lastAt ? asIso(data.lastAt) : null,
      };
    });
    list.sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')));
    onChange(list);
  });
}

export function listenMessages(
  chatId: string,
  viewerUid: string,
  onChange: (messages: ChatMessage[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'), limit(200));
  return onSnapshot(q, (snap) => {
    onChange(
      snap.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          text: String(data.text || ''),
          fromUid: String(data.fromUid || ''),
          mine: data.fromUid === viewerUid,
          createdAt: asIso(data.createdAt),
        };
      }),
    );
  });
}

export async function ensureChat(
  me: { firebaseUid: string; handle: string; displayName: string; avatarUrl: string | null },
  friend: FriendChip,
) {
  const id = chatIdFor(me.firebaseUid, friend.uid);
  const ref = doc(db, 'chats', id);
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    await setDoc(ref, {
      participants: [me.firebaseUid, friend.uid],
      profiles: {
        [me.firebaseUid]: {
          username: me.handle,
          displayName: me.displayName,
          avatarUrl: me.avatarUrl,
        },
        [friend.uid]: {
          username: friend.username,
          displayName: friend.displayName,
          avatarUrl: friend.avatarUrl,
        },
      },
      lastMessage: null,
      lastAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
  }
  return id;
}

export async function sendChatMessage(
  me: { firebaseUid: string; handle: string; displayName: string; avatarUrl: string | null },
  friend: FriendChip,
  text: string,
) {
  const body = text.trim().slice(0, 2000);
  if (!body) throw new Error('Escribe un mensaje');
  const id = await ensureChat(me, friend);
  await addDoc(collection(db, 'chats', id, 'messages'), {
    text: body,
    fromUid: me.firebaseUid,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'chats', id), {
    lastMessage: body,
    lastAt: serverTimestamp(),
  });
  return id;
}

export function listenPostsByUsername(
  username: string,
  onChange: (posts: FsPost[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'posts'),
    where('username', '==', username.toLowerCase()),
    limit(60),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          authorUid: String(data.authorUid || ''),
          username: String(data.username || ''),
          type: (data.type as FsPost['type']) || 'text',
          caption: (data.caption as string | null) ?? null,
          mediaUrl: (data.mediaUrl as string | null) ?? null,
          createdAt: asIso(data.createdAt),
          likes: Number(data.likes ?? 0),
          viewerReaction: null,
        };
      });
      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      onChange(list);
    },
    () => onChange([]),
  );
}

export function listenRecentPosts(onChange: (posts: FsPost[]) => void): Unsubscribe {
  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(30));
  return onSnapshot(q, (snap) => {
    onChange(
      snap.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          authorUid: String(data.authorUid || ''),
          username: String(data.username || ''),
          type: (data.type as FsPost['type']) || 'text',
          caption: (data.caption as string | null) ?? null,
          mediaUrl: (data.mediaUrl as string | null) ?? null,
          createdAt: asIso(data.createdAt),
          likes: Number(data.likes ?? 0),
          viewerReaction: null,
        };
      }),
    );
  });
}

export async function createPost(input: {
  authorUid: string;
  username: string;
  type: 'photo' | 'video' | 'text';
  caption: string;
  mediaUrl?: string | null;
}) {
  let mediaUrl = input.mediaUrl || null;
  if (mediaUrl?.startsWith('data:')) {
    const blob = await (await fetch(mediaUrl)).blob();
    mediaUrl = await uploadUserMedia(input.authorUid, blob, input.type === 'video' ? 'clip.mp4' : 'photo.jpg');
  }
  const ref = await addDoc(collection(db, 'posts'), {
    authorUid: input.authorUid,
    username: input.username.toLowerCase(),
    type: input.type,
    caption: input.caption.trim().slice(0, 2000) || null,
    mediaUrl,
    likes: 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deletePost(postId: string, authorUid: string) {
  const ref = doc(db, 'posts', postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  if (String(snap.data().authorUid || '') !== authorUid) {
    throw new Error('No autorizado');
  }
  await deleteDoc(ref);
}
