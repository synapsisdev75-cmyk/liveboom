import {
  createMyProfile,
  getUserByUsername,
  myWallet,
  searchUsers,
  updateMyProfile,
} from '@liveboom/dataconnect';
import type { SessionUser } from './api';
import { dataConnect } from './firebase';

const EXTRA_KEY = (uid: string) => `liveboom:profileExtra:${uid}`;

export type ProfileExtra = {
  displayName?: string;
  birthDate?: string | null;
  category?: string | null;
};

export type PublicDcUser = {
  id: string;
  firebaseUid: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  birthDate: string | null;
  category: string | null;
  coinsBalance: number;
};

type DcUserLike = {
  id: string;
  username: string;
  email?: string;
  avatarUrl?: string | null;
  bio?: string | null;
  coinsBalance: number;
  firebaseUid?: string;
};

export function readProfileExtra(uid: string): ProfileExtra {
  try {
    const raw = localStorage.getItem(EXTRA_KEY(uid));
    if (!raw) return {};
    return JSON.parse(raw) as ProfileExtra;
  } catch {
    return {};
  }
}

export function writeProfileExtra(uid: string, extra: ProfileExtra) {
  localStorage.setItem(EXTRA_KEY(uid), JSON.stringify(extra));
}

function usernameFromFirebase(displayName: string | null, email: string | null, uid: string) {
  const fromName = String(displayName || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 20);
  if (fromName.length >= 3) return fromName;
  const base =
    String(email?.split('@')[0] || uid)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 20) || 'user';
  return `${base}_${uid.slice(0, 8)}`;
}

export function mapDataConnectUser(user: DcUserLike, uid: string): SessionUser {
  const extra = readProfileExtra(uid);
  return {
    id: user.id,
    firebaseUid: uid,
    email: user.email || `${uid}@users.liveboom.local`,
    displayName: extra.displayName || user.username,
    handle: user.username,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
    birthDate: extra.birthDate ?? null,
    category: extra.category ?? null,
    coins: user.coinsBalance,
    coinsBalance: user.coinsBalance,
  };
}

function toPublic(user: DcUserLike & { firebaseUid?: string }, uidHint?: string): PublicDcUser {
  const extra = uidHint || user.firebaseUid ? readProfileExtra(uidHint || user.firebaseUid || '') : {};
  return {
    id: user.id,
    firebaseUid: user.firebaseUid || '',
    username: user.username,
    email: user.email || '',
    displayName: extra.displayName || user.username,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
    birthDate: extra.birthDate ?? null,
    category: extra.category ?? null,
    coinsBalance: user.coinsBalance,
  };
}

export async function fetchDataConnectProfile(uid: string): Promise<SessionUser | null> {
  const { data } = await myWallet(dataConnect);
  const user = data?.users?.[0];
  if (!user) return null;
  return mapDataConnectUser(user, uid);
}

export async function fetchPublicUserByUsername(username: string): Promise<PublicDcUser | null> {
  const needle = username.trim().replace(/^@/, '').toLowerCase();
  if (!needle) return null;
  const { data } = await getUserByUsername(dataConnect, { username: needle });
  const user = data?.users?.[0];
  if (!user) return null;
  return toPublic(user, user.firebaseUid);
}

export async function searchDataConnectUsers(query: string): Promise<PublicDcUser[]> {
  const needle = query.trim().replace(/^@/, '');
  if (!needle) return [];
  const { data } = await searchUsers(dataConnect, { needle });
  return (data?.users || []).map((user) => toPublic(user));
}

export async function ensureDataConnectProfile(input: {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
}): Promise<SessionUser | null> {
  const existing = await fetchDataConnectProfile(input.uid);
  if (existing) return existing;

  const username = usernameFromFirebase(input.displayName, input.email, input.uid);
  try {
    await createMyProfile(dataConnect, {
      username,
      email: input.email,
      avatarUrl: input.photoURL,
    });
    if (input.displayName) {
      writeProfileExtra(input.uid, { displayName: input.displayName });
    }
  } catch {
    // puede existir por username/email
  }
  return fetchDataConnectProfile(input.uid);
}

export async function saveDataConnectProfile(input: {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  birthDate: string;
  category: string;
}): Promise<SessionUser | null> {
  writeProfileExtra(input.uid, {
    displayName: input.displayName,
    birthDate: input.birthDate,
    category: input.category,
  });

  const payload = {
    username: input.username,
    email: input.email,
    avatarUrl: input.avatarUrl,
    bio: input.bio,
  };

  const existing = await fetchDataConnectProfile(input.uid);
  if (existing) {
    const { data } = await updateMyProfile(dataConnect, payload);
    if ((data?.user_updateMany ?? 0) < 1) {
      await createMyProfile(dataConnect, payload);
    }
  } else {
    try {
      await createMyProfile(dataConnect, payload);
    } catch {
      await updateMyProfile(dataConnect, payload);
    }
  }

  return fetchDataConnectProfile(input.uid);
}
