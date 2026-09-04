import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { api, apiPublic } from './api';
import { db, auth } from './firebase';
import { fetchPublicUserByUsername, fetchPublicUserByUid, type PublicFsUser } from './profileFirestore';
import { readIgnoredSuggestionUids } from './ignoredSuggestions';
import {
  diversifyReelFeed,
  isReelInPublicFeed,
  reelLifecycleFromCreatedAt,
  targetReelVisibility,
} from './reelLifecycle';
import { isBoomClipPost, isPublicationPost, MAX_CLIP_DURATION_SECONDS, BOOM_CLIP_CAPTION_MAX, FLASH_BOOM_CAPTION_MAX } from './contentType';
import { isStoryActive, isStoryPost, storyExpiresAtFromNow } from './storyLifecycle';
import {
  updateStoredMediaVisibility,
  uploadUserMedia,
  uploadUserMediaMany,
  type UserMediaStorageKind,
} from './storage';
import { readVideoSizeAndPortraitPoster } from './videoPoster';
import {
  parseMediaOverlays,
  serializeMediaOverlays,
  type MediaOverlayItem,
} from './mediaOverlays';

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
  mediaType?: 'image' | 'audio' | 'video' | 'file' | 'call' | null;
  linkUrl?: string | null;
  /** sent = enviado, delivered = entregado, read = leído */
  status?: 'sent' | 'delivered' | 'read';
  editedAt?: string | null;
  deleted?: boolean;
  /** Uids que ocultaron el mensaje solo para sí. */
  hiddenFor?: string[];
  callMeta?: {
    video: boolean;
    outcome: 'completed' | 'missed' | 'cancelled' | 'declined';
    durationSec: number;
  } | null;
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
  /** Mensajes no leídos para el viewer actual. */
  unread: number;
};

