import { collection, getDocs, getDoc, doc, limit, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import { profileHref, readLevelXpFields } from './profileFirestore';

const PRESENCE_ONLINE_MS = 90_000;

export type AdminUserRow = {
  uid: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  levelXp: number;
  levelXpPinned: number | null;
  levelXpOrganic: number;
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
    const xp = readLevelXpFields(data as Record<string, unknown>);
    rows.push({
      uid,
      username,
      displayName: String(data.displayName || username || 'Usuario'),
      email: String(data.email || ''),
      avatarUrl: (data.avatarUrl as string | null) ?? null,
      levelXp: xp.effective,
      levelXpPinned: xp.pinned,
      levelXpOrganic: xp.organic,
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

/** Saldo blast en Firestore — actualización en tiempo real para Super Admin. */
export function subscribeAdminUserBalances(
  callback: (balances: Record<string, number>) => void,
): () => void {
  const q = query(collection(db, 'users'), limit(500));
  return onSnapshot(
    q,
    (snap) => {
      const balances: Record<string, number> = {};
      for (const d of snap.docs) {
        balances[d.id] = Number(d.data().coinsBalance ?? 0);
      }
      callback(balances);
    },
    (err) => console.warn('[admin] balances snapshot', err),
  );
}
