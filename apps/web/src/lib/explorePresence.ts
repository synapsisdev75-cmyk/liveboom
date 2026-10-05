import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type Timestamp as FsTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { roomKey } from './roomKey';

export const EXPLORE_PRESENCE_TTL_MS = 20_000;
export const EXPLORE_HEAT_TTL_MS = 25_000;
export const EXPLORE_PLAZA_TTL_MS = 20 * 60 * 1000;
const LIVE_HEARTBEAT_TTL_MS = 90_000;
const LIVE_START_GRACE_MS = 90_000;
const HEARTBEAT_MS = 8_000;
const WAITING_ALERT_GAP_MS = 30 * 60 * 1000;
export const CREATOR_CLOSING_TTL_MS = 6 * 60 * 60 * 1000;

export type PlazaViewer = {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type PlazaMessage = {
  id: string;
  fromUid: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  text: string;
  createdAtMs: number;
};

export type PlazaProfile = {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
};

function millisOf(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const ms = (value as FsTimestamp).toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

/** Gente con latido fresco en este video. */
export function listenExploreViewers(
  postId: string,
  onChange: (viewers: PlazaViewer[]) => void,
): () => void {
  const viewersQuery = query(collection(db, 'explorePresence', postId, 'viewers'), limit(30));
  return onSnapshot(
    viewersQuery,
    (snap) => {
      const now = Date.now();
      const people: PlazaViewer[] = [];
      for (const item of snap.docs) {
        const data = item.data();
        const at = millisOf(data.heartbeatAt);
        if (at <= 0 || now - at > EXPLORE_PRESENCE_TTL_MS) continue;
        const uid = String(data.uid || item.id || '');
        if (!uid) continue;
        people.push({
          uid,
          username: String(data.username || ''),
          displayName: String(data.displayName || data.username || ''),
          avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : null,
        });
      }
      onChange(people);
    },
    () => onChange([]),
  );
}

/** Publica el conteo para que Para ti suba los videos con gente ahora. */
export function publishExploreHeat(postId: string, count: number): void {
  const safe = Math.max(0, Math.min(40, Math.round(count)));
  void setDoc(
    doc(db, 'explorePresence', postId),
    { count: safe, updatedAt: serverTimestamp() },
    { merge: true },
  ).catch(() => undefined);
}

export function startExploreHeartbeat(postId: string, profile: PlazaProfile): () => void {
  const viewerRef = doc(db, 'explorePresence', postId, 'viewers', profile.uid);
  let stopped = false;

  async function beat() {
    if (stopped) return;
    try {
      await setDoc(viewerRef, {
        uid: profile.uid,
        username: profile.username.slice(0, 24),
        displayName: (profile.displayName || profile.username).slice(0, 80),
        avatarUrl: profile.avatarUrl || null,
        heartbeatAt: serverTimestamp(),
      });
    } catch {
      /* sin sesión o reglas: el conteo público sigue leyéndose */
    }
  }

  void beat();
  const timer = window.setInterval(() => void beat(), HEARTBEAT_MS);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    void deleteDoc(viewerRef).catch(() => undefined);
  };
}

export function listenExploreHeat(onChange: (heat: Map<string, number>) => void): () => void {
  const heatQuery = query(collection(db, 'explorePresence'), where('count', '>', 0), limit(40));
  return onSnapshot(
    heatQuery,
    (snap) => {
      const now = Date.now();
      const heat = new Map<string, number>();
      for (const item of snap.docs) {
        const data = item.data();
        const at = millisOf(data.updatedAt);
        if (at <= 0 || now - at > EXPLORE_HEAT_TTL_MS) continue;
        const count = Math.max(0, Math.round(Number(data.count) || 0));
        if (count > 0) heat.set(item.id, count);
      }
      onChange(heat);
    },
    () => onChange(new Map()),
  );
}

export function listenPlazaMessages(
  postId: string,
  onChange: (messages: PlazaMessage[]) => void,
): () => void {
  let unsub: () => void = () => undefined;
  let stopped = false;

  function attach() {
    unsub();
    const cutoff = Timestamp.fromMillis(Date.now() - EXPLORE_PLAZA_TTL_MS);
    const messagesQuery = query(
      collection(db, 'explorePlaza', postId, 'messages'),
      where('createdAt', '>', cutoff),
      orderBy('createdAt', 'asc'),
      limit(40),
    );
    unsub = onSnapshot(
      messagesQuery,
      (snap) => {
        const now = Date.now();
        const messages: PlazaMessage[] = [];
        for (const item of snap.docs) {
          const data = item.data();
          const createdAtMs = millisOf(data.createdAt);
          if (createdAtMs <= 0 || now - createdAtMs > EXPLORE_PLAZA_TTL_MS) continue;
          const text = String(data.text || '').trim();
          if (!text) continue;
          messages.push({
            id: item.id,
            fromUid: String(data.fromUid || ''),
            username: String(data.username || ''),
            displayName: String(data.displayName || data.username || ''),
            avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : null,
            text,
            createdAtMs,
          });
        }
        onChange(messages);
      },
      () => onChange([]),
    );
  }

  attach();
  const timer = window.setInterval(() => {
    if (!stopped) attach();
  }, 60_000);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    unsub();
  };
}

