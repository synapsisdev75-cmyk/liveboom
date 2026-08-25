import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import type { SessionUser } from './api';
import { firebaseApp } from './firebase';
import { ensureUserStorageFolder } from './storage';

const db: Firestore = getFirestore(firebaseApp);

export type PublicFsUser = {
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

function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, '').toLowerCase();
}

export function profileHref(username: string, uid?: string | null) {
  const handle = encodeURIComponent(
    String(username || '')
      .trim()
      .replace(/^@/, '') || 'user',
  );
  const id = String(uid || '').trim();
  return id ? `/u/${handle}?uid=${encodeURIComponent(id)}` : `/u/${handle}`;
}

function mapDoc(id: string, data: Record<string, unknown>): PublicFsUser {
  const username = String(data.username || '');
  return {
    id,
    firebaseUid: String(data.firebaseUid || id),
    username,
    email: String(data.email || ''),
    displayName: String(data.displayName || username),
    avatarUrl: (data.avatarUrl as string | null) ?? null,
    bio: (data.bio as string | null) ?? null,
    birthDate: (data.birthDate as string | null) ?? null,
    category: (data.category as string | null) ?? null,
    coinsBalance: Number(data.coinsBalance ?? 0),
  };
}

export function mapFirestoreUser(user: PublicFsUser): SessionUser {
  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    displayName: user.displayName,
    handle: user.username,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    birthDate: user.birthDate,
    category: user.category,
    coins: user.coinsBalance,
    coinsBalance: user.coinsBalance,
  };
}

export async function fetchFirestoreProfile(uid: string): Promise<SessionUser | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return mapFirestoreUser(mapDoc(snap.id, snap.data() as Record<string, unknown>));
}

export async function setFirestoreCoins(uid: string, coins: number) {
  const id = String(uid || '').trim();
  if (!id) return;
  const next = Math.max(0, Math.floor(Number(coins) || 0));
  await updateDoc(doc(db, 'users', id), {
    coinsBalance: next,
    updatedAt: serverTimestamp(),
  });
}

/** Suma coins al saldo Firestore (ganancias del host, etc.). */
export async function addFirestoreCoins(uid: string, delta: number) {
  const id = String(uid || '').trim();
  const amount = Math.floor(Number(delta) || 0);
  if (!id || amount === 0) return null;
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'users', id);
    const snap = await tx.get(ref);
    const current = snap.exists() ? Number(snap.data()?.coinsBalance ?? 0) : 0;
    const next = Math.max(0, current + amount);
    tx.set(
      ref,
      {
        coinsBalance: next,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return next;
  });
}

export async function fetchPublicUserByUid(uid: string): Promise<PublicFsUser | null> {
  const id = String(uid || '').trim();
  if (!id) return null;
  const userSnap = await getDoc(doc(db, 'users', id));
  if (!userSnap.exists()) return null;
  return mapDoc(userSnap.id, userSnap.data() as Record<string, unknown>);
}

export async function fetchPublicUserByUsername(username: string): Promise<PublicFsUser | null> {
  const needle = normalizeUsername(username);
  if (!needle) return null;

  const byHandle = await getDoc(doc(db, 'usernames', needle));
  if (byHandle.exists()) {
    const uid = String((byHandle.data() as { uid?: string }).uid || '');
    const user = uid ? await fetchPublicUserByUid(uid) : null;
    if (user) return user;
  }

  const asUid = await fetchPublicUserByUid(needle);
  if (asUid) return asUid;

  const q = query(collection(db, 'users'), where('username', '==', needle), limit(1));
  const result = await getDocs(q);
  const first = result.docs[0];
  if (first) return mapDoc(first.id, first.data() as Record<string, unknown>);

  const prefixEnd = `${needle}\uf8ff`;
  const loose = query(
    collection(db, 'users'),
    where('username', '>=', needle),
    where('username', '<=', prefixEnd),
    limit(8),
  );
  const looseSnap = await getDocs(loose);
  const match = looseSnap.docs
    .map((item) => mapDoc(item.id, item.data() as Record<string, unknown>))
    .find((user) => user.username.toLowerCase() === needle);
  return match ?? null;
}

