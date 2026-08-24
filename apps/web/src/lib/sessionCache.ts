import type { SessionUser } from './api';

const KEY = 'liveboom.session.profile.v1';

export function cacheSessionProfile(profile: SessionUser) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        ...profile,
        cachedAt: Date.now(),
      }),
    );
  } catch {
    // storage lleno / privado
  }
}

export function readCachedSessionProfile(uid?: string | null): SessionUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SessionUser & { cachedAt?: number };
    if (!data?.firebaseUid || !data?.handle) return null;
    if (uid && data.firebaseUid !== uid) return null;
    return {
      id: data.id,
      firebaseUid: data.firebaseUid,
      email: data.email,
      displayName: data.displayName,
      handle: data.handle,
      avatarUrl: data.avatarUrl ?? null,
      bio: data.bio ?? null,
      birthDate: data.birthDate ?? null,
      category: data.category ?? null,
      coins: Number(data.coins ?? data.coinsBalance ?? 0),
      coinsBalance: Number(data.coinsBalance ?? data.coins ?? 0),
    };
  } catch {
    return null;
  }
}

export function clearCachedSessionProfile() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
