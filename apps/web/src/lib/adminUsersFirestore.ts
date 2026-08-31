import { collection, getDocs, getDoc, doc, limit, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import { profileHref } from './profileFirestore';

const PRESENCE_ONLINE_MS = 90_000;

export type AdminUserRow = {
  uid: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  levelXp: number;
  coinsBalance: number;
  online: boolean;
  presenceAt: string | null;
  createdAt: string | null;
  profilePath: string;
};

function asIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

async function isUserOnline(uid: string): Promise<{ online: boolean; presenceAt: string | null }> {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'presence', 'now'));
    if (!snap.exists()) return { online: false, presenceAt: null };
    const presenceAt = asIso(snap.data()?.at);
    if (!presenceAt) return { online: false, presenceAt: null };
    const age = Date.now() - new Date(presenceAt).getTime();
    return { online: age < PRESENCE_ONLINE_MS, presenceAt };
  } catch {
    return { online: false, presenceAt: null };
  }
}

/** Lista usuarios registrados + estado online (solo para Super Admin). */
export async function listAdminUsers(max = 200): Promise<AdminUserRow[]> {
  const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(max));
  let snap;
  try {
    snap = await getDocs(q);
  } catch {
    snap = await getDocs(query(collection(db, 'users'), limit(max)));
  }

  const rows: AdminUserRow[] = [];
  for (const d of snap.docs) {
    const data = d.data();
    const uid = d.id;
    const username = String(data.username || '').replace(/^@/, '');
    const { online, presenceAt } = await isUserOnline(uid);
    rows.push({
      uid,
      username,
      displayName: String(data.displayName || username || 'Usuario'),
      email: String(data.email || ''),
      avatarUrl: (data.avatarUrl as string | null) ?? null,
      levelXp: Number(data.levelXp ?? 0),
      coinsBalance: Number(data.coinsBalance ?? 0),
      online,
      presenceAt,
      createdAt: asIso(data.createdAt),
      profilePath: profileHref(username || 'user', uid),
    });
  }

  rows.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });

  return rows;
}