export type FsPost = {
  id: string;
  authorUid: string;
  username: string;
  type: 'photo' | 'video' | 'text';
  caption: string | null;
  mediaUrl: string | null;
  /** Galería de fotos en publicaciones (primera = mediaUrl). */
  mediaUrls?: string[];
  visibility: 'public' | 'friends' | 'private' | 'circle';
  storagePath: string | null;
  createdAt: string;
  likes: number;
  viewerReaction: string | null;
  /** story = historia 24h; post = video publicación normal */
  postFormat?: 'story' | 'post';
  storyExpiresAtMs?: number;
  durationSec?: number;
  reelFeedUntilMs?: number;
  reelFriendsAtMs?: number;
  reelPrivateAtMs?: number;
  /** Miniatura vertical generada al subir Boom Clip. */
  thumbUrl?: string | null;
  mediaWidth?: number;
  mediaHeight?: number;
  /** Repost: apunta al contenido y autor originales. */
  sharedFromPostId?: string;
  sharedFromAuthorUid?: string;
  sharedFromUsername?: string;
  /** Stickers/GIF sobre la foto o el video (Publicación, Boom Clip, Flash Boom). */
  overlays?: MediaOverlayItem[];
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

function userFromChip(uid: string, chip: Partial<FriendChip>, fallbackUsername: string): PublicFsUser {
  const username = String(chip.username || fallbackUsername || '')
    .trim()
    .toLowerCase();
  return {
    id: uid,
    firebaseUid: uid,
    username,
    email: '',
    displayName: String(chip.displayName || username),
    avatarUrl: chip.avatarUrl ?? null,
    bio: null,
    birthDate: null,
    category: null,
    coinsBalance: 0,
    levelXp: 0,
  };
}

async function resolveFollowTargetFromApi(username: string): Promise<PublicFsUser | null> {
  const needle = String(username || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  if (!needle) return null;
  try {
    const fetcher = auth.currentUser ? api : apiPublic;
    const data = await fetcher<{
      users: Array<{
        uid?: string | null;
        username: string;
        displayName?: string;
        avatarUrl?: string | null;
      }>;
    }>(`/api/social/search?q=${encodeURIComponent(needle)}`);
    const match = (data.users || []).find((row) => row.username?.toLowerCase() === needle);
    if (!match?.uid) return null;
    const fromFs = await fetchPublicUserByUid(match.uid);
    if (fromFs) return fromFs;
    return userFromChip(
      match.uid,
      {
        uid: match.uid,
        username: match.username,
        displayName: match.displayName || match.username,
        avatarUrl: match.avatarUrl ?? null,
      },
      needle,
    );
  } catch {
    return null;
  }
}

async function resolveFollowTarget(
  targetUsername: string,
  targetUid?: string | null,
  hint?: Partial<FriendChip> | null,
): Promise<PublicFsUser | null> {
  const uid = String(targetUid || hint?.uid || '').trim();
  if (uid) {
    const fromFs = await fetchPublicUserByUid(uid);
    if (fromFs) return fromFs;
    return userFromChip(uid, hint || {}, targetUsername);
  }

  const needle = String(targetUsername || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  if (!needle) return null;

  const byUsername = await fetchPublicUserByUsername(needle);
  if (byUsername) return byUsername;

  return resolveFollowTargetFromApi(needle);
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

export async function sendFriendRequest(
  from: MeProfile | PublicFsUser,
  toUsername: string,
  toUid?: string,
) {
  const fromUid = from.firebaseUid;
  const fromUsername = String(('handle' in from ? from.handle : from.username) || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
  const needle = String(toUsername || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
  const explicitUid = String(toUid || '').trim();

  // Preferir UID (Google / API / búsqueda). No exigir perfil “completo” ni birthDate.
  let target = explicitUid ? await fetchPublicUserByUid(explicitUid) : null;
  if (!target && needle) target = await fetchPublicUserByUsername(needle);

  const targetUid = target?.firebaseUid || explicitUid;
  const targetUsername = (target?.username || needle).toLowerCase();
  if (!targetUid || !targetUsername) {
    throw new Error('No pudimos identificar a esta persona. Actualiza e inténtalo de nuevo.');
  }
  if (targetUid === fromUid) throw new Error('No puedes enviarte solicitud a ti mismo');

  const blocked = await getDoc(doc(db, 'users', fromUid, 'blocked', targetUid));
  if (blocked.exists()) throw new Error('Desbloquea a esta persona para enviarle solicitud.');
  const blockedBy = await getDoc(doc(db, 'users', targetUid, 'blocked', fromUid)).catch(() => null);
  if (blockedBy?.exists()) throw new Error('No puedes enviar solicitud a este usuario.');

  const status = await getFriendshipStatusByUid(fromUid, targetUid);
  if (status === 'friends') return;
  if (status === 'pending_sent') return;
  if (status === 'pending_received') {
    await acceptFriendRequest(fromUid, targetUid);
    return;
  }

  const fromChip = {
    username: fromUsername || fromUid.slice(0, 8),
    displayName: from.displayName || fromUsername || 'Usuario',
    avatarUrl: from.avatarUrl,
    createdAt: serverTimestamp(),
  };
  const toChip = {
    username: targetUsername,
    displayName: target?.displayName || targetUsername,
    avatarUrl: target?.avatarUrl ?? null,
    createdAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'users', targetUid, 'incomingRequests', fromUid), fromChip);
  await setDoc(doc(db, 'users', fromUid, 'outgoingRequests', targetUid), toChip);
}

export async function cancelFriendRequest(fromUid: string, toUsernameOrUid: string) {
  const needle = String(toUsernameOrUid || '').trim();
  if (!needle) throw new Error('Solicitud inválida');

  let target =
    (await fetchPublicUserByUsername(needle)) || (await fetchPublicUserByUid(needle));

  // Doc de enviadas: id = uid del destinatario.
  if (!target) {
    const outgoing = await getDoc(doc(db, 'users', fromUid, 'outgoingRequests', needle));
    if (outgoing.exists()) {
      target = await fetchPublicUserByUid(needle);
      if (!target) {
        // Limpia al menos tu copia pendiente.
        await deleteDoc(doc(db, 'users', fromUid, 'outgoingRequests', needle));
        return;
      }
    }
  }

  if (!target) {
    throw new Error('No se encontró al usuario de la solicitud. Intenta de nuevo.');
  }

  await deleteDoc(doc(db, 'users', fromUid, 'outgoingRequests', target.firebaseUid));
  await deleteDoc(doc(db, 'users', target.firebaseUid, 'incomingRequests', fromUid)).catch(
    () => undefined,
  );
}

export async function rejectFriendRequest(toUid: string, fromUsernameOrUid: string) {
  const from =
    (await fetchPublicUserByUsername(fromUsernameOrUid)) ||
    (await fetchPublicUserByUid(fromUsernameOrUid));
  if (!from) {
    // Limpia por uid de doc si el perfil ya no existe.
    const maybeUid = String(fromUsernameOrUid || '').trim();
    if (maybeUid) {
      await deleteDoc(doc(db, 'users', toUid, 'incomingRequests', maybeUid)).catch(() => undefined);
    }
    return;
  }
  await deleteDoc(doc(db, 'users', toUid, 'incomingRequests', from.firebaseUid)).catch(() => undefined);
  await deleteDoc(doc(db, 'users', from.firebaseUid, 'outgoingRequests', toUid)).catch(() => undefined);
}

export async function acceptFriendRequest(toUid: string, fromUsernameOrUid: string) {
  const needle = String(fromUsernameOrUid || '').trim();
  if (!needle) throw new Error('Solicitud inválida');

  let from =
    (await fetchPublicUserByUsername(needle)) || (await fetchPublicUserByUid(needle));

  // La solicitud entrante se guarda con id = uid del remitente.
  if (!from) {
    const incoming = await getDoc(doc(db, 'users', toUid, 'incomingRequests', needle));
    if (incoming.exists()) {
      from = await fetchPublicUserByUid(needle);
    }
  }
  if (!from) throw new Error('No se encontró al usuario que envió la solicitud');

  const toSnap = await getDoc(doc(db, 'users', toUid));
  if (!toSnap.exists()) throw new Error('Tu perfil no está listo. Guarda tu perfil e intenta de nuevo.');
  const toData = toSnap.data() as {
    username?: string;
    displayName?: string;
    avatarUrl?: string | null;
  };

  const toHandle = String(toData.username || '').toLowerCase();
  if (!toHandle) throw new Error('Tu perfil no tiene username. Edítalo y vuelve a aceptar.');

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

  // Chat opcional: no debe impedir aceptar la amistad.
  try {
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
  } catch (error) {
    console.warn('[friends] ensureChat after accept', error);
  }
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

export async function followUser(
  me: MeProfile,
  targetUsername: string,
  targetUid?: string | null,
  targetHint?: Partial<FriendChip> | null,
) {
  const target = await resolveFollowTarget(targetUsername, targetUid, targetHint);
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

export async function unfollowUser(
  meUid: string,
  targetUsername: string,
  targetUid?: string | null,
  targetHint?: Partial<FriendChip> | null,
) {
  const target = await resolveFollowTarget(targetUsername, targetUid, targetHint);
  if (!target) return;
  await deleteDoc(doc(db, 'users', meUid, 'following', target.firebaseUid)).catch(() => undefined);
  await deleteDoc(doc(db, 'users', target.firebaseUid, 'followers', meUid)).catch(() => undefined);
}

export async function isFollowingUid(viewerUid: string, targetUid: string) {
  if (!viewerUid || !targetUid) return false;
  const snap = await getDoc(doc(db, 'users', viewerUid, 'following', targetUid));
  return snap.exists();
}

export async function isFollowing(viewerUid: string, targetUsername: string, targetUid?: string | null) {
  if (targetUid) return isFollowingUid(viewerUid, targetUid);
  const target = await fetchPublicUserByUsername(targetUsername);
  if (!target) return false;
  return isFollowingUid(viewerUid, target.firebaseUid);
}

export type SuggestedCreator = FriendChip & { isFollowing: boolean };

/** Creadores sugeridos desde Firestore (misma fuente que Seguir). */
export async function browseSuggestedCreators(
  viewerUid?: string,
  excludeUsername?: string,
  options?: { limit?: number; excludeUids?: Iterable<string> },
): Promise<SuggestedCreator[]> {
  const followingIds = new Set<string>();
  if (viewerUid) {
    const followingSnap = await getDocs(collection(db, 'users', viewerUid, 'following'));
    for (const docSnap of followingSnap.docs) followingIds.add(docSnap.id);
  }

  const extraExclude = new Set(
    [...(options?.excludeUids || []), ...readIgnoredSuggestionUids(viewerUid)]
      .map((id) => String(id).trim())
      .filter(Boolean),
  );

  const usersSnap = await getDocs(query(collection(db, 'users'), limit(96)));
  const exclude = String(excludeUsername || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');

  const candidates = usersSnap.docs
    .map((item) => {
      const data = item.data() as Record<string, unknown>;
      const username = String(data.username || '')
        .trim()
        .toLowerCase();
      const uid = item.id;
      if (!username || uid === viewerUid || username === exclude) return null;
      if (followingIds.has(uid) || extraExclude.has(uid)) return null;
      return {
        uid,
        username,
        displayName: String(data.displayName || data.username || username),
        avatarUrl: (data.avatarUrl as string | null) ?? null,
        isFollowing: false as boolean,
      } satisfies SuggestedCreator;
    })
    .filter((row): row is SuggestedCreator => Boolean(row));

  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = candidates[i]!;
    candidates[i] = candidates[j]!;
    candidates[j] = a;
  }

  const resultLimit = Math.max(1, options?.limit ?? 8);
  return candidates.slice(0, resultLimit);
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
        unread?: Record<string, number>;
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
        unread: Math.max(0, Number(data.unread?.[uid] || 0)),
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
    const list: ChatMessage[] = [];
    for (const item of snap.docs) {
      const data = item.data();
      const deleted = Boolean(data.deleted);
      const hiddenFor = Array.isArray(data.hiddenFor)
        ? (data.hiddenFor as string[]).map(String)
        : [];
      if (hiddenFor.includes(viewerUid)) continue;
      const callMetaRaw = data.callMeta as ChatMessage['callMeta'] | undefined;
      list.push({
        id: item.id,
        text: deleted ? '' : String(data.text || ''),
        fromUid: String(data.fromUid || ''),
        mine: data.fromUid === viewerUid,
        createdAt: asIso(data.createdAt),
        mediaUrl: deleted ? null : ((data.mediaUrl as string | null) ?? null),
        mediaType: deleted ? null : ((data.mediaType as ChatMessage['mediaType']) ?? null),
        linkUrl: deleted ? null : ((data.linkUrl as string | null) ?? null),
        status: (data.status as ChatMessage['status']) || 'sent',
        editedAt: data.editedAt ? asIso(data.editedAt) : null,
        deleted,
        hiddenFor,
        callMeta:
          callMetaRaw && typeof callMetaRaw === 'object'
            ? {
                video: Boolean(callMetaRaw.video),
                outcome:
                  (callMetaRaw.outcome as NonNullable<ChatMessage['callMeta']>['outcome']) ||
                  'completed',
                durationSec: Math.max(0, Number(callMetaRaw.durationSec) || 0),
              }
            : null,
      });
    }
    onChange(list);
  });
}

export async function editChatMessage(chatId: string, messageId: string, text: string) {
  const body = text.trim().slice(0, 2000);
  if (!body) throw new Error('El mensaje no puede quedar vacío');
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    text: body,
    editedAt: serverTimestamp(),
  });
}

/** Elimina el mensaje para todos (soft-delete visible). Solo el autor. */
export async function deleteChatMessageForEveryone(chatId: string, messageId: string) {
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    deleted: true,
    text: 'Mensaje eliminado',
    mediaUrl: null,
    mediaType: null,
    linkUrl: null,
    editedAt: serverTimestamp(),
  });
}

/** @deprecated usa deleteChatMessageForEveryone */
export async function deleteChatMessage(chatId: string, messageId: string) {
  return deleteChatMessageForEveryone(chatId, messageId);
}

/** Oculta el mensaje solo para el viewer actual. */
export async function deleteChatMessageForMe(chatId: string, messageId: string, viewerUid: string) {
  const uid = String(viewerUid || '').trim();
  if (!uid) throw new Error('Sesión inválida');
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    hiddenFor: arrayUnion(uid),
  });
}

