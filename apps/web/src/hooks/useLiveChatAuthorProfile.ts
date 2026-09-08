import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { seedAvatarCache } from './useAuthorAvatar';
import { db } from '../lib/firebase';
import { fetchFirestoreProfile, readLevelXpFields } from '../lib/profileFirestore';
import { mergeAvatarUrl, resolveUserAvatar } from '../lib/userAvatar';

export type LiveChatAuthorProfile = {
  uid: string;
  avatarUrl: string | null;
  levelXp: number;
};

const profileCache = new Map<string, LiveChatAuthorProfile>();
const hydrated = new Set<string>();
const inflight = new Map<string, Promise<LiveChatAuthorProfile>>();
const watches = new Map<string, { count: number; unsub: Unsubscribe }>();
const listeners = new Map<string, Set<(next: LiveChatAuthorProfile) => void>>();

function emptyProfile(uid: string): LiveChatAuthorProfile {
  return { uid, avatarUrl: null, levelXp: 0 };
}

function notify(uid: string, next: LiveChatAuthorProfile) {
  profileCache.set(uid, next);
  seedAvatarCache(uid, next.avatarUrl);
  listeners.get(uid)?.forEach((cb) => cb(next));
}

function readCached(uid: string): LiveChatAuthorProfile | null {
  return profileCache.get(uid) ?? null;
}

export function peekLiveChatAuthorProfile(uid: string | null | undefined): LiveChatAuthorProfile | null {
  const id = String(uid || '').trim();
  if (!id) return null;
  return readCached(id);
}

export function seedLiveChatAuthorProfile(
  uid: string | null | undefined,
  patch: { avatarUrl?: string | null; levelXp?: number },
) {
  const id = String(uid || '').trim();
  if (!id) return;
  const prev = readCached(id) ?? emptyProfile(id);
  const next: LiveChatAuthorProfile = {
    uid: id,
    avatarUrl: mergeAvatarUrl(prev.avatarUrl, patch.avatarUrl),
    levelXp:
      patch.levelXp != null && Number.isFinite(Number(patch.levelXp))
        ? Math.max(prev.levelXp, Math.max(0, Math.floor(Number(patch.levelXp))))
        : prev.levelXp,
  };
  notify(id, next);
}

async function loadOnce(uid: string): Promise<LiveChatAuthorProfile> {
  const cached = readCached(uid);
  if (hydrated.has(uid) && cached) return cached;
  const existing = inflight.get(uid);
  if (existing) return existing;

  const promise = fetchFirestoreProfile(uid)
    .then((profile) => {
      const next: LiveChatAuthorProfile = {
        uid,
        avatarUrl: resolveUserAvatar(profile?.avatarUrl) || readCached(uid)?.avatarUrl || null,
        levelXp: Math.max(
          Math.max(0, Math.floor(Number(profile?.levelXp ?? 0))),
          readCached(uid)?.levelXp ?? 0,
        ),
      };
      hydrated.add(uid);
      notify(uid, next);
      inflight.delete(uid);
      return next;
    })
    .catch(() => {
      inflight.delete(uid);
      hydrated.add(uid);
      const fallback = readCached(uid) ?? emptyProfile(uid);
      notify(uid, fallback);
      return fallback;
    });

  inflight.set(uid, promise);
  return promise;
}

function startWatch(uid: string) {
  const current = watches.get(uid);
  if (current) {
    current.count += 1;
    return;
  }

  const unsub = onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) {
        notify(uid, readCached(uid) ?? emptyProfile(uid));
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      const next: LiveChatAuthorProfile = {
        uid,
        avatarUrl: mergeAvatarUrl(
          readCached(uid)?.avatarUrl,
          resolveUserAvatar({
            avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : null,
            photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
            profileImage: typeof data.profileImage === 'string' ? data.profileImage : null,
          }),
        ),
        levelXp: readLevelXpFields(data).effective,
      };
      hydrated.add(uid);
      notify(uid, next);
    },
    () => {
      void loadOnce(uid);
    },
  );

  watches.set(uid, { count: 1, unsub });
}

function stopWatch(uid: string) {
  const current = watches.get(uid);
  if (!current) return;
  current.count -= 1;
  if (current.count > 0) return;
  current.unsub();
  watches.delete(uid);
}

/** Precarga en lote (1 lectura por uid único, reutiliza cache). */
export function prefetchLiveChatAuthorProfiles(uids: Array<string | null | undefined>) {
  const unique = new Set(
    uids.map((uid) => String(uid || '').trim()).filter(Boolean),
  );
  unique.forEach((uid) => {
    void loadOnce(uid);
  });
}

export function useLiveChatAuthorProfile(
  uid?: string | null,
  seed?: { avatarUrl?: string | null; levelXp?: number },
): LiveChatAuthorProfile {
  const id = String(uid || '').trim();

  const [profile, setProfile] = useState<LiveChatAuthorProfile>(() => {
    if (!id) return emptyProfile('');
    if (seed) seedLiveChatAuthorProfile(id, seed);
    return readCached(id) ?? emptyProfile(id);
  });

  useEffect(() => {
    if (!id) {
      setProfile(emptyProfile(''));
      return;
    }

    if (seed) seedLiveChatAuthorProfile(id, seed);
    setProfile(readCached(id) ?? emptyProfile(id));

    const subs = listeners.get(id) ?? new Set<(next: LiveChatAuthorProfile) => void>();
    const onChange = (next: LiveChatAuthorProfile) => setProfile(next);
    subs.add(onChange);
    listeners.set(id, subs);

    startWatch(id);
    void loadOnce(id);

    return () => {
      subs.delete(onChange);
      if (subs.size === 0) listeners.delete(id);
      stopWatch(id);
    };
  }, [id, seed?.avatarUrl, seed?.levelXp]);

  return id ? profile : emptyProfile('');
}
