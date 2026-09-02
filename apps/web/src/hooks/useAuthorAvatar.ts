import { useEffect, useState } from 'react';
import { fetchFirestoreProfile } from '../lib/profileFirestore';
import { mergeAvatarUrl, resolveUserAvatar } from '../lib/userAvatar';

/** Cache en memoria: evita parpadeo foto→letra entre remounts / re-fetch. */
const avatarCache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

export function peekCachedAvatar(uid: string | null | undefined): string | null {
  const id = String(uid || '').trim();
  if (!id) return null;
  return avatarCache.has(id) ? (avatarCache.get(id) ?? null) : null;
}

export function seedAvatarCache(uid: string | null | undefined, url: string | null | undefined) {
  const id = String(uid || '').trim();
  const resolved = resolveUserAvatar(url);
  if (!id || !resolved) return;
  const prev = avatarCache.get(id);
  avatarCache.set(id, mergeAvatarUrl(prev, resolved));
}

async function loadAvatarForUid(uid: string): Promise<string | null> {
  if (avatarCache.has(uid)) return avatarCache.get(uid) ?? null;
  const existing = inflight.get(uid);
  if (existing) return existing;

  const promise = fetchFirestoreProfile(uid)
    .then((profile) => {
      const url = resolveUserAvatar(profile?.avatarUrl);
      avatarCache.set(uid, url);
      inflight.delete(uid);
      return url;
    })
    .catch(() => {
      inflight.delete(uid);
      if (!avatarCache.has(uid)) avatarCache.set(uid, null);
      return avatarCache.get(uid) ?? null;
    });

  inflight.set(uid, promise);
  return promise;
}

/**
 * Resuelve avatar del creador por uid, conservando seed y cache.
 * Nunca reemplaza una URL válida por null al actualizar.
 */
export function useAuthorAvatar(
  authorUid?: string | null,
  seedUrl?: string | null,
): string | null {
  const uid = String(authorUid || '').trim();
  const seed = resolveUserAvatar(seedUrl);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    if (!uid) return seed;
    seedAvatarCache(uid, seed);
    return mergeAvatarUrl(peekCachedAvatar(uid), seed);
  });

  useEffect(() => {
    if (!uid) {
      setAvatarUrl(seed);
      return;
    }

    seedAvatarCache(uid, seed);
    const fromCache = peekCachedAvatar(uid);
    const next = mergeAvatarUrl(fromCache, seed);
    setAvatarUrl((prev) => mergeAvatarUrl(prev, next));

    let cancelled = false;
    void loadAvatarForUid(uid).then((loaded) => {
      if (cancelled) return;
      setAvatarUrl((prev) => mergeAvatarUrl(prev, mergeAvatarUrl(loaded, seed)));
    });

    return () => {
      cancelled = true;
    };
  }, [uid, seed]);

  return avatarUrl;
}