export async function sendPlazaMessage(postId: string, profile: PlazaProfile, text: string): Promise<void> {
  const clean = text.trim().slice(0, 280);
  if (!clean) return;
  const ref = doc(collection(db, 'explorePlaza', postId, 'messages'));
  await setDoc(ref, {
    fromUid: profile.uid,
    username: profile.username.slice(0, 24),
    displayName: (profile.displayName || profile.username).slice(0, 80),
    avatarUrl: profile.avatarUrl || null,
    text: clean,
    createdAt: serverTimestamp(),
  });
}

export function liveRoomIsOpen(data: Record<string, unknown> | undefined, now = Date.now()): boolean {
  if (!data || data.status !== 'live' || data.isPrivate) return false;
  const heartbeatAtMs = Number(data.heartbeatAtMs || 0);
  const startedAtMs = Number(data.startedAtMs || 0);
  if (heartbeatAtMs > 0) return now - heartbeatAtMs <= LIVE_HEARTBEAT_TTL_MS;
  if (startedAtMs > 0) return now - startedAtMs <= LIVE_START_GRACE_MS;
  return false;
}

export function listenAuthorLive(
  username: string,
  onChange: (open: boolean) => void,
): () => void {
  const key = roomKey(username);
  if (!key || key === 'room') {
    onChange(false);
    return () => undefined;
  }
  return onSnapshot(
    doc(db, 'liveRooms', key),
    (snap) => {
      onChange(snap.exists() && liveRoomIsOpen(snap.data() as Record<string, unknown>));
    },
    () => onChange(false),
  );
}

/** Un aviso al autor cuando ya hay gente en su video y él no está en vivo. */
export async function notifyCreatorPeopleWaiting(input: {
  postId: string;
  authorUid: string;
  count: number;
}): Promise<void> {
  const authorUid = String(input.authorUid || '').trim();
  const postId = String(input.postId || '').trim();
  const count = Math.max(0, Math.min(40, Math.round(input.count)));
  if (!authorUid || !postId || count < 2) return;

  const presenceRef = doc(db, 'explorePresence', postId);
  let claimed = false;
  try {
    claimed = await runTransaction(db, async (tx) => {
      const snap = await tx.get(presenceRef);
      const last = Number(snap.data()?.waitingAlertAt || 0);
      if (last > 0 && Date.now() - last < WAITING_ALERT_GAP_MS) return false;
      tx.set(
        presenceRef,
        {
          count,
          waitingAlertAt: Date.now(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      return true;
    });
  } catch {
    return;
  }
  if (!claimed) return;

  try {
    await addDoc(collection(db, 'users', authorUid, 'liveAlerts'), {
      kind: 'live',
      title: 'Hay gente en tu video',
      href: '/transmitir',
      postId,
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    });
  } catch {
    await setDoc(
      presenceRef,
      { waitingAlertAt: 0, count, updatedAt: serverTimestamp() },
      { merge: true },
    ).catch(() => undefined);
  }
}

export function creatorClosingNote(data: Record<string, unknown> | undefined, now = Date.now()): string {
  if (!data || data.status === 'live') return '';
  const note = String(data.closingNote || '').trim();
  const at = Number(data.closingAtMs || 0);
  if (!note || at <= 0 || now - at > CREATOR_CLOSING_TTL_MS) return '';
  return note.slice(0, 140);
}

export function listenCreatorClosing(username: string, onChange: (note: string) => void): () => void {
  const key = roomKey(username);
  if (!key || key === 'room') {
    onChange('');
    return () => undefined;
  }
  return onSnapshot(
    doc(db, 'liveRooms', key),
    (snap) => {
      onChange(snap.exists() ? creatorClosingNote(snap.data() as Record<string, unknown>) : '');
    },
    () => onChange(''),
  );
}
