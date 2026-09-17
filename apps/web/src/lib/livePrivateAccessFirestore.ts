/** Acceso a LIVE privado: solicitudes + grants (Firestore), vinculado a la sesión privada. */

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { roomKey } from './roomKey';

export type PrivateAccessRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export type PrivateAccessRequest = {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: PrivateAccessRequestStatus;
  sessionId: string;
  createdAtMs: number;
  updatedAtMs: number;
  retryAllowedAtMs?: number | null;
};

export type PrivateLiveSchedule = {
  privateStartsAtMs: number | null;
  privatePendingRequirements: Array<{
    giftId: string;
    quantity: number;
  }> | null;
  privateSessionId: string | null;
  privateActivatedAtMs: number | null;
};

export function canManagePrivateAccess(role: 'host' | 'moderator' | 'viewer'): boolean {
  return role === 'host' || role === 'moderator';
}

function roomRef(roomName: string) {
  return doc(db, 'liveRooms', roomKey(roomName));
}

function requestRef(roomName: string, uid: string) {
  return doc(db, 'liveRooms', roomKey(roomName), 'privateRequests', uid);
}

function grantRef(roomName: string, uid: string) {
  return doc(db, 'liveRooms', roomKey(roomName), 'privateGrants', uid);
}

export async function schedulePrivateLive(
  roomName: string,
  payload: {
    privateStartsAtMs: number;
    requirements: Array<{ giftId: string; quantity: number }>;
    sessionId: string;
  },
) {
  await setDoc(
    roomRef(roomName),
    {
      privateStartsAtMs: payload.privateStartsAtMs,
      privatePendingRequirements: payload.requirements,
      privateSessionId: payload.sessionId,
      privateActivatedAtMs: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function clearPrivateSchedule(roomName: string) {
  await setDoc(
    roomRef(roomName),
    {
      privateStartsAtMs: null,
      privatePendingRequirements: null,
      privateActivatedAtMs: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function markPrivateActivated(roomName: string, atMs = Date.now()) {
  await setDoc(
    roomRef(roomName),
    {
      privateActivatedAtMs: atMs,
      privateStartsAtMs: null,
      privatePendingRequirements: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function setPrivateSessionId(roomName: string, sessionId: string) {
  await setDoc(
    roomRef(roomName),
    {
      privateSessionId: sessionId,
      privateActivatedAtMs: Date.now(),
      privateStartsAtMs: null,
      privatePendingRequirements: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function listenPrivateSchedule(
  roomName: string,
  onData: (schedule: PrivateLiveSchedule) => void,
): Unsubscribe {
  return onSnapshot(roomRef(roomName), (snap) => {
    const data = snap.data() || {};
    onData({
      privateStartsAtMs:
        typeof data.privateStartsAtMs === 'number' ? data.privateStartsAtMs : null,
      privatePendingRequirements: Array.isArray(data.privatePendingRequirements)
        ? data.privatePendingRequirements
        : null,
      privateSessionId:
        typeof data.privateSessionId === 'string' ? data.privateSessionId : null,
      privateActivatedAtMs:
        typeof data.privateActivatedAtMs === 'number' ? data.privateActivatedAtMs : null,
    });
  });
}

export async function requestPrivateAccess(
  roomName: string,
  viewer: {
    uid: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
    sessionId: string;
  },
): Promise<{ ok: true; duplicate?: boolean } | { ok: false; error: string }> {
  const ref = requestRef(roomName, viewer.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    const data = existing.data();
    if (data.status === 'pending' && data.sessionId === viewer.sessionId) {
      return { ok: true, duplicate: true };
    }
    if (data.status === 'approved' && data.sessionId === viewer.sessionId) {
      return { ok: true, duplicate: true };
    }
    if (
      data.status === 'rejected' &&
      data.sessionId === viewer.sessionId &&
      Number(data.retryAllowedAtMs || 0) > Date.now()
    ) {
      return { ok: false, error: 'Solicitud rechazada. Espera para volver a pedir acceso.' };
    }
  }
  const now = Date.now();
  await setDoc(
    ref,
    {
      uid: viewer.uid,
      username: viewer.username,
      displayName: viewer.displayName,
      avatarUrl: viewer.avatarUrl || null,
      status: 'pending',
      sessionId: viewer.sessionId,
      createdAtMs: existing.exists() ? Number(existing.data().createdAtMs || now) : now,
      updatedAtMs: now,
      retryAllowedAtMs: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return { ok: true };
}

export async function setPrivateRequestStatus(
  roomName: string,
  uid: string,
  status: PrivateAccessRequestStatus,
  extra?: { retryAllowedAtMs?: number | null },
) {
  await updateDoc(requestRef(roomName, uid), {
    status,
    updatedAtMs: Date.now(),
    retryAllowedAtMs: extra?.retryAllowedAtMs ?? null,
    updatedAt: serverTimestamp(),
  });
}

export async function grantPrivateAccess(
  roomName: string,
  uid: string,
  sessionId: string,
  source: 'gift' | 'host' | 'unlock',
) {
  const now = Date.now();
  await setDoc(
    grantRef(roomName, uid),
    {
      uid,
      sessionId,
      source,
      grantedAtMs: now,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  const req = requestRef(roomName, uid);
  const snap = await getDoc(req);
  if (snap.exists()) {
    await updateDoc(req, {
      status: 'approved',
      updatedAtMs: now,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function hasPrivateGrant(
  roomName: string,
  uid: string,
  sessionId: string | null,
): Promise<boolean> {
  if (!sessionId) return false;
  const snap = await getDoc(grantRef(roomName, uid));
  if (!snap.exists()) return false;
  return String(snap.data().sessionId || '') === sessionId;
}

export function listenPendingPrivateRequests(
  roomName: string,
  sessionId: string | null,
  onData: (rows: PrivateAccessRequest[]) => void,
): Unsubscribe {
  const col = collection(db, 'liveRooms', roomKey(roomName), 'privateRequests');
  const q = query(col, where('status', '==', 'pending'));
  return onSnapshot(
    q,
    (snap) => {
      const rows: PrivateAccessRequest[] = [];
      for (const item of snap.docs) {
        const data = item.data();
        if (sessionId && String(data.sessionId || '') !== sessionId) continue;
        rows.push({
          uid: String(data.uid || item.id),
          username: String(data.username || ''),
          displayName: String(data.displayName || data.username || 'Liveboomer'),
          avatarUrl: data.avatarUrl ? String(data.avatarUrl) : null,
          status: 'pending',
          sessionId: String(data.sessionId || ''),
          createdAtMs: Number(data.createdAtMs || 0),
          updatedAtMs: Number(data.updatedAtMs || 0),
          retryAllowedAtMs:
            typeof data.retryAllowedAtMs === 'number' ? data.retryAllowedAtMs : null,
        });
      }
      rows.sort((a, b) => a.createdAtMs - b.createdAtMs);
      onData(rows);
    },
    () => onData([]),
  );
}

export function listenMyPrivateRequest(
  roomName: string,
  uid: string,
  onData: (row: PrivateAccessRequest | null) => void,
): Unsubscribe {
  return onSnapshot(requestRef(roomName, uid), (snap) => {
    if (!snap.exists()) {
      onData(null);
      return;
    }
    const data = snap.data();
    onData({
      uid: String(data.uid || uid),
      username: String(data.username || ''),
      displayName: String(data.displayName || ''),
      avatarUrl: data.avatarUrl ? String(data.avatarUrl) : null,
      status: (data.status as PrivateAccessRequestStatus) || 'pending',
      sessionId: String(data.sessionId || ''),
      createdAtMs: Number(data.createdAtMs || 0),
      updatedAtMs: Number(data.updatedAtMs || 0),
      retryAllowedAtMs:
        typeof data.retryAllowedAtMs === 'number' ? data.retryAllowedAtMs : null,
    });
  });
}

export function listenMyPrivateGrant(
  roomName: string,
  uid: string,
  onData: (grant: { sessionId: string; grantedAtMs: number } | null) => void,
): Unsubscribe {
  return onSnapshot(grantRef(roomName, uid), (snap) => {
    if (!snap.exists()) {
      onData(null);
      return;
    }
    const data = snap.data();
    onData({
      sessionId: String(data.sessionId || ''),
      grantedAtMs: Number(data.grantedAtMs || 0),
    });
  });
}

export async function readPrivateSessionId(roomName: string): Promise<string | null> {
  const snap = await getDoc(roomRef(roomName));
  const id = snap.data()?.privateSessionId;
  return typeof id === 'string' && id ? id : null;
}

export function newPrivateSessionId() {
  return `priv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function formatCountdown(remainingMs: number): string {
  const ms = Math.max(0, remainingMs);
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