function formatCallDuration(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** Guarda en el chat un evento de llamada (hecha / perdida / rechazada). Idempotente por callId. */
export async function postCallHistoryMessage(
  chatId: string,
  fromUid: string,
  input: {
    callId: string;
    video: boolean;
    outcome: 'completed' | 'missed' | 'cancelled' | 'declined';
    durationSec: number;
  },
) {
  const id = `call_${String(input.callId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}`;
  if (!chatId || !fromUid || id === 'call_') return;

  let text: string;
  if (input.outcome === 'completed') {
    text = `${input.video ? 'Videollamada' : 'Llamada'} · ${formatCallDuration(input.durationSec)}`;
  } else if (input.outcome === 'declined') {
    text = `${input.video ? 'Videollamada' : 'Llamada'} rechazada`;
  } else if (input.outcome === 'cancelled') {
    text = `${input.video ? 'Videollamada' : 'Llamada'} cancelada`;
  } else {
    text = `${input.video ? 'Videollamada' : 'Llamada'} perdida`;
  }

  await setDoc(
    doc(db, 'chats', chatId, 'messages', id),
    {
      text,
      fromUid,
      createdAt: serverTimestamp(),
      status: 'sent',
      deleted: false,
      mediaType: 'call',
      callMeta: {
        video: Boolean(input.video),
        outcome: input.outcome,
        durationSec: Math.max(0, Math.floor(input.durationSec)),
      },
    },
    { merge: true },
  );

  await updateDoc(doc(db, 'chats', chatId), {
    lastMessage: text,
    lastAt: serverTimestamp(),
    lastFromUid: fromUid,
  }).catch(() => undefined);
}

export async function markMessagesDelivered(chatId: string, _viewerUid: string, messages: ChatMessage[]) {
  const pending = messages.filter(
    (item) => !item.mine && !item.deleted && item.status === 'sent',
  );
  if (pending.length === 0) return;
  const batch = writeBatch(db);
  for (const item of pending.slice(-40)) {
    batch.update(doc(db, 'chats', chatId, 'messages', item.id), { status: 'delivered' });
  }
  await batch.commit().catch((err) => {
    console.warn('[chat] mark delivered failed', err);
  });
}

export async function markMessagesRead(chatId: string, viewerUid: string, messages: ChatMessage[]) {
  // Solo sent/delivered → read (no tocar ya leídos).
  const pending = messages.filter(
    (item) =>
      !item.mine &&
      !item.deleted &&
      (item.status === 'sent' || item.status === 'delivered' || !item.status),
  );
  if (pending.length === 0) {
    // Igual limpia badge si quedó residual.
    await updateDoc(doc(db, 'chats', chatId), {
      [`unread.${viewerUid}`]: 0,
    }).catch(() => undefined);
    return;
  }
  const batch = writeBatch(db);
  for (const item of pending.slice(-40)) {
    batch.update(doc(db, 'chats', chatId, 'messages', item.id), { status: 'read' });
  }
  batch.update(doc(db, 'chats', chatId), { [`unread.${viewerUid}`]: 0 });
  await batch.commit().catch((err) => {
    console.warn('[chat] mark read failed', err);
  });
}

/**
 * Marca como entregados los mensajes entrantes de varios chats.
 * Se usa con presencia (app abierta / en línea) aunque el chat no esté abierto.
 */
export async function markInboxDelivered(uid: string, chatIds: string[]) {
  const ids = chatIds.filter(Boolean).slice(0, 20);
  for (const chatId of ids) {
    try {
      const snap = await getDocs(
        query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'desc'), limit(40)),
      );
      const batch = writeBatch(db);
      let count = 0;
      for (const item of snap.docs) {
        const data = item.data();
        if (data.deleted) continue;
        if (String(data.fromUid || '') === uid) continue;
        const status = (data.status as string) || 'sent';
        if (status !== 'sent') continue;
        batch.update(item.ref, { status: 'delivered' });
        count += 1;
      }
      if (count > 0) await batch.commit();
    } catch (err) {
      console.warn('[chat] inbox deliver failed', chatId, err);
    }
  }
}

