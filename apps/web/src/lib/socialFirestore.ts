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
import { db, auth } from './firebase';
import { fetchPublicUserByUsername, type PublicFsUser } from './profileFirestore';
import { updateStoredMediaVisibility, uploadUserMedia } from './storage';

export type FriendshipStatus =
  | 'none'
  | 'friends'
  | 'pending_sent'
  | 'pending_received'
  | 'blocked'
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

export type PrivateCall = {
  id: string;
  status: 'ringing' | 'active' | 'ended';
  fromUid: string;
  fromName: string;
  fromHandle: string;
  fromAvatar: string | null;
  toUid: string;
  video: boolean;
  createdAt: string;
};

export type Conversation = FriendChip & {
  chatId: string;
  lastMessage: string | null;
  lastAt: string | null;
  call: PrivateCall | null;
};

export type FsPost = {
  id: string;
  authorUid: string;
  username: string;
  type: 'photo' | 'video' | 'text';
  caption: string | null;
  mediaUrl: string | null;
  visibility: 'public' | 'friends' | 'private';
  storagePath: string | null;
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

function parseCall(value: unknown): PrivateCall | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (data.status !== 'ringing' && data.status !== 'active' && data.status !== 'ended') return null;
  if (!data.fromUid || !data.toUid) return null;
  return {
    id: String(data.id || ''),
    status: data.status,
    fromUid: String(data.fromUid),
    fromName: String(data.fromName || data.fromHandle || ''),
    fromHandle: String(data.fromHandle || ''),
    fromAvatar: (data.fromAvatar as string | null) ?? null,
    toUid: String(data.toUid),
    video: Boolean(data.video),
    createdAt: asIso(data.createdAt),
  };
}

export function callRoomName(chatId: string) {
  return `dm_${chatId}`.slice(0, 64);
}

export async function startPrivateCall(
  chatId: string,
  me: MeProfile,
  friend: FriendChip,
  video: boolean,
) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await updateDoc(doc(db, 'chats', chatId), {
    call: {
      id,
      status: 'ringing',
      fromUid: me.firebaseUid,
      fromName: me.displayName || me.handle,
      fromHandle: me.handle,
      fromAvatar: me.avatarUrl,
      toUid: friend.uid,
      video,
      createdAt: serverTimestamp(),
    },
  });
  return id;
}

export async function answerPrivateCall(chatId: string) {
  await updateDoc(doc(db, 'chats', chatId), { 'call.status': 'active' });
}

export async function endPrivateCall(chatId: string) {
  await updateDoc(doc(db, 'chats', chatId), { call: null }).catch(() => undefined);
}

export async function beatPresence(uid: string) {
  await setDoc(doc(db, 'users', uid, 'presence', 'now'), {
    at: serverTimestamp(),
    online: true,
  });
}

