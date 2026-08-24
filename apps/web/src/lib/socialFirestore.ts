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
  mediaUrl?: string | null;
  mediaType?: 'image' | 'audio' | 'file' | null;
  linkUrl?: string | null;
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
  visibility: 'public' | 'friends' | 'private';
  createdAt: string;
  likes: number;
  viewerReaction: string | null;
};

type MeProfile = {
  firebaseUid: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
};

function chatIdFor(a: string, b: string) {
  return [a, b].sort().join('_');
}

function asIso(value: unknown) {
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function chipFromData(uid: string, data: Record<string, unknown>): FriendChip {
  return {
    uid,
    username: String(data.username || ''),
    displayName: String(data.displayName || data.username || ''),
    avatarUrl: (data.avatarUrl as string | null) ?? null,
  };
}

function meToChip(me: MeProfile): FriendChip {
  return {
    uid: me.firebaseUid,
    username: me.handle,
    displayName: me.displayName,
    avatarUrl: me.avatarUrl,
  };
}

export async function getFriendshipStatus(
  viewerUid: string,
  targetUsername: string,
): Promise<FriendshipStatus> {
  const target = await fetchPublicUserByUsername(targetUsername);
  if (!target) return 'none';
  if (target.firebaseUid === viewerUid) return 'self';

  const friendSnap = await getDoc(doc(db, 'users', viewerUid, 'friends', target.firebaseUid));
  if (friendSnap.exists()) return 'friends';

  const sentSnap = await getDoc(doc(db, 'users', viewerUid, 'outgoingRequests', target.firebaseUid));
  if (sentSnap.exists()) return 'pending_sent';

  const recvSnap = await getDoc(doc(db, 'users', viewerUid, 'incomingRequests', target.firebaseUid));
  if (recvSnap.exists()) return 'pending_received';

  return 'none';
}

export async function sendFriendRequest(from: MeProfile | PublicFsUser, toUsername: string) {
  const fromUid = from.firebaseUid;
  const fromUsername = 'handle' in from ? from.handle : from.username;
  const target = await fetchPublicUserByUsername(toUsername);
  if (!target) throw new Error('Usuario no encontrado en Firebase. Pídele que guarde su perfil.');
  if (target.firebaseUid === fromUid) throw new Error('No puedes enviarte solicitud a ti mismo');

  const status = await getFriendshipStatus(fromUid, toUsername);
  if (status === 'friends') return;
  if (status === 'pending_sent') return;
  if (status === 'pending_received') {
    await acceptFriendRequest(fromUid, toUsername);
    return;
  }

  const fromChip = {
    username: fromUsername,
    displayName: from.displayName,
    avatarUrl: from.avatarUrl,
    createdAt: serverTimestamp(),
  };
  const toChip = {
    username: target.username,
    displayName: target.displayName,
    avatarUrl: target.avatarUrl,
    createdAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'users', target.firebaseUid, 'incomingRequests', fromUid), fromChip);
  await setDoc(doc(db, 'users', fromUid, 'outgoingRequests', target.firebaseUid), toChip);
}

export async function cancelFriendRequest(fromUid: string, toUsername: string) {
  const target = await fetchPublicUserByUsername(toUsername);
  if (!target) return;
  await deleteDoc(doc(db, 'users', fromUid, 'outgoingRequests', target.firebaseUid)).catch(() => undefined);
  await deleteDoc(doc(db, 'users', target.firebaseUid, 'incomingRequests', fromUid)).catch(() => undefined);
}

export async function rejectFriendRequest(toUid: string, fromUsername: string) {
  const from = await fetchPublicUserByUsername(fromUsername);
  if (!from) return;
  await deleteDoc(doc(db, 'users', toUid, 'incomingRequests', from.firebaseUid)).catch(() => undefined);
  await deleteDoc(doc(db, 'users', from.firebaseUid, 'outgoingRequests', toUid)).catch(() => undefined);
}