export async function deleteConversation(chatId: string, uid: string) {
  const ref = doc(db, 'chats', chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const participants = (snap.data().participants as string[]) || [];
  if (!participants.includes(uid)) throw new Error('No puedes borrar esta conversación');
  for (;;) {
    const msgs = await getDocs(query(collection(db, 'chats', chatId, 'messages'), limit(400)));
    if (msgs.empty) break;
    const batch = writeBatch(db);
    msgs.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
  await deleteDoc(ref);
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
    mediaType?: 'image' | 'audio' | 'video' | 'file' | null;
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
    status: 'sent',
    deleted: false,
  };
  if (mediaUrl) {
    payload.mediaUrl = mediaUrl;
    payload.mediaType = extras?.mediaType || 'file';
  }
  if (linkUrl) payload.linkUrl = linkUrl;

  await addDoc(collection(db, 'chats', id, 'messages'), payload);
  const unreadKey = `unread.${friend.uid}`;
  await updateDoc(doc(db, 'chats', id), {
    lastMessage: body || (mediaUrl ? 'Adjunto' : linkUrl) || '',
    lastAt: serverTimestamp(),
    lastFromUid: me.firebaseUid,
    [unreadKey]: increment(1),
  });
  return id;
}

function postFromDoc(id: string, data: Record<string, unknown>): FsPost {
  const overlays = parseMediaOverlays(data.overlays);
  return {
    id,
    authorUid: String(data.authorUid || ''),
    username: String(data.username || ''),
    type: (data.type as FsPost['type']) || 'text',
    caption: (data.caption as string | null) ?? null,
    mediaUrl: (data.mediaUrl as string | null) ?? null,
    mediaUrls: Array.isArray(data.mediaUrls)
      ? (data.mediaUrls as string[]).filter((u) => typeof u === 'string' && u.length > 0)
      : undefined,
    visibility: (data.visibility as FsPost['visibility']) || 'public',
    storagePath: (data.storagePath as string | null) ?? null,
    createdAt: asIso(data.createdAt),
    likes: Number(data.likes ?? 0),
    viewerReaction: null,
    postFormat: (data.postFormat as FsPost['postFormat']) || undefined,
    storyExpiresAtMs: Number(data.storyExpiresAtMs) || undefined,
    durationSec: Number(data.durationSec) || undefined,
    reelFeedUntilMs: Number(data.reelFeedUntilMs) || undefined,
    reelFriendsAtMs: Number(data.reelFriendsAtMs) || undefined,
    reelPrivateAtMs: Number(data.reelPrivateAtMs) || undefined,
    thumbUrl: (data.thumbUrl as string | null) ?? null,
    mediaWidth: Number(data.mediaWidth) || undefined,
    mediaHeight: Number(data.mediaHeight) || undefined,
    sharedFromPostId: String(data.sharedFromPostId || '').trim() || undefined,
    sharedFromAuthorUid: String(data.sharedFromAuthorUid || '').trim() || undefined,
    sharedFromUsername: String(data.sharedFromUsername || '').trim() || undefined,
    ...(overlays.length ? { overlays } : {}),
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
    limit(120),
  );
  return onSnapshot(
    q,
    (snap) => {
      const posts = snap.docs.map((item) => postFromDoc(item.id, item.data() as Record<string, unknown>));
      onChange(
        posts.filter((post) => {
          if (isStoryPost(post)) return false;
          // Explorar “Todo”: publicaciones + clips (el UI filtra por chip)
          if (post.type === 'video') return isReelInPublicFeed(post) || isPublicationPost(post);
          return true;
        }).slice(0, 60),
      );
    },
    () => onChange([]),
  );
}

/** Pool de videos públicos para Explorar. No altera listenRecentPosts (Inicio/Actividad). */
export function listenExploreVideoPool(onChange: (posts: FsPost[]) => void): Unsubscribe {
  if (!auth.currentUser) {
    onChange([]);
    return () => undefined;
  }
  const q = query(
    collection(db, 'posts'),
    where('visibility', '==', 'public'),
    orderBy('createdAt', 'desc'),
    limit(320),
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs
          .map((item) => postFromDoc(item.id, item.data() as Record<string, unknown>))
          .filter((post) => {
            if (isStoryPost(post)) return false;
            if (post.type !== 'video' || !post.mediaUrl) return false;
            if (isBoomClipPost(post)) return isReelInPublicFeed(post);
            return isPublicationPost(post);
          }),
      );
    },
    () => onChange([]),
  );
}

/** Pool de Publicaciones públicas para ranking de Inicio. Nunca borra ni mueve docs. */
function listenPublicPublicationPool(onChange: (posts: FsPost[]) => void): Unsubscribe {
  if (!auth.currentUser) {
    onChange([]);
    return () => undefined;
  }
  const q = query(
    collection(db, 'posts'),
    where('visibility', '==', 'public'),
    orderBy('createdAt', 'desc'),
    limit(320),
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs
          .map((item) => postFromDoc(item.id, item.data() as Record<string, unknown>))
          .filter((post) => isPublicationPost(post) && !isStoryPost(post)),
      );
    },
    () => onChange([]),
  );
}

function isHomeFeedPost(
  post: FsPost,
  viewerUid: string,
  friendUids: Set<string>,
  followingUids: Set<string>,
  tab: 'para_ti' | 'siguiendo',
): boolean {
  if (isStoryPost(post)) return false;
  if (post.visibility === 'circle') return false;
  // Boom Clip vive solo en la sección Boom Clip, no en Publicaciones
  if (isBoomClipPost(post)) return false;

  const isFriend = friendUids.has(post.authorUid);
  const isFollowing = followingUids.has(post.authorUid);
  const isOwn = post.authorUid === viewerUid;

  if (post.visibility === 'private') return isOwn;

  if (tab === 'siguiendo' && !isOwn && !isFriend && !isFollowing) return false;

  if (post.visibility === 'friends') return isOwn || isFriend;

  // Videos largos (publicación) públicos
  if (post.type === 'video') {
    return post.visibility === 'public' || post.visibility == null;
  }

  return post.visibility === 'public' || post.visibility == null;
}

export type HomeFeedMeta = {
  friendUids: string[];
  followingUids: string[];
};