export function listenPresence(uid: string, onChange: (online: boolean) => void): Unsubscribe {
  return onSnapshot(doc(db, 'users', uid, 'presence', 'now'), (snap) => {
    const at = snap.data()?.at;
    if (!at) {
      onChange(false);
      return;
    }
    const age = Date.now() - new Date(asIso(at)).getTime();
    onChange(age < 90_000);
  });
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

export async function getFriendshipStatusByUid(
  viewerUid: string,
  targetUid: string,
): Promise<FriendshipStatus> {
  if (!viewerUid || !targetUid) return 'none';
  if (viewerUid === targetUid) return 'self';

  const blockedSnap = await getDoc(doc(db, 'users', viewerUid, 'blocked', targetUid));
  if (blockedSnap.exists()) return 'blocked';

  const friendSnap = await getDoc(doc(db, 'users', viewerUid, 'friends', targetUid));
  if (friendSnap.exists()) return 'friends';

  const sentSnap = await getDoc(doc(db, 'users', viewerUid, 'outgoingRequests', targetUid));
  if (sentSnap.exists()) return 'pending_sent';

  const recvSnap = await getDoc(doc(db, 'users', viewerUid, 'incomingRequests', targetUid));
  if (recvSnap.exists()) return 'pending_received';

  return 'none';
}

export async function getFriendshipStatus(
  viewerUid: string,
  targetUsername: string,
): Promise<FriendshipStatus> {
  const target = await fetchPublicUserByUsername(targetUsername);
  if (!target) return 'none';
  return getFriendshipStatusByUid(viewerUid, target.firebaseUid);
}

export async function sendFriendRequest(from: MeProfile | PublicFsUser, toUsername: string) {
  const fromUid = from.firebaseUid;
  const fromUsername = 'handle' in from ? from.handle : from.username;
  const target = await fetchPublicUserByUsername(toUsername);
  if (!target) throw new Error('Usuario no encontrado en Firebase. Pídele que guarde su perfil.');
  if (target.firebaseUid === fromUid) throw new Error('No puedes enviarte solicitud a ti mismo');

  const blocked = await getDoc(doc(db, 'users', fromUid, 'blocked', target.firebaseUid));
  if (blocked.exists()) throw new Error('Desbloquea a esta persona para enviarle solicitud.');
  const blockedBy = await getDoc(doc(db, 'users', target.firebaseUid, 'blocked', fromUid)).catch(
    () => null,
  );
  if (blockedBy?.exists()) throw new Error('No puedes enviar solicitud a este usuario.');

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

export async function isBlocked(meUid: string, targetUid: string) {
  if (!meUid || !targetUid) return false;
  const snap = await getDoc(doc(db, 'users', meUid, 'blocked', targetUid));
  return snap.exists();
}

export async function blockUser(
  me: MeProfile,
  target: { uid: string; username: string; displayName: string; avatarUrl: string | null },
) {
  if (!target.uid || target.uid === me.firebaseUid) {
    throw new Error('No puedes bloquearte a ti mismo');
  }
  await setDoc(doc(db, 'users', me.firebaseUid, 'blocked', target.uid), {
    uid: target.uid,
    username: target.username,
    displayName: target.displayName,
    avatarUrl: target.avatarUrl,
    createdAt: serverTimestamp(),
  });
  await deleteDoc(doc(db, 'users', me.firebaseUid, 'friends', target.uid)).catch(() => undefined);
  await deleteDoc(doc(db, 'users', target.uid, 'friends', me.firebaseUid)).catch(() => undefined);
  await deleteDoc(doc(db, 'users', me.firebaseUid, 'outgoingRequests', target.uid)).catch(() => undefined);
  await deleteDoc(doc(db, 'users', me.firebaseUid, 'incomingRequests', target.uid)).catch(() => undefined);
  await deleteDoc(doc(db, 'users', target.uid, 'outgoingRequests', me.firebaseUid)).catch(() => undefined);
  await deleteDoc(doc(db, 'users', target.uid, 'incomingRequests', me.firebaseUid)).catch(() => undefined);
  await deleteDoc(doc(db, 'users', me.firebaseUid, 'following', target.uid)).catch(() => undefined);
  await deleteDoc(doc(db, 'users', target.uid, 'followers', me.firebaseUid)).catch(() => undefined);
}

export async function unblockUser(meUid: string, targetUid: string) {
  if (!meUid || !targetUid) return;
  await deleteDoc(doc(db, 'users', meUid, 'blocked', targetUid)).catch(() => undefined);
}

function listenRequestCollection(
  uid: string,
  subcollection: 'incomingRequests' | 'outgoingRequests',
  onChange: (requests: FriendRequest[]) => void,
): Unsubscribe {
  return onSnapshot(collection(db, 'users', uid, subcollection), (snap) => {
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

export function listenIncomingRequests(
  uid: string,
  onChange: (requests: FriendRequest[]) => void,
): Unsubscribe {
  return listenRequestCollection(uid, 'incomingRequests', onChange);
}

export function listenOutgoingRequests(
  uid: string,
  onChange: (requests: FriendRequest[]) => void,
): Unsubscribe {
  return listenRequestCollection(uid, 'outgoingRequests', onChange);
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

export async function isFollowingUid(viewerUid: string, targetUid: string) {
  if (!viewerUid || !targetUid) return false;
  const snap = await getDoc(doc(db, 'users', viewerUid, 'following', targetUid));
  return snap.exists();
}

export async function isFollowing(viewerUid: string, targetUsername: string) {
  const target = await fetchPublicUserByUsername(targetUsername);
  if (!target) return false;
  return isFollowingUid(viewerUid, target.firebaseUid);
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
        call?: unknown;
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
        call: parseCall(data.call),
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
  const blocked = await getDoc(doc(db, 'users', meUid, 'blocked', friendUid));
  if (blocked.exists()) throw new Error('Desbloquea a este usuario para chatear.');
  const blockedBy = await getDoc(doc(db, 'users', friendUid, 'blocked', meUid));
  if (blockedBy.exists()) throw new Error('No puedes enviar mensajes a este usuario.');
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
    storagePath: (data.storagePath as string | null) ?? null,
    createdAt: asIso(data.createdAt),
    likes: Number(data.likes ?? 0),
    viewerReaction: null,
  };
}

function sortPosts(list: FsPost[]) {
  return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function listenPostsByUsername(
  username: string,
  onChange: (posts: FsPost[]) => void,
  viewer?: { uid: string; isFriend?: boolean; isOwner?: boolean; profileUid?: string } | null,
): Unsubscribe {
  const handle = username.toLowerCase();

  // Owner queries must filter by authorUid. A username-only query is rejected by
  // Firestore rules (rules are not filters) and the error handler used to wipe the library.
  if (viewer?.isOwner && viewer.uid) {
    const q = query(collection(db, 'posts'), where('authorUid', '==', viewer.uid), limit(80));
    return onSnapshot(
      q,
      (snap) =>
        onChange(
          sortPosts(snap.docs.map((item) => postFromDoc(item.id, item.data() as Record<string, unknown>))),
        ),
      (err) => {
        console.error('No se pudieron cargar las publicaciones del perfil', err);
      },
    );
  }

  if (!viewer?.uid) {
    onChange([]);
    return () => undefined;
  }

  const visibilities: Array<FsPost['visibility']> = viewer.isFriend ? ['public', 'friends'] : ['public'];
  const buckets: Array<FsPost[]> = visibilities.map(() => []);
  const authorUid = viewer.profileUid || '';
  const unsubs = visibilities.map((visibility, index) => {
    const q =
      visibility === 'friends' && authorUid
        ? query(
            collection(db, 'posts'),
            where('authorUid', '==', authorUid),
            where('visibility', '==', 'friends'),
            limit(60),
          )
        : query(
            collection(db, 'posts'),
            where('username', '==', handle),
            where('visibility', '==', visibility),
            limit(60),
          );
    return onSnapshot(
      q,
      (snap) => {
        buckets[index] = snap.docs.map((item) => postFromDoc(item.id, item.data() as Record<string, unknown>));
        const merged = new Map<string, FsPost>();
        for (const list of buckets) {
          for (const post of list) merged.set(post.id, post);
        }
        onChange(sortPosts([...merged.values()]));
      },
      (err) => {
        console.error('No se pudieron cargar publicaciones', visibility, err);
      },
    );
  });
  return () => unsubs.forEach((stop) => stop());
}

export function listenRecentPosts(onChange: (posts: FsPost[]) => void): Unsubscribe {
  if (!auth.currentUser) {
    onChange([]);
    return () => undefined;
  }
  const q = query(
    collection(db, 'posts'),
    where('visibility', '==', 'public'),
    orderBy('createdAt', 'desc'),
    limit(80),
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((item) => postFromDoc(item.id, item.data() as Record<string, unknown>)).slice(0, 60));
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
}): Promise<{
  id: string;
  mediaUrl: string | null;
  storagePath: string | null;
  visibility: 'public' | 'friends' | 'private';
}> {
  let mediaUrl: string | null = null;
  let storagePath: string | null = null;
  const visibility = input.visibility || 'public';

  if (input.type === 'photo' || input.type === 'video') {
    if (input.mediaFile) {
      const fileName =
        input.mediaFile instanceof File && input.mediaFile.name
          ? input.mediaFile.name
          : input.type === 'video'
            ? 'clip.mp4'
            : 'photo.jpg';
      const uploaded = await uploadUserMedia(input.authorUid, input.mediaFile, fileName, visibility);
      mediaUrl = uploaded.url;
      storagePath = uploaded.storagePath;
    } else if (input.mediaUrl?.startsWith('data:')) {
      const blob = await (await fetch(input.mediaUrl)).blob();
      const uploaded = await uploadUserMedia(
        input.authorUid,
        blob,
        input.type === 'video' ? 'clip.mp4' : 'photo.jpg',
        visibility,
      );
      mediaUrl = uploaded.url;
      storagePath = uploaded.storagePath;
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
    storagePath,
    visibility,
    likes: 0,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, mediaUrl, storagePath, visibility };
}

export async function updatePostVisibility(
  postId: string,
  authorUid: string,
  visibility: 'public' | 'friends' | 'private',
) {
  const ref = doc(db, 'posts', postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Publicación no encontrada');
  if (String(snap.data().authorUid || '') !== authorUid) {
    throw new Error('No autorizado');
  }
  await updateDoc(ref, { visibility });
  const storagePath = String(snap.data().storagePath || '');
  if (storagePath) {
    await updateStoredMediaVisibility(storagePath, visibility).catch(() => undefined);
  }
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

export type PostReactionStats = {
  likes: number;
  dislikes: number;
  viewerReaction: 'like' | 'dislike' | null;
};

export function listenPostReactions(
  postId: string,
  viewerUid: string | null | undefined,
  onChange: (stats: PostReactionStats) => void,
): Unsubscribe {
  return onSnapshot(collection(db, 'posts', postId, 'reactions'), (snap) => {
    let likes = 0;
    let dislikes = 0;
    let viewerReaction: PostReactionStats['viewerReaction'] = null;
    for (const item of snap.docs) {
      const type = String(item.data().type || '');
      if (type === 'like') likes += 1;
      if (type === 'dislike') dislikes += 1;
      if (viewerUid && item.id === viewerUid && (type === 'like' || type === 'dislike')) {
        viewerReaction = type;
      }
    }
    onChange({ likes, dislikes, viewerReaction });
  });
}

export async function setPostReaction(
  postId: string,
  uid: string,
  reaction: 'like' | 'dislike' | null,
) {
  const ref = doc(db, 'posts', postId, 'reactions', uid);
  if (!reaction) {
    await deleteDoc(ref);
    return;
  }
  await setDoc(ref, { type: reaction, updatedAt: serverTimestamp() });
}

export type PostComment = {
  id: string;
  authorUid: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  text: string;
  createdAt: string;
};

function commentsFromSnap(snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }): PostComment[] {
  return snap.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      authorUid: String(data.authorUid || ''),
      username: String(data.username || ''),
      displayName: String(data.displayName || data.username || ''),
      avatarUrl: (data.avatarUrl as string | null) ?? null,
      text: String(data.text || ''),
      createdAt: asIso(data.createdAt),
    };
  });
}

export function listenPostComments(
  postId: string,
  onChange: (comments: PostComment[]) => void,
): Unsubscribe {
  const col = collection(db, 'posts', postId, 'comments');
  const q = query(col, orderBy('createdAt', 'asc'), limit(80));
  let fallback: Unsubscribe | null = null;
  const primary = onSnapshot(
    q,
    (snap) => onChange(commentsFromSnap(snap)),
    () => {
      fallback = onSnapshot(col, (snap) => {
        onChange(
          commentsFromSnap(snap)
            .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
            .slice(0, 80),
        );
      });
    },
  );
  return () => {
    primary();
    fallback?.();
  };
}

export async function addPostComment(
  postId: string,
  author: MeProfile,
  text: string,
) {
  const body = text.trim().slice(0, 500);
  if (!body) throw new Error('Escribe un comentario');
  await addDoc(collection(db, 'posts', postId, 'comments'), {
    authorUid: author.firebaseUid,
    username: author.handle.toLowerCase(),
    displayName: author.displayName || author.handle,
    avatarUrl: author.avatarUrl,
    text: body,
    createdAt: serverTimestamp(),
  });
}

export async function deletePostComment(postId: string, commentId: string) {
  await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
}