export async function acceptFriendRequest(toUid: string, fromUsername: string) {
  const from = await fetchPublicUserByUsername(fromUsername);
  const toSnap = await getDoc(doc(db, 'users', toUid));
  if (!from || !toSnap.exists()) throw new Error('Usuario no encontrado');
  const toData = toSnap.data() as {
    username?: string;
    displayName?: string;
    avatarUrl?: string | null;
  };

  const toHandle = String(toData.username || '').toLowerCase();
  const toChip = {
    username: toHandle,
    displayName: toData.displayName || toHandle,
    avatarUrl: toData.avatarUrl ?? null,
    createdAt: serverTimestamp(),
  };
  const fromChip = {
    username: from.username,
    displayName: from.displayName,
    avatarUrl: from.avatarUrl,
    createdAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'users', toUid, 'friends', from.firebaseUid), fromChip);
  await setDoc(doc(db, 'users', from.firebaseUid, 'friends', toUid), toChip);
  await deleteDoc(doc(db, 'users', toUid, 'incomingRequests', from.firebaseUid)).catch(() => undefined);
  await deleteDoc(doc(db, 'users', from.firebaseUid, 'outgoingRequests', toUid)).catch(() => undefined);

  // Empareja chat privado en cuanto quedan amigos (permisos requieren amistad).
  await ensureChat(
    {
      firebaseUid: toUid,
      handle: toHandle,
      displayName: String(toData.displayName || toHandle),
      avatarUrl: toData.avatarUrl ?? null,
    },
    {
      uid: from.firebaseUid,
      username: from.username,
      displayName: from.displayName,
      avatarUrl: from.avatarUrl,
    },
  );
}

export async function removeFriendship(uid: string, otherUsername: string) {
  const other = await fetchPublicUserByUsername(otherUsername);
  if (!other) return;
  await deleteDoc(doc(db, 'users', uid, 'friends', other.firebaseUid)).catch(() => undefined);
  await deleteDoc(doc(db, 'users', other.firebaseUid, 'friends', uid)).catch(() => undefined);
}

export function listenIncomingRequests(
  uid: string,
  onChange: (requests: FriendRequest[]) => void,
): Unsubscribe {
  return onSnapshot(collection(db, 'users', uid, 'incomingRequests'), (snap) => {
    const list = snap.docs
      .map((item) => {
        const data = item.data() as Record<string, unknown>;
        return {
          id: item.id,
          ...chipFromData(item.id, data),
          createdAt: asIso(data.createdAt),
        };
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    onChange(list);
  });
}

export function listenFriends(uid: string, onChange: (friends: FriendChip[]) => void): Unsubscribe {
  return onSnapshot(collection(db, 'users', uid, 'friends'), (snap) => {
    const friends = snap.docs
      .map((item) => chipFromData(item.id, item.data() as Record<string, unknown>))
      .sort((a, b) => a.username.localeCompare(b.username, 'es'));
    onChange(friends);
  });
}

export async function listFriends(uid: string): Promise<FriendChip[]> {
  const snap = await getDocs(collection(db, 'users', uid, 'friends'));
  return snap.docs.map((item) => chipFromData(item.id, item.data() as Record<string, unknown>));
}

export async function followUser(me: MeProfile, targetUsername: string) {
  const target = await fetchPublicUserByUsername(targetUsername);
  if (!target) throw new Error('Usuario no encontrado');
  if (target.firebaseUid === me.firebaseUid) throw new Error('No puedes seguirte a ti mismo');

  const meChip = meToChip(me);
  const targetChip = {
    uid: target.firebaseUid,
    username: target.username,
    displayName: target.displayName,
    avatarUrl: target.avatarUrl,
  };

  await setDoc(doc(db, 'users', me.firebaseUid, 'following', target.firebaseUid), {
    ...targetChip,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'users', target.firebaseUid, 'followers', me.firebaseUid), {
    ...meChip,
    createdAt: serverTimestamp(),
  });
}

export async function unfollowUser(meUid: string, targetUsername: string) {
  const target = await fetchPublicUserByUsername(targetUsername);
  if (!target) return;
  await deleteDoc(doc(db, 'users', meUid, 'following', target.firebaseUid)).catch(() => undefined);
  await deleteDoc(doc(db, 'users', target.firebaseUid, 'followers', meUid)).catch(() => undefined);
}

export async function isFollowing(viewerUid: string, targetUsername: string) {
  const target = await fetchPublicUserByUsername(targetUsername);
  if (!target) return false;
  const snap = await getDoc(doc(db, 'users', viewerUid, 'following', target.firebaseUid));
  return snap.exists();
}

export function listenFollowers(uid: string, onChange: (users: FriendChip[]) => void): Unsubscribe {
  return onSnapshot(collection(db, 'users', uid, 'followers'), (snap) => {
    onChange(snap.docs.map((item) => chipFromData(item.id, item.data() as Record<string, unknown>)));
  });
}

export function listenFollowing(uid: string, onChange: (users: FriendChip[]) => void): Unsubscribe {
  return onSnapshot(collection(db, 'users', uid, 'following'), (snap) => {
    onChange(snap.docs.map((item) => chipFromData(item.id, item.data() as Record<string, unknown>)));
  });
}

export async function listFollowers(uid: string) {
  const snap = await getDocs(collection(db, 'users', uid, 'followers'));
  return snap.docs.map((item) => chipFromData(item.id, item.data() as Record<string, unknown>));
}

export async function listFollowing(uid: string) {
  const snap = await getDocs(collection(db, 'users', uid, 'following'));
  return snap.docs.map((item) => chipFromData(item.id, item.data() as Record<string, unknown>));
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
          mediaUrl: (data.mediaUrl as string | null) ?? null,
          mediaType: (data.mediaType as ChatMessage['mediaType']) ?? null,
          linkUrl: (data.linkUrl as string | null) ?? null,
        };
      }),
    );
  });
}