/** Feed de Inicio: pool de Publicaciones (no Boom Clip / Flash). No borra docs. */
export function listenHomeFeed(
  uid: string,
  tab: 'para_ti' | 'siguiendo',
  onChange: (posts: FsPost[], meta: HomeFeedMeta) => void,
): Unsubscribe {
  if (!uid) {
    onChange([], { friendUids: [], followingUids: [] });
    return () => undefined;
  }

  let publicPosts: FsPost[] = [];
  let networkPosts: FsPost[] = [];
  let friendUids = new Set<string>();
  let followingUids = new Set<string>();

  function meta(): HomeFeedMeta {
    return { friendUids: [...friendUids], followingUids: [...followingUids] };
  }

  function emit() {
    if (tab === 'siguiendo') {
      onChange(
        sortPosts(
          networkPosts.filter((post) =>
            isHomeFeedPost(post, uid, friendUids, followingUids, 'siguiendo'),
          ),
        ),
        meta(),
      );
      return;
    }

    const merged = new Map<string, FsPost>();
    for (const post of publicPosts) {
      if (isHomeFeedPost(post, uid, friendUids, followingUids, 'para_ti')) {
        merged.set(post.id, post);
      }
    }
    for (const post of networkPosts) {
      if (isHomeFeedPost(post, uid, friendUids, followingUids, 'para_ti')) {
        merged.set(post.id, post);
      }
    }
    onChange(sortPosts([...merged.values()]), meta());
  }

  const unsubPublic =
    tab === 'para_ti'
      ? listenPublicPublicationPool((list) => {
          publicPosts = list;
          emit();
        })
      : () => undefined;

  const networkUnsubs: Unsubscribe[] = [];
  const networkBuckets = new Map<string, FsPost[]>();

  function emitNetwork() {
    const merged = new Map<string, FsPost>();
    for (const list of networkBuckets.values()) {
      for (const post of list) merged.set(post.id, post);
    }
    networkPosts = [...merged.values()];
    emit();
  }

  function attachNetworkQuery(key: string, q: ReturnType<typeof query>) {
    networkBuckets.set(key, []);
    networkUnsubs.push(
      onSnapshot(
        q,
        (snap) => {
          networkBuckets.set(
            key,
            snap.docs.map((item) => postFromDoc(item.id, item.data() as Record<string, unknown>)),
          );
          emitNetwork();
        },
        (err) => {
          console.warn('[listenHomeFeed]', key, err);
          networkBuckets.set(key, []);
          emitNetwork();
        },
      ),
    );
  }

  function refreshNetworkListeners() {
    for (const stop of networkUnsubs) stop();
    networkUnsubs.length = 0;
    networkBuckets.clear();

    attachNetworkQuery(
      '__own__',
      query(
        collection(db, 'posts'),
        where('authorUid', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(80),
      ),
    );

    const others = [...new Set([...friendUids, ...followingUids])].filter((id) => id !== uid);
    for (let offset = 0; offset < others.length; offset += 30) {
      const batch = others.slice(offset, offset + 30);
      attachNetworkQuery(
        `batch-${offset}`,
        query(
          collection(db, 'posts'),
          where('authorUid', 'in', batch),
          orderBy('createdAt', 'desc'),
          limit(80),
        ),
      );
    }
  }

  const unsubFriends = listenFriends(uid, (friends) => {
    friendUids = new Set(friends.map((friend) => friend.uid));
    refreshNetworkListeners();
  });
  const unsubFollowing = listenFollowing(uid, (following) => {
    followingUids = new Set(following.map((person) => person.uid));
    refreshNetworkListeners();
  });

  return () => {
    unsubPublic();
    unsubFriends();
    unsubFollowing();
    for (const stop of networkUnsubs) stop();
  };
}

/** Historias activas (24 h): tuyas, de amigos, seguidores y quien sigues. */
export function listenActiveStories(onChange: (posts: FsPost[]) => void): Unsubscribe {
  const user = auth.currentUser;
  if (!user) {
    onChange([]);
    return () => undefined;
  }

  const uid = user.uid;
  let friendUids: string[] = [];
  let followingUids: string[] = [];
  let followerUids: string[] = [];
  const storyUnsubs: Unsubscribe[] = [];
  const storyBuckets = new Map<string, FsPost[]>();
  const MAX_STORY_AUTHORS = 56;

  function emitStories() {
    const merged = new Map<string, FsPost>();
    for (const list of storyBuckets.values()) {
      for (const post of list) merged.set(post.id, post);
    }
    const networkSet = new Set([...friendUids, ...followingUids, ...followerUids]);
    const now = Date.now();
    onChange(
      [...merged.values()]
        .filter(
          (post) =>
            isStoryActive(post, now) &&
            (post.authorUid === uid || networkSet.has(post.authorUid)),
        )
        .sort(
          (a, b) =>
            (b.storyExpiresAtMs ?? Date.parse(b.createdAt)) -
            (a.storyExpiresAtMs ?? Date.parse(a.createdAt)),
        ),
    );
  }

  function attachRecentPostsQuery(key: string, q: ReturnType<typeof query>) {
    storyBuckets.set(key, []);
    storyUnsubs.push(
      onSnapshot(
        q,
        (snap) => {
          storyBuckets.set(
            key,
            snap.docs
              .map((item) => postFromDoc(item.id, item.data() as Record<string, unknown>))
              .filter(
                (post) =>
                  (post.type === 'video' || post.type === 'photo') &&
                  post.mediaUrl &&
                  isStoryPost(post) &&
                  isStoryActive(post),
              ),
          );
          emitStories();
        },
        (err) => {
          console.warn('[listenActiveStories]', key, err);
          storyBuckets.set(key, []);
          emitStories();
        },
      ),
    );
  }

  function refreshStoryListeners() {
    for (const stop of storyUnsubs) stop();
    storyUnsubs.length = 0;
    storyBuckets.clear();

    attachRecentPostsQuery(
      '__own__',
      query(
        collection(db, 'posts'),
        where('authorUid', '==', uid),
        where('visibility', '==', 'circle'),
        orderBy('createdAt', 'desc'),
        limit(40),
      ),
    );

    const others = [...new Set([...friendUids, ...followingUids, ...followerUids])]
      .filter((id) => id !== uid)
      .slice(0, MAX_STORY_AUTHORS);

    // Una query por autor: si un lote `in` incluye alguien con posts ilegibles, Firestore falla entero.
    for (const authorUid of others) {
      attachRecentPostsQuery(
        `author-${authorUid}`,
        query(
          collection(db, 'posts'),
          where('authorUid', '==', authorUid),
          where('visibility', '==', 'circle'),
          orderBy('createdAt', 'desc'),
          limit(12),
        ),
      );
    }
  }

  const unsubFriends = listenFriends(uid, (friends) => {
    friendUids = friends.map((friend) => friend.uid);
    refreshStoryListeners();
  });
  const unsubFollowing = listenFollowing(uid, (following) => {
    followingUids = following.map((person) => person.uid);
    refreshStoryListeners();
  });
  const unsubFollowers = listenFollowers(uid, (followers) => {
    followerUids = followers.map((person) => person.uid);
    refreshStoryListeners();
  });

  return () => {
    unsubFriends();
    unsubFollowing();
    unsubFollowers();
    for (const stop of storyUnsubs) stop();
  };
}

export async function getPostById(postId: string): Promise<FsPost | null> {
  const id = String(postId || '').trim();
  if (!id) return null;
  const snap = await getDoc(doc(db, 'posts', id));
  if (!snap.exists()) return null;
  return postFromDoc(snap.id, snap.data() as Record<string, unknown>);
}

export function isRepostPost(post: { sharedFromPostId?: string | null }): boolean {
  return Boolean(String(post.sharedFromPostId || '').trim());
}

export async function viewerCanSeePost(
  post: FsPost,
  viewerUid?: string | null,
): Promise<boolean> {
  if (post.visibility === 'public' || post.visibility == null) return true;
  if (!viewerUid) return false;
  if (post.authorUid === viewerUid) return true;
  if (post.visibility === 'private' || post.visibility === 'circle') return false;
  if (post.visibility === 'friends') {
    const status = await getFriendshipStatusByUid(viewerUid, post.authorUid);
    return status === 'friends';
  }
  return false;
}

/** Carga el contenido original de un repost. No crea ni modifica documentos. */
export async function loadRepostOriginal(
  originId: string,
  viewerUid?: string | null,
): Promise<FsPost | null> {
  const id = String(originId || '').trim();
  if (!id) return null;
  try {
    let current = await getPostById(id);
    if (!current) return null;
    if (current.sharedFromPostId && current.sharedFromPostId !== current.id) {
      const nested = await getPostById(current.sharedFromPostId);
      if (nested) current = nested;
    }
    if (isStoryPost(current) && !isStoryActive(current)) return null;
    const visible = await viewerCanSeePost(current, viewerUid);
    return visible ? current : null;
  } catch {
    return null;
  }
}

/** Boom Clip: solo videos cortos públicos en carrusel (no fotos ni historias). */
export function listenActiveReels(onChange: (posts: FsPost[]) => void): Unsubscribe {
  return listenRecentPosts((posts) => {
    onChange(
      diversifyReelFeed(
        posts.filter((post) => isBoomClipPost(post) && isReelInPublicFeed(post)),
        2,
        16,
      ),
    );
  });
}

/** Archiva reels viejos del autor: público → amigos → privado. */
export async function sweepAuthorReelLifecycle(authorUid: string) {
  if (!authorUid) return;
  const snap = await getDocs(
    query(collection(db, 'posts'), where('authorUid', '==', authorUid), limit(64)),
  );
  if (snap.empty) return;

  const now = Date.now();
  const batch = writeBatch(db);
  let pending = 0;

  for (const item of snap.docs) {
    const post = postFromDoc(item.id, item.data() as Record<string, unknown>);
    if (post.type !== 'video' && post.type !== 'photo') continue;
    if (isStoryPost(post) && !isStoryActive(post, now)) {
      batch.update(item.ref, { visibility: 'private', storyExpiresAtMs: now });
      pending += 1;
      continue;
    }
    if (isStoryPost(post)) continue;

    const nextVisibility = targetReelVisibility(post, now);
    if (nextVisibility === post.visibility) continue;

    const storagePath = post.storagePath;
    batch.update(item.ref, { visibility: nextVisibility });
    pending += 1;

    if (storagePath) {
      void updateStoredMediaVisibility(storagePath, nextVisibility).catch(() => undefined);
    }
  }

  if (pending > 0) await batch.commit();
}

export async function notifyFriendsAboutPost(input: {
  authorUid: string;
  authorUsername: string;
  authorName: string;
  postId: string;
  recipientUids: string[];
  story?: boolean;
  postFormat?: 'story' | 'post';
  mediaType?: 'photo' | 'video' | 'text';
}) {
  const recipients = Array.from(new Set(input.recipientUids.filter(Boolean))).slice(0, 40);
  if (recipients.length === 0) return 0;

  const batch = writeBatch(db);
  const at = Date.now();
  const author = encodeURIComponent(input.authorUsername);
  const pid = encodeURIComponent(input.postId);
  const uid = encodeURIComponent(input.authorUid);
  const href = input.story
    ? `/?flash=${pid}&u=${author}`
    : input.postFormat === 'post' && input.mediaType === 'video'
      ? `/?clip=${pid}&u=${author}&uid=${uid}`
      : `/u/${author}?post=${pid}&uid=${uid}`;
  const title = input.story
    ? `${input.authorName} publicó un Flash Boom`
    : input.postFormat === 'post' && input.mediaType === 'video'
      ? `${input.authorName} publicó un Boom Clip`
      : `${input.authorName} publicó algo nuevo`;

  for (const uidRecipient of recipients) {
    if (uidRecipient === input.authorUid) continue;
    const ref = doc(collection(db, 'users', uidRecipient, 'postAlerts'));
    batch.set(ref, {
      authorUid: input.authorUid,
      authorUsername: input.authorUsername.toLowerCase(),
      authorName: input.authorName,
      postId: input.postId,
      postFormat: input.postFormat || (input.story ? 'story' : null),
      mediaType: input.mediaType || null,
      title,
      href,
      createdAt: serverTimestamp(),
      createdAtMs: at,
    });
  }
  await batch.commit();
  return recipients.filter((uidRecipient) => uidRecipient !== input.authorUid).length;
}

export type PostAlertItem = {
  id: string;
  text: string;
  href: string;
  at: number;
  postId?: string;
  authorUid?: string;
  authorUsername?: string;
  postFormat?: 'story' | 'post';
  mediaType?: 'photo' | 'video' | 'text';
};

export function buildPostAlertTarget(alert: PostAlertItem): { pathname: string; search: string } {
  let postId = alert.postId?.trim();
  let author = alert.authorUsername?.trim();
  let authorUid = alert.authorUid?.trim();
  try {
    const url = new URL(alert.href, 'https://liveboom.local');
    postId = postId || url.searchParams.get('flash') || url.searchParams.get('clip') || url.searchParams.get('post') || undefined;
    author = author || url.searchParams.get('u') || undefined;
    authorUid = authorUid || url.searchParams.get('uid') || undefined;
    if (!author) {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'u' && parts[1]) author = decodeURIComponent(parts[1]);
    }
    if (url.searchParams.has('flash') || alert.href.includes('flash=')) {
      if (postId && author) {
        return { pathname: '/', search: `?flash=${encodeURIComponent(postId)}&u=${encodeURIComponent(author)}` };
      }
    }
    if (url.searchParams.has('clip') || alert.href.includes('clip=')) {
      if (postId && author) {
        const uidQ = authorUid ? `&uid=${encodeURIComponent(authorUid)}` : '';
        return { pathname: '/', search: `?clip=${encodeURIComponent(postId)}&u=${encodeURIComponent(author)}${uidQ}` };
      }
    }
    if (url.pathname.startsWith('/u/') && postId) {
      const uidQ = authorUid ? `&uid=${encodeURIComponent(authorUid)}` : '';
      return {
        pathname: url.pathname,
        search: `?post=${encodeURIComponent(postId)}${uidQ}`,
      };
    }
    return { pathname: url.pathname, search: url.search };
  } catch {
    return { pathname: '/', search: '' };
  }
}

