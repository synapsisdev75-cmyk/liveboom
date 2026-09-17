/** Acceso a LIVE privado: recolección global → countdown → private (Firestore). */

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
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

export type PrivateLivePhase = 'collecting' | 'countdown' | 'private' | 'ended';

export type ViewerPrivateAccess = 'locked' | 'progress' | 'granted';

export type PrivateGiftRequirementProgress = {
  giftId: string;
  requiredQuantity: number;
  receivedQuantity: number;
};

export type PrivateViewerProgressState = {
  sessionId: string;
  progress: Record<string, number>;
  accessGranted: boolean;
  giftEventIds: string[];
};

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
  privatePhase: PrivateLivePhase | null;
  privateStartsAtMs: number | null;
  privatePendingRequirements: Array<{
    giftId: string;
    quantity: number;
  }> | null;
  privateRequirements: PrivateGiftRequirementProgress[] | null;
  privateSessionId: string | null;
  privateActivatedAtMs: number | null;
  countdownDurationMs: number | null;
  requirementsCompletedAtMs: number | null;
  qualifiedViewerUids: string[];
};

const PRIVATE_GIFT_EVENT_MAX = 80;

function roomRef(roomName: string) {
  return doc(db, 'liveRooms', roomKey(roomName));
}

function requestRef(roomName: string, uid: string) {
  return doc(db, 'liveRooms', roomKey(roomName), 'privateRequests', uid);
}

function grantRef(roomName: string, uid: string) {
  return doc(db, 'liveRooms', roomKey(roomName), 'privateGrants', uid);
}

function parseRequirements(raw: unknown): PrivateGiftRequirementProgress[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const rows: PrivateGiftRequirementProgress[] = [];
  for (const item of raw.slice(0, 5)) {
    const giftId = typeof item?.giftId === 'string' ? item.giftId.trim() : '';
    if (!giftId) continue;
    const requiredQuantity = Math.min(
      99,
      Math.max(1, Math.floor(Number(item?.requiredQuantity ?? item?.quantity) || 1)),
    );
    const receivedQuantity = Math.min(
      99,
      Math.max(0, Math.floor(Number(item?.receivedQuantity) || 0)),
    );
    rows.push({ giftId, requiredQuantity, receivedQuantity });
  }
  return rows.length ? rows : null;
}

function requirementsComplete(rows: PrivateGiftRequirementProgress[]): boolean {
  return rows.length > 0 && rows.every((row) => row.receivedQuantity >= row.requiredQuantity);
}

export function canManagePrivateAccess(role: 'host' | 'moderator' | 'viewer'): boolean {
  return role === 'host' || role === 'moderator';
}