export async function searchFirestoreUsers(needleRaw: string): Promise<PublicFsUser[]> {
  const needle = normalizeUsername(needleRaw);
  if (!needle) return [];

  const exact = await fetchPublicUserByUsername(needle);
  const results: PublicFsUser[] = [];
  if (exact) results.push(exact);

  const prefixEnd = `${needle}\uf8ff`;
  const q = query(
    collection(db, 'users'),
    where('username', '>=', needle),
    where('username', '<=', prefixEnd),
    limit(24),
  );
  const snaps = await getDocs(q);
  for (const item of snaps.docs) {
    const mapped = mapDoc(item.id, item.data() as Record<string, unknown>);
    if (!results.some((row) => row.firebaseUid === mapped.firebaseUid)) {
      results.push(mapped);
    }
  }
  return results.slice(0, 24);
}

export async function ensureFirestoreProfile(input: {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
}): Promise<SessionUser | null> {
  const existing = await fetchFirestoreProfile(input.uid);
  if (existing) return existing;

  const base =
    String(input.displayName || input.email.split('@')[0] || 'user')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 20) || 'user';
  const username = `${base}_${input.uid.slice(0, 6)}`;

  await saveFirestoreProfile({
    uid: input.uid,
    email: input.email,
    username,
    displayName: input.displayName || username,
    avatarUrl: input.photoURL,
    bio: '',
    birthDate: null,
    category: 'musica',
  });
  void ensureUserStorageFolder(input.uid).catch(() => undefined);
  return fetchFirestoreProfile(input.uid);
}

export async function saveFirestoreProfile(input: {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  birthDate: string | null;
  category: string | null;
}): Promise<SessionUser> {
  const username = normalizeUsername(input.username);
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    throw new Error('El usuario debe tener 3-24 caracteres (a-z, 0-9, _).');
  }

  const userRef = doc(db, 'users', input.uid);
  const usernameRef = doc(db, 'usernames', username);

  await runTransaction(db, async (tx) => {
    const currentUser = await tx.get(userRef);
    const usernameDoc = await tx.get(usernameRef);

    if (usernameDoc.exists()) {
      const owner = String((usernameDoc.data() as { uid?: string }).uid || '');
      if (owner && owner !== input.uid) {
        throw new Error('Ese nombre de usuario ya está en uso.');
      }
    }

    const prevUsername = currentUser.exists()
      ? normalizeUsername(String((currentUser.data() as { username?: string }).username || ''))
      : '';

    if (prevUsername && prevUsername !== username) {
      const oldRef = doc(db, 'usernames', prevUsername);
      const oldDoc = await tx.get(oldRef);
      if (oldDoc.exists() && String((oldDoc.data() as { uid?: string }).uid || '') === input.uid) {
        tx.delete(oldRef);
      }
    }

    const payload = {
      firebaseUid: input.uid,
      email: input.email,
      username,
      displayName: input.displayName.trim().slice(0, 48) || username,
      avatarUrl: input.avatarUrl,
      bio: input.bio.trim().slice(0, 280) || null,
      birthDate: input.birthDate,
      category: input.category,
      coinsBalance: currentUser.exists()
        ? Number((currentUser.data() as { coinsBalance?: number }).coinsBalance ?? 0)
        : 0,
      updatedAt: serverTimestamp(),
      createdAt: currentUser.exists()
        ? (currentUser.data() as { createdAt?: unknown }).createdAt || serverTimestamp()
        : serverTimestamp(),
    };

    tx.set(userRef, payload, { merge: true });
    tx.set(usernameRef, { uid: input.uid, username }, { merge: true });
  });

  const saved = await fetchFirestoreProfile(input.uid);
  if (!saved) throw new Error('No se pudo leer el perfil guardado en Firebase.');
  void ensureUserStorageFolder(input.uid).catch(() => undefined);
  return saved;
}