export function listenPostAlerts(
  uid: string,
  onChange: (alerts: PostAlertItem[]) => void,
): Unsubscribe {
  const col = collection(db, 'users', uid, 'postAlerts');
  const q = query(col, orderBy('createdAtMs', 'desc'), limit(20));
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            text: String(data.title || 'Un amigo publicó algo nuevo'),
            href: String(data.href || '/'),
            at: Number(data.createdAtMs || Date.now()),
            postId: String(data.postId || '').trim() || undefined,
            authorUid: String(data.authorUid || '').trim() || undefined,
            authorUsername: String(data.authorUsername || '').trim() || undefined,
            postFormat: data.postFormat === 'story' || data.postFormat === 'post' ? data.postFormat : undefined,
            mediaType:
              data.mediaType === 'photo' || data.mediaType === 'video' || data.mediaType === 'text'
                ? data.mediaType
                : undefined,
          };
        }),
      );
    },
    (err) => {
      console.warn('[postAlerts]', err);
    },
  );
}

export async function deletePostAlert(uid: string, alertId: string) {
  const id = String(alertId || '').trim();
  if (!uid || !id) return;
  await deleteDoc(doc(db, 'users', uid, 'postAlerts', id));
}

/** Borra todas las alertas de publicaciones del usuario (máx. 40). */
export async function clearPostAlerts(uid: string) {
  if (!uid) return;
  const col = collection(db, 'users', uid, 'postAlerts');
  const snap = await getDocs(query(col, orderBy('createdAtMs', 'desc'), limit(40)));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((item) => batch.delete(item.ref));
  await batch.commit();
}

