import {
  addDoc,
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
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { firebaseApp } from './firebase';
import { fetchFirestoreProfile } from './profileFirestore';

const db = getFirestore(firebaseApp);

export type GroupRole = 'owner' | 'admin' | 'member';

export type LiveGroup = {
  id: string;
  name: string;
  description: string;
  ownerUid: string;
  ownerUsername: string;
  memberCount: number;
  isPublic: boolean;
  createdAtMs: number;
  photoUrl: string | null;
};

export type GroupMember = {
  uid: string;
  username: string;
  displayName: string;
  role: GroupRole;
  avatarUrl?: string | null;
};

export type GroupMemberPreview = {
  uid: string;
  username: string;
  avatarUrl: string | null;
};

export type GroupMessage = {
  id: string;
  fromUid: string;
  username: string;
  text: string;
  createdAtMs: number;
  mediaUrl?: string | null;
  mediaType?: 'image' | null;
  linkUrl?: string | null;
};

function parseRole(value: unknown): GroupRole {
  if (value === 'owner' || value === 'admin') return value;
  return 'member';
}

function mapGroup(id: string, data: Record<string, unknown>): LiveGroup {
  return {
    id,
    name: String(data.name || 'Grupo'),
    description: String(data.description || ''),
    ownerUid: String(data.ownerUid || ''),
    ownerUsername: String(data.ownerUsername || ''),
    memberCount: Number(data.memberCount || 0),
    isPublic: data.isPublic !== false,
    createdAtMs: Number(data.createdAtMs || 0),
    photoUrl: typeof data.photoUrl === 'string' && data.photoUrl ? data.photoUrl : null,
  };
}

export function isGroupStaffRole(role: GroupRole | undefined | null) {
  return role === 'owner' || role === 'admin';
}

export async function createGroup(input: {
  name: string;
  description?: string;
  ownerUid: string;
  ownerUsername: string;
  ownerDisplayName: string;
  ownerAvatarUrl?: string | null;
  isPublic?: boolean;
  photoUrl?: string | null;
}) {
  const name = input.name.trim().slice(0, 48);
  if (name.length < 3) throw new Error('El nombre del grupo debe tener al menos 3 caracteres');
  const ref = await addDoc(collection(db, 'groups'), {
    name,
    description: String(input.description || '').trim().slice(0, 280),
    ownerUid: input.ownerUid,
    ownerUsername: input.ownerUsername,
    memberCount: 1,
    isPublic: input.isPublic !== false,
    photoUrl: input.photoUrl || null,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
  await setDoc(doc(db, 'groups', ref.id, 'members', input.ownerUid), {
    uid: input.ownerUid,
    username: input.ownerUsername,
    displayName: input.ownerDisplayName || input.ownerUsername,
    avatarUrl: input.ownerAvatarUrl || null,
    role: 'owner',
    joinedAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'users', input.ownerUid, 'groups', ref.id), {
    groupId: ref.id,
    name,
    joinedAt: serverTimestamp(),
  });
  return ref.id;
}

export function listenPublicGroups(onChange: (groups: LiveGroup[]) => void): Unsubscribe {
  const q = query(collection(db, 'groups'), where('isPublic', '==', true), limit(60));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((item) => mapGroup(item.id, item.data() as Record<string, unknown>))
        .sort((a, b) => b.memberCount - a.memberCount || b.createdAtMs - a.createdAtMs);
      onChange(list);
    },
    () => onChange([]),
  );
}

export function listenMyGroups(uid: string, onChange: (groups: LiveGroup[]) => void): Unsubscribe {
  const col = collection(db, 'users', uid, 'groups');
  return onSnapshot(
    col,
    async (snap) => {
      const ids = snap.docs.map((item) => item.id);
      if (ids.length === 0) {
        onChange([]);
        return;
      }
      const groups: LiveGroup[] = [];
      await Promise.all(
        ids.slice(0, 40).map(async (id) => {
          const g = await getDoc(doc(db, 'groups', id));
          if (g.exists()) groups.push(mapGroup(g.id, g.data() as Record<string, unknown>));
        }),
      );
      onChange(groups.sort((a, b) => a.name.localeCompare(b.name)));
    },
    () => onChange([]),
  );
}

export async function joinGroup(
  groupId: string,
  user: { uid: string; username: string; displayName: string; avatarUrl?: string | null },
) {
  const groupRef = doc(db, 'groups', groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) throw new Error('Grupo no encontrado');
  const memberRef = doc(db, 'groups', groupId, 'members', user.uid);
  const existing = await getDoc(memberRef);
  if (existing.exists()) {
    const data = groupSnap.data() as Record<string, unknown>;
    await setDoc(
      doc(db, 'users', user.uid, 'groups', groupId),
      { groupId, name: String(data.name || 'Grupo'), joinedAt: serverTimestamp() },
      { merge: true },
    );
    return;
  }
  const data = groupSnap.data() as Record<string, unknown>;
  const isOwner = String(data.ownerUid || '') === user.uid;
  await setDoc(memberRef, {
    uid: user.uid,
    username: user.username,
    displayName: user.displayName || user.username,
    avatarUrl: user.avatarUrl || null,
    role: isOwner ? 'owner' : 'member',
    joinedAt: serverTimestamp(),
  });
  if (!isOwner) {
    await updateDoc(groupRef, { memberCount: increment(1) });
  }
  await setDoc(doc(db, 'users', user.uid, 'groups', groupId), {
    groupId,
    name: String(data.name || 'Grupo'),
    joinedAt: serverTimestamp(),
  });
}

/**
 * Repara dueños/miembros antiguos sin doc en members/ (necesario para chat y fotos).
 * Si no eres miembro ni dueño, no hace nada y retorna false.
 */
export async function ensureGroupMembership(
  groupId: string,
  user: { uid: string; username: string; displayName: string; avatarUrl?: string | null },
): Promise<boolean> {
  const groupRef = doc(db, 'groups', groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) return false;
  const data = groupSnap.data() as Record<string, unknown>;
  const memberRef = doc(db, 'groups', groupId, 'members', user.uid);
  const existing = await getDoc(memberRef);
  if (existing.exists()) {
    await setDoc(
      doc(db, 'users', user.uid, 'groups', groupId),
      { groupId, name: String(data.name || 'Grupo'), joinedAt: serverTimestamp() },
      { merge: true },
    );
    return true;
  }
  if (String(data.ownerUid || '') !== user.uid) return false;
  await setDoc(memberRef, {
    uid: user.uid,
    username: user.username,
    displayName: user.displayName || user.username,
    avatarUrl: user.avatarUrl || null,
    role: 'owner',
    joinedAt: serverTimestamp(),
  });
  await setDoc(
    doc(db, 'users', user.uid, 'groups', groupId),
    { groupId, name: String(data.name || 'Grupo'), joinedAt: serverTimestamp() },
    { merge: true },
  );
  return true;
}

export async function leaveGroup(groupId: string, uid: string) {
  const groupRef = doc(db, 'groups', groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) return;
  const data = groupSnap.data() as Record<string, unknown>;
  if (String(data.ownerUid) === uid) {
    throw new Error('El dueño no puede salir. Transfiere o elimina el grupo.');
  }
  await deleteDoc(doc(db, 'groups', groupId, 'members', uid));
  await deleteDoc(doc(db, 'users', uid, 'groups', groupId));
  await updateDoc(groupRef, { memberCount: increment(-1) });
}

export function listenGroupMembers(
  groupId: string,
  onChange: (members: GroupMember[]) => void,
): Unsubscribe {
  return onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) => {
    onChange(
      snap.docs
        .map((item) => {
          const data = item.data() as Record<string, unknown>;
          return {
            uid: item.id,
            username: String(data.username || ''),
            displayName: String(data.displayName || data.username || ''),
            role: parseRole(data.role),
            avatarUrl:
              typeof data.avatarUrl === 'string' && data.avatarUrl ? data.avatarUrl : null,
          };
        })
        .sort((a, b) => {
          const rank = { owner: 0, admin: 1, member: 2 };
          return rank[a.role] - rank[b.role] || a.username.localeCompare(b.username);
        }),
    );
  });
}

