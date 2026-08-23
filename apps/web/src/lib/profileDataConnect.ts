import { createMyProfile, myWallet, updateMyProfile } from '@liveboom/dataconnect';
import type { SessionUser } from './api';
import { dataConnect } from './firebase';
import { readPendingBirthDate } from './birthDate';

type WalletUser = {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string | null;
  bio?: string | null;
  coinsBalance: number;
};

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

export function mapDataConnectUser(user: WalletUser, uid: string): SessionUser {
  return {
    id: user.id,
    firebaseUid: uid,
    email: user.email,
    displayName: user.username,
    handle: user.username,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
    birthDate: readPendingBirthDate(uid),
    category: null,
    coins: user.coinsBalance,
    coinsBalance: user.coinsBalance,
  };
}

export async function fetchDataConnectProfile(uid: string): Promise<SessionUser | null> {
  const { data } = await myWallet(dataConnect);
  const user = data?.users?.[0];
  if (!user) return null;
  return mapDataConnectUser(user, uid);
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
  await createMyProfile(dataConnect, {
    username,
    email: input.email,
    avatarUrl: input.photoURL,
  });
  return fetchDataConnectProfile(input.uid);
}

export async function saveDataConnectProfile(input: {
  uid: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  bio: string;
}): Promise<SessionUser | null> {
  await updateMyProfile(dataConnect, {
    username: input.username,
    email: input.email,
    avatarUrl: input.avatarUrl,
    bio: input.bio,
  }).catch(async () => {
    await createMyProfile(dataConnect, {
      username: input.username,
      email: input.email,
      avatarUrl: input.avatarUrl,
    });
    await updateMyProfile(dataConnect, {
      username: input.username,
      email: input.email,
      avatarUrl: input.avatarUrl,
      bio: input.bio,
    });
  });
  return fetchDataConnectProfile(input.uid);
}