export async function createPost(input: {
  authorUid: string;
  username: string;
  authorDisplayName?: string;
  type: 'photo' | 'video' | 'text';
  caption: string;
  mediaFile?: File | Blob | null;
  mediaFiles?: File[];
  mediaUrl?: string | null;
  visibility?: 'public' | 'friends' | 'private' | 'circle';
  postFormat?: 'story' | 'post';
  durationSec?: number;
  notifyFriends?: boolean;
  musicTrackId?: string;
  musicStartSec?: number;
  overlays?: MediaOverlayItem[];
}): Promise<{
  id: string;
  mediaUrl: string | null;
  storagePath: string | null;
  visibility: 'public' | 'friends' | 'private' | 'circle';
  postFormat?: 'story' | 'post';
}> {
  let mediaUrl: string | null = null;
  let mediaUrls: string[] | undefined;
  let storagePath: string | null = null;
  let thumbUrl: string | null = null;
  let mediaWidth = 0;
  let mediaHeight = 0;
  const isStory = input.postFormat === 'story';
  // Boom Clip = solo video con postFormat post (nunca foto)
  const isBoomClip = input.postFormat === 'post' && input.type === 'video';
  const visibility = isStory ? 'circle' : input.visibility || 'public';
  const durationSec = Math.max(0, Math.floor(Number(input.durationSec) || 0));
  const postFormat = isStory
    ? 'story'
    : isBoomClip
      ? 'post'
      : undefined;

  if (input.postFormat === 'post' && input.type !== 'video') {
    throw new Error('Boom Clip solo admite video (máx. 90 s). Usa Publicación para fotos.');
  }
  if (isBoomClip && durationSec > 0 && durationSec > MAX_CLIP_DURATION_SECONDS) {
    throw new Error(`Boom Clip debe durar máximo ${MAX_CLIP_DURATION_SECONDS} segundos.`);
  }

  if (input.type === 'photo' || input.type === 'video') {
    const storageKind: UserMediaStorageKind = isStory
      ? 'flash_boom'
      : isBoomClip
        ? 'boom_clip'
        : 'publication';

    const multiPhotoFiles =
      input.type === 'photo' && !isStory && !isBoomClip ? input.mediaFiles : undefined;

    if (multiPhotoFiles && multiPhotoFiles.length > 1) {
      const uploadedList = await uploadUserMediaMany(
        input.authorUid,
        multiPhotoFiles,
        visibility,
        storageKind,
      );
      const uploadedUrls = uploadedList.map((item) => item.url);
      mediaUrls = uploadedUrls;
      mediaUrl = uploadedUrls[0] ?? null;
      storagePath = uploadedList[0]?.storagePath ?? null;
    } else if (input.mediaFile) {
      const mediaToUpload = input.mediaFile;
      const fileName =
        mediaToUpload instanceof File && mediaToUpload.name
          ? mediaToUpload.name
          : input.type === 'video'
            ? 'clip.mp4'
            : 'photo.jpg';
      const clipExtrasPromise = isBoomClip
        ? (async () => {
            const meta = await readVideoSizeAndPortraitPoster(mediaToUpload);
            const thumbUploaded = await uploadUserMedia(
              input.authorUid,
              meta.poster,
              'thumb.jpg',
              visibility,
              'boom_clip',
            );
            return { width: meta.width, height: meta.height, thumbUrl: thumbUploaded.url };
          })().catch(() => null)
        : Promise.resolve(null);
      const [uploaded, clipExtras] = await Promise.all([
        uploadUserMedia(
          input.authorUid,
          mediaToUpload,
          fileName,
          visibility,
          storageKind,
        ),
        clipExtrasPromise,
      ]);
      mediaUrl = uploaded.url;
      storagePath = uploaded.storagePath;
      if (clipExtras) {
        mediaWidth = clipExtras.width;
        mediaHeight = clipExtras.height;
        thumbUrl = clipExtras.thumbUrl;
      }
    } else if (input.mediaUrl?.startsWith('data:')) {
      const blob = await (await fetch(input.mediaUrl)).blob();
      const uploaded = await uploadUserMedia(
        input.authorUid,
        blob,
        input.type === 'video' ? 'clip.mp4' : 'photo.jpg',
        visibility,
        storageKind,
      );
      mediaUrl = uploaded.url;
      storagePath = uploaded.storagePath;
    } else if (input.mediaUrl && /^https?:\/\//i.test(input.mediaUrl)) {
      mediaUrl = input.mediaUrl;
    } else {
      throw new Error(input.type === 'video' ? 'Elige un video para publicar' : 'Elige una foto para publicar');
    }
  }

  const overlayPayload = serializeMediaOverlays(input.overlays || []);
  const ref = await addDoc(collection(db, 'posts'), {
    authorUid: input.authorUid,
    username: input.username.toLowerCase(),
    type: input.type,
    caption:
      input.caption.trim().slice(0, isStory ? FLASH_BOOM_CAPTION_MAX : isBoomClip ? BOOM_CLIP_CAPTION_MAX : 2000) ||
      null,
    mediaUrl,
    storagePath,
    visibility,
    likes: 0,
    createdAt: serverTimestamp(),
    ...(mediaUrls?.length ? { mediaUrls } : {}),
    ...(postFormat ? { postFormat } : {}),
    ...(thumbUrl ? { thumbUrl } : {}),
    ...(mediaWidth > 0 && mediaHeight > 0 ? { mediaWidth, mediaHeight } : {}),
    ...(isStory
      ? {
          storyExpiresAtMs: storyExpiresAtFromNow(),
          ...(input.type === 'video' ? { durationSec } : {}),
        }
      : {}),
    ...(isBoomClip
      ? {
          ...reelLifecycleFromCreatedAt(Date.now()),
          durationSec,
        }
      : {}),
    ...(input.type === 'video' && !isStory && !isBoomClip && durationSec > 0
      ? { durationSec }
      : {}),
    ...(input.musicTrackId
      ? {
          musicTrackId: input.musicTrackId,
          ...(input.musicStartSec != null ? { musicStartSec: input.musicStartSec } : {}),
        }
      : {}),
    ...(overlayPayload.length ? { overlays: overlayPayload } : {}),
  });
  if (visibility === 'public' && input.caption.trim()) {
    void import('./trendsFirestore')
      .then(({ bumpHashtagsFromCaption }) => bumpHashtagsFromCaption(input.caption))
      .catch(() => undefined);
  }

  if (input.notifyFriends && visibility !== 'private' && visibility !== 'circle') {
    const friends = await listFriends(input.authorUid);
    void notifyFriendsAboutPost({
      authorUid: input.authorUid,
      authorUsername: input.username,
      authorName: input.authorDisplayName?.trim() || input.username,
      postId: ref.id,
      recipientUids: friends.map((friend) => friend.uid),
      postFormat: postFormat || undefined,
      mediaType: input.type,
    }).catch(() => undefined);
  }

  if (input.type === 'video' || isBoomClip) {
    void sweepAuthorReelLifecycle(input.authorUid).catch(() => undefined);
  }

  if (isStory) {
    const [friends, followers] = await Promise.all([
      listFriends(input.authorUid),
      listFollowers(input.authorUid),
    ]);
    const recipientUids = [
      ...new Set([
        ...friends.map((friend) => friend.uid),
        ...followers.map((follower) => follower.uid),
      ]),
    ].filter((id) => id && id !== input.authorUid);
    if (recipientUids.length > 0) {
      void notifyFriendsAboutPost({
        authorUid: input.authorUid,
        authorUsername: input.username,
        authorName: input.authorDisplayName?.trim() || input.username,
        postId: ref.id,
        recipientUids,
        story: true,
        postFormat: 'story',
        mediaType: input.type,
      }).catch(() => undefined);
    }
  }

  return { id: ref.id, mediaUrl, storagePath, visibility, postFormat };
}

/**
 * Republica un contenido existente como referencia (no duplica media).
 * Boom / comentarios / regalos siguen en el documento original.
 */
