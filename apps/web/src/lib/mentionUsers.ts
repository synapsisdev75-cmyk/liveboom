import { fetchPublicUserByUsername, searchFirestoreUsers, type PublicFsUser } from './profileFirestore';

const cache = new Map<string, PublicFsUser | null>();
const inflight = new Map<string, Promise<PublicFsUser | null>>();

function keyOf(handle: string) {
  return String(handle || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
}

export function peekMentionUser(handle: string): PublicFsUser | null | undefined {
  const key = keyOf(handle);
  if (!key) return null;
  if (!cache.has(key)) return undefined;
  return cache.get(key);
}

export async function resolveMentionUser(handle: string): Promise<PublicFsUser | null> {
  const key = keyOf(handle);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = fetchPublicUserByUsername(key)
    .then((user) => {
      cache.set(key, user);
      inflight.delete(key);
      return user;
    })
    .catch(() => {
      inflight.delete(key);
      return null;
    });
  inflight.set(key, job);
  return job;
}

export async function resolveMentionUsers(handles: string[]): Promise<Map<string, PublicFsUser>> {
  const unique = [...new Set(handles.map(keyOf).filter(Boolean))];
  const found = new Map<string, PublicFsUser>();
  await Promise.all(
    unique.map(async (handle) => {
      const user = await resolveMentionUser(handle);
      if (user) found.set(handle, user);
    }),
  );
  return found;
}

export async function searchMentionUsers(needle: string): Promise<PublicFsUser[]> {
  const query = keyOf(needle);
  if (!query) return [];
  const list = await searchFirestoreUsers(query);
  for (const user of list) {
    const handle = keyOf(user.username);
    if (handle) cache.set(handle, user);
  }
  return list.slice(0, 8);
}