export function listenGroupMessages(
  groupId: string,
  onChange: (messages: GroupMessage[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'groups', groupId, 'messages'),
    orderBy('createdAtMs', 'asc'),
    limit(200),
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs.map((item) => {
          const data = item.data() as Record<string, unknown>;
          return {
            id: item.id,
            fromUid: String(data.fromUid || ''),
            username: String(data.username || ''),
            text: String(data.text || ''),
            createdAtMs: Number(data.createdAtMs || 0),
            mediaUrl: typeof data.mediaUrl === 'string' ? data.mediaUrl : null,
            mediaType: data.mediaType === 'image' ? 'image' : null,
            linkUrl: typeof data.linkUrl === 'string' ? data.linkUrl : null,
          };
        }),
      );
    },
    () => onChange([]),
  );
}

function detectLink(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

export async function sendGroupMessage(
  groupId: string,
  input: {
    fromUid: string;
    username: string;
    text: string;
    mediaUrl?: string | null;
    mediaType?: 'image' | null;
    linkUrl?: string | null;
  },
) {
  const text = input.text.trim().slice(0, 2000);
  const linkUrl = (input.linkUrl || detectLink(text) || '').trim().slice(0, 2000) || null;
  const mediaUrl = input.mediaUrl?.trim() || null;
  const mediaType = mediaUrl && input.mediaType === 'image' ? 'image' : null;
  if (!text && !mediaUrl && !linkUrl) return;

  const payload: Record<string, unknown> = {
    fromUid: input.fromUid,
    username: input.username,
    text: text || (mediaUrl ? '📷 Foto' : linkUrl ? '🔗 Enlace' : ''),
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  };
  if (mediaUrl) {
    payload.mediaUrl = mediaUrl;
    payload.mediaType = mediaType;
  }
  if (linkUrl) payload.linkUrl = linkUrl;

  await addDoc(collection(db, 'groups', groupId, 'messages'), payload);
}

/** Dueño o admin: cambia la foto del grupo. */
export async function updateGroupPhoto(groupId: string, photoUrl: string | null) {
  await updateDoc(doc(db, 'groups', groupId), { photoUrl: photoUrl || null });
}

/** Dueño o admin: promueve/degrada a admin (no toca al owner). */
export async function setGroupMemberRole(
  groupId: string,
  memberUid: string,
  role: 'admin' | 'member',
) {
  const groupSnap = await getDoc(doc(db, 'groups', groupId));
  if (!groupSnap.exists()) throw new Error('Grupo no encontrado');
  const ownerUid = String((groupSnap.data() as Record<string, unknown>).ownerUid || '');
  if (memberUid === ownerUid) throw new Error('No puedes cambiar el rol del dueño.');

  const memberRef = doc(db, 'groups', groupId, 'members', memberUid);
  const memberSnap = await getDoc(memberRef);
  if (!memberSnap.exists()) throw new Error('Miembro no encontrado');
  const current = parseRole((memberSnap.data() as Record<string, unknown>).role);
  if (current === 'owner') throw new Error('No puedes cambiar el rol del dueño.');

  await updateDoc(memberRef, { role });
}

export async function isGroupMember(groupId: string, uid: string) {
  const snap = await getDoc(doc(db, 'groups', groupId, 'members', uid));
  return snap.exists();
}

export async function getGroupMemberRole(groupId: string, uid: string): Promise<GroupRole | null> {
  const snap = await getDoc(doc(db, 'groups', groupId, 'members', uid));
  if (!snap.exists()) return null;
  return parseRole((snap.data() as Record<string, unknown>).role);
}

export async function getGroupMemberPreviews(
  groupId: string,
  max = 4,
): Promise<GroupMemberPreview[]> {
  const snap = await getDocs(collection(db, 'groups', groupId, 'members'));
  const ranked = snap.docs
    .map((item) => {
      const data = item.data() as Record<string, unknown>;
      return {
        uid: item.id,
        username: String(data.username || ''),
        role: parseRole(data.role),
        avatarUrl:
          typeof data.avatarUrl === 'string' && data.avatarUrl ? data.avatarUrl : null,
      };
    })
    .sort((a, b) => {
      const rank = { owner: 0, admin: 1, member: 2 };
      return rank[a.role] - rank[b.role] || a.username.localeCompare(b.username);
    })
    .slice(0, max);

  return Promise.all(
    ranked.map(async (member) => {
      if (member.avatarUrl) {
        return { uid: member.uid, username: member.username, avatarUrl: member.avatarUrl };
      }
      const prof = await fetchFirestoreProfile(member.uid);
      return {
        uid: member.uid,
        username: member.username,
        avatarUrl: prof?.avatarUrl ?? null,
      };
    }),
  );
}

/** Solicitud para unirse a un grupo privado. */
export async function requestJoinGroup(
  groupId: string,
  user: { uid: string; username: string; displayName: string; avatarUrl?: string | null },
) {
  const groupSnap = await getDoc(doc(db, 'groups', groupId));
  if (!groupSnap.exists()) throw new Error('Grupo no encontrado');
  const data = groupSnap.data() as Record<string, unknown>;
  if (data.isPublic !== false) {
    await joinGroup(groupId, user);
    return 'joined' as const;
  }
  const memberSnap = await getDoc(doc(db, 'groups', groupId, 'members', user.uid));
  if (memberSnap.exists()) return 'already' as const;
  await setDoc(doc(db, 'groups', groupId, 'joinRequests', user.uid), {
    uid: user.uid,
    username: user.username,
    displayName: user.displayName || user.username,
    status: 'pending',
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
  return 'requested' as const;
}