export async function createRepost(input: {
  authorUid: string;
  username: string;
  authorDisplayName?: string;
  sourcePostId: string;
  caption: string;
  visibility?: 'public' | 'friends' | 'private';
  notifyFriends?: boolean;
}): Promise<{ id: string }> {
  const source = await getPostById(input.sourcePostId);
  if (!source) throw new Error('No se encontró el contenido original');

  const originId = source.sharedFromPostId || source.id;
  const originUid = source.sharedFromAuthorUid || source.authorUid;
  const originUsername = (source.sharedFromUsername || source.username).replace(/^@/, '').toLowerCase();
  const origin = source.sharedFromPostId ? (await getPostById(originId)) || source : source;
  const canSee = await viewerCanSeePost(origin, input.authorUid);
  if (!canSee) throw new Error('Este contenido ya no está disponible');

  const visibility = input.visibility || 'public';
  const caption = input.caption.trim().slice(0, 2000) || null;

  const ref = await addDoc(collection(db, 'posts'), {
    authorUid: input.authorUid,
    username: input.username.toLowerCase(),
    type: 'text',
    caption,
    mediaUrl: null,
    storagePath: null,
    visibility,
    likes: 0,
    createdAt: serverTimestamp(),
    isRepost: true,
    sharedFromPostId: originId,
    sharedFromAuthorUid: originUid,
    sharedFromUsername: originUsername,
  });

  if (visibility === 'public' && caption) {
    void import('./trendsFirestore')
      .then(({ bumpHashtagsFromCaption }) => bumpHashtagsFromCaption(caption))
      .catch(() => undefined);
  }

  if (input.notifyFriends !== false && visibility !== 'private') {
    const friends = await listFriends(input.authorUid);
    void notifyFriendsAboutPost({
      authorUid: input.authorUid,
      authorUsername: input.username,
      authorName: input.authorDisplayName?.trim() || input.username,
      postId: ref.id,
      recipientUids: friends.map((friend) => friend.uid),
      mediaType: 'text',
    }).catch(() => undefined);
  }

  return { id: ref.id };
}

export async function updatePostVisibility(
  postId: string,
  authorUid: string,
  visibility: 'public' | 'friends' | 'private' | 'circle',
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

export type PostReactionUser = {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type PostReactionStats = {
  likes: number;
  dislikes: number;
  booms: number;
  viewerReaction: 'like' | 'dislike' | null;
  viewerBoom: boolean;
  likers: PostReactionUser[];
  dislikers: PostReactionUser[];
  boomers: PostReactionUser[];
};

function reactionUserFromDoc(id: string, data: Record<string, unknown>): PostReactionUser {
  const username = String(data.username || '').trim();
  return {
    uid: id,
    username: username || id.slice(0, 8),
    displayName: String(data.displayName || username || 'Usuario'),
    avatarUrl: (data.avatarUrl as string | null) ?? null,
  };
}

export function listenPostReactions(
  postId: string,
  viewerUid: string | null | undefined,
  onChange: (stats: PostReactionStats) => void,
): Unsubscribe {
  return onSnapshot(collection(db, 'posts', postId, 'reactions'), (snap) => {
    let likes = 0;
    let dislikes = 0;
    let booms = 0;
    let viewerReaction: PostReactionStats['viewerReaction'] = null;
    let viewerBoom = false;
    const likers: PostReactionUser[] = [];
    const dislikers: PostReactionUser[] = [];
    const boomers: PostReactionUser[] = [];
    for (const item of snap.docs) {
      const data = item.data() as Record<string, unknown>;
      const type = String(data.type || '');
      const hasBoom = Boolean(data.boom);
      const user = reactionUserFromDoc(item.id, data);
      if (type === 'like') {
        likes += 1;
        likers.push(user);
      }
      if (type === 'dislike') {
        dislikes += 1;
        dislikers.push(user);
      }
      if (hasBoom) {
        booms += 1;
        boomers.push(user);
      }
      if (viewerUid && item.id === viewerUid) {
        if (type === 'like' || type === 'dislike') viewerReaction = type;
        viewerBoom = hasBoom;
      }
    }
    onChange({ likes, dislikes, booms, viewerReaction, viewerBoom, likers, dislikers, boomers });
  });
}

export async function setPostReaction(
  postId: string,
  uid: string,
  reaction: 'like' | 'dislike' | null,
  profile?: { username: string; displayName: string; avatarUrl: string | null },
) {
  const ref = doc(db, 'posts', postId, 'reactions', uid);
  if (!reaction) {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    if (Boolean(snap.data()?.boom)) {
      await updateDoc(ref, { type: null });
    } else {
      await deleteDoc(ref);
    }
    return;
  }
  await setDoc(
    ref,
    {
      type: reaction,
      username: profile?.username || '',
      displayName: profile?.displayName || profile?.username || '',
      avatarUrl: profile?.avatarUrl ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Toggle del BOOM especial (independiente del like). */
export async function setPostBoom(
  postId: string,
  uid: string,
  active: boolean,
  profile?: { username: string; displayName: string; avatarUrl: string | null },
) {
  const ref = doc(db, 'posts', postId, 'reactions', uid);
  if (!active) {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const type = String(snap.data()?.type || '');
    if (type === 'like' || type === 'dislike') {
      await updateDoc(ref, { boom: false });
    } else {
      await deleteDoc(ref);
    }
    return;
  }
  await setDoc(
    ref,
    {
      boom: true,
      username: profile?.username || '',
      displayName: profile?.displayName || profile?.username || '',
      avatarUrl: profile?.avatarUrl ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export type PostComment = {
  id: string;
  authorUid: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  text: string;
  createdAt: string;
  /** Respuesta: id del comentario raíz. Ausente = comentario de primer nivel. */
  parentId?: string | null;
  replyToUid?: string | null;
  replyToUsername?: string | null;
};

export type PostCommentReply = {
  parentId: string;
  replyToUid?: string | null;
  replyToUsername?: string | null;
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
      parentId: String(data.parentId || '').trim() || null,
      replyToUid: String(data.replyToUid || '').trim() || null,
      replyToUsername: String(data.replyToUsername || '').trim() || null,
    };
  });
}

export function listenPostComments(
  postId: string,
  onChange: (comments: PostComment[]) => void,
): Unsubscribe {
  const col = collection(db, 'posts', postId, 'comments');
  const q = query(col, orderBy('createdAt', 'asc'), limit(200));
  let fallback: Unsubscribe | null = null;
  const primary = onSnapshot(
    q,
    (snap) => onChange(commentsFromSnap(snap)),
    () => {
      fallback = onSnapshot(col, (snap) => {
        onChange(
          commentsFromSnap(snap)
            .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
            .slice(0, 200),
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
  reply?: PostCommentReply | null,
) {
  const body = text.trim().slice(0, 500);
  if (!body) throw new Error('Escribe un comentario');
  const parentId = String(reply?.parentId || '').trim();
  const payload: Record<string, unknown> = {
    authorUid: author.firebaseUid,
    username: author.handle.toLowerCase(),
    displayName: author.displayName || author.handle,
    avatarUrl: author.avatarUrl,
    text: body,
    createdAt: serverTimestamp(),
  };
  if (parentId) {
    payload.parentId = parentId;
    payload.replyToUid = String(reply?.replyToUid || '').trim() || null;
    payload.replyToUsername = String(reply?.replyToUsername || '')
      .trim()
      .toLowerCase() || null;
  }
  await addDoc(collection(db, 'posts', postId, 'comments'), payload);
}

export async function deletePostComment(postId: string, commentId: string) {
  await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
}