async function assertAreFriends(meUid: string, friendUid: string) {
  const mine = await getDoc(doc(db, 'users', meUid, 'friends', friendUid));
  if (mine.exists()) return;
  const theirs = await getDoc(doc(db, 'users', friendUid, 'friends', meUid));
  if (theirs.exists()) return;
  throw new Error('Solo puedes enviar mensajes privados a tus amigos');
}

export async function ensureChat(me: MeProfile, friend: FriendChip) {
  if (!friend.uid) throw new Error('Amigo inválido');
  await assertAreFriends(me.firebaseUid, friend.uid);

  const id = chatIdFor(me.firebaseUid, friend.uid);
  const ref = doc(db, 'chats', id);
  const participants = [me.firebaseUid, friend.uid].sort();
  const profiles = {
    [me.firebaseUid]: {
      username: me.handle.toLowerCase(),
      displayName: me.displayName,
      avatarUrl: me.avatarUrl,
    },
    [friend.uid]: {
      username: friend.username.toLowerCase(),
      displayName: friend.displayName,
      avatarUrl: friend.avatarUrl,
    },
  };

  let exists = false;
  try {
    exists = (await getDoc(ref)).exists();
  } catch {
    exists = false;
  }

  if (!exists) {
    await setDoc(ref, {
      participants,
      profiles,
      lastMessage: null,
      lastAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, { participants, profiles }, { merge: true });
  }
  return id;
}

export async function sendChatMessage(
  me: MeProfile,
  friend: FriendChip,
  text: string,
  extras?: {
    mediaUrl?: string | null;
    mediaType?: 'image' | 'audio' | 'file' | null;
    linkUrl?: string | null;
  },
) {
  const body = text.trim().slice(0, 2000);
  const mediaUrl = extras?.mediaUrl || null;
  const linkUrl = extras?.linkUrl?.trim() || null;
  if (!body && !mediaUrl && !linkUrl) throw new Error('Escribe un mensaje o adjunta algo');
  await assertAreFriends(me.firebaseUid, friend.uid);
  const id = await ensureChat(me, friend);
  const payload: Record<string, unknown> = {
    text: body || (mediaUrl ? '📎 Adjunto' : linkUrl || '🔗'),
    fromUid: me.firebaseUid,
    createdAt: serverTimestamp(),
  };
  if (mediaUrl) {
    payload.mediaUrl = mediaUrl;
    payload.mediaType = extras?.mediaType || 'file';
  }
  if (linkUrl) payload.linkUrl = linkUrl;

  await addDoc(collection(db, 'chats', id, 'messages'), payload);
  await updateDoc(doc(db, 'chats', id), {
    lastMessage: body || (mediaUrl ? 'Adjunto' : linkUrl) || '',
    lastAt: serverTimestamp(),
  });
  return id;
}

function postFromDoc(id: string, data: Record<string, unknown>): FsPost {
  return {
    id,
    authorUid: String(data.authorUid || ''),
    username: String(data.username || ''),
    type: (data.type as FsPost['type']) || 'text',
    caption: (data.caption as string | null) ?? null,
    mediaUrl: (data.mediaUrl as string | null) ?? null,
    visibility: (data.visibility as FsPost['visibility']) || 'public',
    createdAt: asIso(data.createdAt),
    likes: Number(data.likes ?? 0),
    viewerReaction: null,
  };
}

export function listenPostsByUsername(
  username: string,
  onChange: (posts: FsPost[]) => void,
  viewer?: { uid: string; isFriend?: boolean; isOwner?: boolean } | null,
): Unsubscribe {
  // Consulta simple (sin índice compuesto). La visibilidad se filtra en el cliente.
  const q = query(
    collection(db, 'posts'),
    where('username', '==', username.toLowerCase()),
    limit(60),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((docSnap) => postFromDoc(docSnap.id, docSnap.data() as Record<string, unknown>))
        .filter((post) => {
          if (post.visibility === 'public' || !post.visibility) return true;
          if (!viewer?.uid) return false;
          if (viewer.isOwner || post.authorUid === viewer.uid) return true;
          if (post.visibility === 'friends') return Boolean(viewer.isFriend);
          return false;
        });
      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      onChange(list);
    },
    () => onChange([]),
  );
}