/** Activa fase collecting: LIVE sigue público; NO crea privateStartsAtMs. */
export async function startPrivateCollecting(
  roomName: string,
  payload: {
    sessionId: string;
    requirements: Array<{ giftId: string; quantity: number }>;
    countdownDurationMs: number;
  },
) {
  const requirements: PrivateGiftRequirementProgress[] = payload.requirements
    .slice(0, 5)
    .map((row) => ({
      giftId: String(row.giftId),
      requiredQuantity: Math.min(99, Math.max(1, Math.floor(Number(row.quantity) || 1))),
      receivedQuantity: 0,
    }))
    .filter((row) => row.giftId);

  await setDoc(
    roomRef(roomName),
    {
      privatePhase: 'collecting' satisfies PrivateLivePhase,
      privateSessionId: payload.sessionId,
      privateRequirements: requirements,
      privatePendingRequirements: requirements.map((row) => ({
        giftId: row.giftId,
        quantity: row.requiredQuantity,
      })),
      countdownDurationMs: Math.max(0, Math.floor(Number(payload.countdownDurationMs) || 0)),
      privateStartsAtMs: null,
      requirementsCompletedAtMs: null,
      qualifiedViewerUids: [],
      privateGiftEvents: [],
      privateActivatedAtMs: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** @deprecated Prefer startPrivateCollecting — no iniciar timer al activar candado. */
export async function schedulePrivateLive(
  roomName: string,
  payload: {
    privateStartsAtMs: number;
    requirements: Array<{ giftId: string; quantity: number }>;
    sessionId: string;
  },
) {
  await startPrivateCollecting(roomName, {
    sessionId: payload.sessionId,
    requirements: payload.requirements,
    countdownDurationMs: Math.max(0, Math.floor(payload.privateStartsAtMs - Date.now())),
  });
}

export async function clearPrivateSchedule(roomName: string) {
  await setDoc(
    roomRef(roomName),
    {
      privatePhase: null,
      privateStartsAtMs: null,
      privatePendingRequirements: null,
      privateRequirements: null,
      privateActivatedAtMs: null,
      countdownDurationMs: null,
      requirementsCompletedAtMs: null,
      qualifiedViewerUids: [],
      privateGiftEvents: [],
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function markPrivateActivated(roomName: string, atMs = Date.now()) {
  await setDoc(
    roomRef(roomName),
    {
      privatePhase: 'private' satisfies PrivateLivePhase,
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
      privatePhase: 'private' satisfies PrivateLivePhase,
      privateStartsAtMs: null,
      privatePendingRequirements: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Suma progreso global durante collecting (transacción atómica).
 * Al 100% pasa UNA sola vez a countdown y fija privateStartsAtMs.
 */
export async function applyPrivateCollectingGift(
  roomName: string,
  payload: {
    giftId: string;
    units: number;
    clientId: string;
    viewerUid: string;
  },
): Promise<{
  applied: boolean;
  completed: boolean;
  phase: PrivateLivePhase | null;
} | null> {
  const giftId = String(payload.giftId || '').trim();
  const clientId = String(payload.clientId || '').trim();
  const viewerUid = String(payload.viewerUid || '').trim();
  const units = Math.max(1, Math.floor(Number(payload.units) || 1));
  if (!giftId || !clientId) return null;

  return runTransaction(db, async (tx) => {
    const ref = roomRef(roomName);
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const phase = (data.privatePhase as PrivateLivePhase | null) || null;
    if (phase !== 'collecting') {
      return { applied: false, completed: false, phase };
    }

    const eventIds = Array.isArray(data.privateGiftEvents)
      ? data.privateGiftEvents.map((id: unknown) => String(id))
      : [];
    if (eventIds.includes(clientId)) {
      return { applied: false, completed: false, phase };
    }

    const requirements = parseRequirements(data.privateRequirements);
    if (!requirements?.length) {
      return { applied: false, completed: false, phase };
    }

    const idx = requirements.findIndex((row) => row.giftId === giftId);
    if (idx < 0) {
      return { applied: false, completed: false, phase };
    }

    const row = requirements[idx]!;
    if (row.receivedQuantity >= row.requiredQuantity) {
      // Requisito cerrado: regalo normal, no suma ni clasifica.
      return { applied: false, completed: false, phase };
    }

    const room = Math.min(units, row.requiredQuantity - row.receivedQuantity);
    requirements[idx] = {
      ...row,
      receivedQuantity: row.receivedQuantity + room,
    };

    const qualified = Array.isArray(data.qualifiedViewerUids)
      ? data.qualifiedViewerUids.map((uid: unknown) => String(uid)).filter(Boolean)
      : [];
    if (viewerUid && !qualified.includes(viewerUid)) {
      qualified.push(viewerUid);
    }

    const nextEvents = [...eventIds, clientId].slice(-PRIVATE_GIFT_EVENT_MAX);
    const complete = requirementsComplete(requirements);
    const countdownDurationMs = Math.max(0, Math.floor(Number(data.countdownDurationMs) || 0));
    const completedAtMs = complete ? Date.now() : null;
    const nextPhase: PrivateLivePhase = complete ? 'countdown' : 'collecting';
    const privateStartsAtMs =
      complete && completedAtMs != null ? completedAtMs + countdownDurationMs : null;

    tx.set(
      ref,
      {
        privatePhase: nextPhase,
        privateRequirements: requirements,
        privatePendingRequirements: requirements.map((item) => ({
          giftId: item.giftId,
          quantity: item.requiredQuantity,
        })),
        qualifiedViewerUids: qualified,
        privateGiftEvents: nextEvents,
        requirementsCompletedAtMs: completedAtMs,
        privateStartsAtMs,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    return { applied: true, completed: complete, phase: nextPhase };
  });
}

/**
 * Progreso INDIVIDUAL del viewer hacia el candado (sesión actual).
 * Independiente del progreso global que dispara el countdown.
 * Al completar todos los requisitos → accessGranted automático.
 */
export async function applyPrivateViewerGiftProgress(
  roomName: string,
  payload: {
    giftId: string;
    units: number;
    clientId: string;
    viewerUid: string;
  },
): Promise<{
  applied: boolean;
  accessGranted: boolean;
  progress: Record<string, number>;
  requirements: PrivateGiftRequirementProgress[];
} | null> {
  const giftId = String(payload.giftId || '').trim();
  const clientId = String(payload.clientId || '').trim();
  const viewerUid = String(payload.viewerUid || '').trim();
  const units = Math.max(1, Math.floor(Number(payload.units) || 1));
  if (!giftId || !clientId || !viewerUid) return null;

  return runTransaction(db, async (tx) => {
    const room = roomRef(roomName);
    const grant = grantRef(roomName, viewerUid);
    const roomSnap = await tx.get(room);
    const roomData = roomSnap.data() || {};
    const sessionId =
      typeof roomData.privateSessionId === 'string' ? roomData.privateSessionId : '';
    const phase = (roomData.privatePhase as PrivateLivePhase | null) || null;
    if (!sessionId || !phase || phase === 'ended') {
      return {
        applied: false,
        accessGranted: false,
        progress: {},
        requirements: [],
      };
    }

    const requirements = parseRequirements(roomData.privateRequirements);
    if (!requirements?.length) {
      return {
        applied: false,
        accessGranted: false,
        progress: {},
        requirements: [],
      };
    }

    const grantSnap = await tx.get(grant);
    const prev = grantSnap.exists() ? grantSnap.data() || {} : {};
    const sameSession = String(prev.sessionId || '') === sessionId;
    let progress: Record<string, number> = sameSession && prev.progress && typeof prev.progress === 'object'
      ? Object.fromEntries(
          Object.entries(prev.progress as Record<string, unknown>).map(([k, v]) => [
            k,
            Math.max(0, Math.floor(Number(v) || 0)),
          ]),
        )
      : {};
    let eventIds: string[] =
      sameSession && Array.isArray(prev.giftEventIds)
        ? prev.giftEventIds.map((id: unknown) => String(id))
        : [];
    let accessGranted = sameSession && Boolean(prev.accessGranted);

    if (accessGranted) {
      return {
        applied: false,
        accessGranted: true,
        progress,
        requirements: requirements.map((row) => ({
          ...row,
          receivedQuantity: Math.min(
            row.requiredQuantity,
            Math.max(0, Number(progress[row.giftId] || 0)),
          ),
        })),
      };
    }

    if (eventIds.includes(clientId)) {
      return {
        applied: false,
        accessGranted: false,
        progress,
        requirements: requirements.map((row) => ({
          ...row,
          receivedQuantity: Math.min(
            row.requiredQuantity,
            Math.max(0, Number(progress[row.giftId] || 0)),
          ),
        })),
      };
    }

    const req = requirements.find((row) => row.giftId === giftId);
    if (!req) {
      return {
        applied: false,
        accessGranted: false,
        progress,
        requirements: requirements.map((row) => ({
          ...row,
          receivedQuantity: Math.min(
            row.requiredQuantity,
            Math.max(0, Number(progress[row.giftId] || 0)),
          ),
        })),
      };
    }

    const already = Math.max(0, Math.floor(Number(progress[giftId] || 0)));
    if (already >= req.requiredQuantity) {
      // Este requisito individual ya está completo: no suma más.
      eventIds = [...eventIds, clientId].slice(-PRIVATE_GIFT_EVENT_MAX);
      tx.set(
        grant,
        {
          uid: viewerUid,
          sessionId,
          progress,
          giftEventIds: eventIds,
          accessGranted: false,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      return {
        applied: false,
        accessGranted: false,
        progress,
        requirements: requirements.map((row) => ({
          ...row,
          receivedQuantity: Math.min(
            row.requiredQuantity,
            Math.max(0, Number(progress[row.giftId] || 0)),
          ),
        })),
      };
    }

    const add = Math.min(units, req.requiredQuantity - already);
    progress = { ...progress, [giftId]: already + add };
    eventIds = [...eventIds, clientId].slice(-PRIVATE_GIFT_EVENT_MAX);

    const viewerRows = requirements.map((row) => ({
      giftId: row.giftId,
      requiredQuantity: row.requiredQuantity,
      receivedQuantity: Math.min(
        row.requiredQuantity,
        Math.max(0, Math.floor(Number(progress[row.giftId] || 0))),
      ),
    }));
    accessGranted = requirementsComplete(viewerRows);
    const now = Date.now();

    tx.set(
      grant,
      {
        uid: viewerUid,
        sessionId,
        progress,
        giftEventIds: eventIds,
        accessGranted,
        source: accessGranted ? 'gift' : prev.source || null,
        grantedAtMs: accessGranted ? now : prev.grantedAtMs || null,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    return {
      applied: true,
      accessGranted,
      progress,
      requirements: viewerRows,
    };
  });
}

export function listenPrivateViewerProgress(
  roomName: string,
  uid: string,
  sessionId: string | null,
  onData: (state: PrivateViewerProgressState | null) => void,
): Unsubscribe {
  return onSnapshot(grantRef(roomName, uid), (snap) => {
    if (!snap.exists()) {
      onData(null);
      return;
    }
    const data = snap.data();
    const sid = String(data.sessionId || '');
    if (sessionId && sid !== sessionId) {
      onData(null);
      return;
    }
    const progressRaw = data.progress && typeof data.progress === 'object' ? data.progress : {};
    const progress: Record<string, number> = {};
    for (const [k, v] of Object.entries(progressRaw as Record<string, unknown>)) {
      progress[k] = Math.max(0, Math.floor(Number(v) || 0));
    }
    onData({
      sessionId: sid,
      progress,
      accessGranted: Boolean(data.accessGranted),
      giftEventIds: Array.isArray(data.giftEventIds)
        ? data.giftEventIds.map((id: unknown) => String(id))
        : [],
    });
  });
}

export function viewerAccessFromProgress(
  requirements: PrivateGiftRequirementProgress[] | null | undefined,
  progress: Record<string, number> | null | undefined,
  accessGranted: boolean,
): ViewerPrivateAccess {
  if (accessGranted) return 'granted';
  const rows = requirements || [];
  if (!rows.length) return 'locked';
  const any = rows.some((row) => Math.max(0, Number(progress?.[row.giftId] || 0)) > 0);
  return any ? 'progress' : 'locked';
}

export function mergeViewerRequirementProgress(
  requirements: PrivateGiftRequirementProgress[] | null | undefined,
  progress: Record<string, number> | null | undefined,
): PrivateGiftRequirementProgress[] {
  return (requirements || []).map((row) => ({
    giftId: row.giftId,
    requiredQuantity: row.requiredQuantity,
    receivedQuantity: Math.min(
      row.requiredQuantity,
      Math.max(0, Math.floor(Number(progress?.[row.giftId] || 0))),
    ),
  }));
}

export async function grantPrivateAccess(
  roomName: string,
  uid: string,
  sessionId: string,
  source: 'gift' | 'host' | 'unlock' | 'qualified',
) {
  const now = Date.now();
  await setDoc(
    grantRef(roomName, uid),
    {
      uid,
      sessionId,
      source,
      accessGranted: true,
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
  const data = snap.data();
  return (
    String(data.sessionId || '') === sessionId &&
    (Boolean(data.accessGranted) || data.source === 'host' || data.source === 'unlock')
  );
}

export function listenPrivateSchedule(
  roomName: string,
  onData: (schedule: PrivateLiveSchedule) => void,
): Unsubscribe {
  return onSnapshot(roomRef(roomName), (snap) => {
    const data = snap.data() || {};
    const privateRequirements = parseRequirements(data.privateRequirements);
    const pendingFromLegacy = Array.isArray(data.privatePendingRequirements)
      ? data.privatePendingRequirements
          .map((row: { giftId?: string; quantity?: number }) => ({
            giftId: String(row?.giftId || ''),
            quantity: Math.min(99, Math.max(1, Math.floor(Number(row?.quantity) || 1))),
          }))
          .filter((row: { giftId: string }) => row.giftId)
      : null;
    onData({
      privatePhase: (data.privatePhase as PrivateLivePhase | null) || null,
      privateStartsAtMs:
        typeof data.privateStartsAtMs === 'number' ? data.privateStartsAtMs : null,
      privatePendingRequirements: privateRequirements
        ? privateRequirements.map((row) => ({
            giftId: row.giftId,
            quantity: row.requiredQuantity,
          }))
        : pendingFromLegacy,
      privateRequirements,
      privateSessionId:
        typeof data.privateSessionId === 'string' ? data.privateSessionId : null,
      privateActivatedAtMs:
        typeof data.privateActivatedAtMs === 'number' ? data.privateActivatedAtMs : null,
      countdownDurationMs:
        typeof data.countdownDurationMs === 'number' ? data.countdownDurationMs : null,
      requirementsCompletedAtMs:
        typeof data.requirementsCompletedAtMs === 'number'
          ? data.requirementsCompletedAtMs
          : null,
      qualifiedViewerUids: Array.isArray(data.qualifiedViewerUids)
        ? data.qualifiedViewerUids.map((uid: unknown) => String(uid)).filter(Boolean)
        : [],
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
  onData: (grant: {
    sessionId: string;
    grantedAtMs: number;
    accessGranted: boolean;
  } | null) => void,
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
      accessGranted: Boolean(data.accessGranted),
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