export function listenRecentPosts(onChange: (posts: FsPost[]) => void): Unsubscribe {
  // Sin where+orderBy compuesto: evita errores mientras los índices se construyen.
  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(40));
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs
          .map((item) => postFromDoc(item.id, item.data() as Record<string, unknown>))
          .filter((post) => !post.visibility || post.visibility === 'public')
          .slice(0, 30),
      );
    },
    () => onChange([]),
  );
}

export async function createPost(input: {
  authorUid: string;
  username: string;
  type: 'photo' | 'video' | 'text';
  caption: string;
  mediaFile?: File | Blob | null;
  mediaUrl?: string | null;
  visibility?: 'public' | 'friends' | 'private';
}): Promise<{ id: string; mediaUrl: string | null; visibility: 'public' | 'friends' | 'private' }> {
  let mediaUrl: string | null = null;
  const visibility = input.visibility || 'public';

  if (input.type === 'photo' || input.type === 'video') {
    if (input.mediaFile) {
      const fileName =
        input.mediaFile instanceof File && input.mediaFile.name
          ? input.mediaFile.name
          : input.type === 'video'
            ? 'clip.mp4'
            : 'photo.jpg';
      mediaUrl = await uploadUserMedia(input.authorUid, input.mediaFile, fileName);
    } else if (input.mediaUrl?.startsWith('data:')) {
      const blob = await (await fetch(input.mediaUrl)).blob();
      mediaUrl = await uploadUserMedia(
        input.authorUid,
        blob,
        input.type === 'video' ? 'clip.mp4' : 'photo.jpg',
      );
    } else if (input.mediaUrl && /^https?:\/\//i.test(input.mediaUrl)) {
      mediaUrl = input.mediaUrl;
    } else {
      throw new Error(input.type === 'video' ? 'Elige un video para publicar' : 'Elige una foto para publicar');
    }
  }

  const ref = await addDoc(collection(db, 'posts'), {
    authorUid: input.authorUid,
    username: input.username.toLowerCase(),
    type: input.type,
    caption: input.caption.trim().slice(0, 2000) || null,
    mediaUrl,
    visibility,
    likes: 0,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, mediaUrl, visibility };
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
