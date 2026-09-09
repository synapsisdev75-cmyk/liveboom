import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

/** Presencia de llamada: una sola fuente, voz y video juntos. */
export type CallAvailabilityStatus = 'AVAILABLE' | 'BUSY_CALL';

export type CallAvailability = {
  available: boolean;
  status: CallAvailabilityStatus;
  reason: 'IN_ACTIVE_CALL' | null;
  activeCallId: string | null;
  chatId: string | null;
};

export type CallBusyCode = 'USER_BUSY' | 'USER_ALREADY_IN_CALL';

/** Sin heartbeat, el lock caduca para no dejar cuentas colgadas. RECONNECTING sigue ocupado mientras el cliente late. */
export const CALL_BUSY_STALE_MS = 8 * 60_000;

export class CallBusyError extends Error {
  readonly code: CallBusyCode;
  readonly handle?: string;
  readonly activeCallId?: string | null;

  constructor(code: CallBusyCode, opts?: { handle?: string; activeCallId?: string | null; message?: string }) {
    super(
      opts?.message ||
        (code === 'USER_ALREADY_IN_CALL'
          ? 'Ya tienes una llamada en curso.'
          : opts?.handle
            ? `@${opts.handle} está ocupado en otra llamada.`
            : 'Esta persona está ocupada en otra llamada.'),
    );
    this.name = 'CallBusyError';
    this.code = code;
    this.handle = opts?.handle;
    this.activeCallId = opts?.activeCallId ?? null;
  }
}

function presenceRef(uid: string) {
  return doc(db, 'users', uid, 'presence', 'now');
}

async function peekPresenceCallStatus(chatId: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'chats', chatId));
  const status = (snap.data()?.call as { status?: unknown } | undefined)?.status;
  return status ? String(status) : null;
}

function isLiveCallStatus(status: string | null | undefined): boolean {
  return status === 'ringing' || status === 'accepted' || status === 'connecting' || status === 'connected' || status === 'active';
}

export function isBusyPresence(data: Record<string, unknown> | undefined | null, now = Date.now()): boolean {
  if (!data || data.callStatus !== 'busy') return false;
  const t = Number(data.callUpdatedAtMs) || 0;
  if (t > 0 && now - t > CALL_BUSY_STALE_MS) return false;
  return true;
}

export function availabilityFromData(data: Record<string, unknown> | undefined | null): CallAvailability {
  if (isBusyPresence(data)) {
    return {
      available: false,
      status: 'BUSY_CALL',
      reason: 'IN_ACTIVE_CALL',
      activeCallId: data?.callId ? String(data.callId) : null,
      chatId: data?.callChatId ? String(data.callChatId) : null,
    };
  }
  return {
    available: true,
    status: 'AVAILABLE',
    reason: null,
    activeCallId: null,
    chatId: null,
  };
}

async function releaseIfCallNotLive(
  uid: string,
  availability: CallAvailability,
): Promise<boolean> {
  if (availability.available) return false;
  const live = availability.chatId
    ? await peekPresenceCallStatus(availability.chatId).catch(() => null)
    : null;
  if (isLiveCallStatus(live)) return false;
  await releaseOwnCallPresence(uid, availability.activeCallId);
  return true;
}

/** Libera BUSY local si el chat ya no tiene llamada viva (ended/null/stale). */
export async function releaseStaleOwnCallPresence(uid: string): Promise<void> {
  const availability = await getCallAvailability(uid);
  await releaseIfCallNotLive(uid, availability);
}

export async function getCallAvailability(userId: string): Promise<CallAvailability> {
  const snap = await getDoc(presenceRef(userId));
  return availabilityFromData(snap.data() as Record<string, unknown> | undefined);
}

export function listenCallAvailability(
  userId: string,
  onChange: (availability: CallAvailability) => void,
): Unsubscribe {
  return onSnapshot(presenceRef(userId), (snap) => {
    onChange(availabilityFromData(snap.data() as Record<string, unknown> | undefined));
  });
}

export async function assertCanStartCall(
  callerId: string,
  receiverId: string,
  opts?: { localInCall?: boolean; handle?: string },
): Promise<void> {
  if (opts?.localInCall) {
    throw new CallBusyError('USER_ALREADY_IN_CALL');
  }
  const [caller, receiver] = await Promise.all([
    getCallAvailability(callerId),
    getCallAvailability(receiverId),
  ]);
  if (!caller.available) {
    const stale = await releaseIfCallNotLive(callerId, caller);
    if (!stale) {
      throw new CallBusyError('USER_ALREADY_IN_CALL', { activeCallId: caller.activeCallId });
    }
  }
  if (!receiver.available) {
    const stale = await releaseIfCallNotLive(receiverId, receiver);
    if (!stale) {
      throw new CallBusyError('USER_BUSY', {
        handle: opts?.handle,
        activeCallId: receiver.activeCallId,
      });
    }
  }
}

export async function claimOwnCallBusy(
  uid: string,
  payload: { callId?: string | null; chatId?: string | null; peerUid?: string | null },
): Promise<void> {
  const ref = presenceRef(uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.data() || {}) as Record<string, unknown>;
    const now = Date.now();
    if (isBusyPresence(data, now)) {
      const samePeer =
        payload.peerUid && data.callPeerUid && String(data.callPeerUid) === String(payload.peerUid);
      const sameCall = payload.callId && data.callId && String(data.callId) === String(payload.callId);
      if (!samePeer && !sameCall) {
        throw new CallBusyError('USER_ALREADY_IN_CALL', {
          activeCallId: data.callId ? String(data.callId) : null,
        });
      }
    }
    tx.set(
      ref,
      {
        callStatus: 'busy',
        callId: payload.callId || data.callId || null,
        callChatId: payload.chatId || data.callChatId || null,
        callPeerUid: payload.peerUid || data.callPeerUid || null,
        callUpdatedAtMs: now,
      },
      { merge: true },
    );
  });
}

export async function setCallAvailability(
  uid: string,
  next: {
    available: boolean;
    callId?: string | null;
    chatId?: string | null;
    peerUid?: string | null;
  },
): Promise<void> {
  const ref = presenceRef(uid);
  if (next.available) {
    await setDoc(
      ref,
      {
        callStatus: 'available',
        callId: null,
        callChatId: null,
        callPeerUid: null,
        callUpdatedAtMs: Date.now(),
      },
      { merge: true },
    );
    return;
  }
  await claimOwnCallBusy(uid, next);
}

export async function releaseOwnCallPresence(uid: string, callId?: string | null): Promise<void> {
  const ref = presenceRef(uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.data() || {}) as Record<string, unknown>;
    if (data.callStatus !== 'busy') return;
    if (callId && data.callId && String(data.callId) !== String(callId)) return;
    tx.set(
      ref,
      {
        callStatus: 'available',
        callId: null,
        callChatId: null,
        callPeerUid: null,
        callUpdatedAtMs: Date.now(),
      },
      { merge: true },
    );
  });
}

export function busyMessageForPeer(handle?: string | null, creator = false): { title: string; subtitle: string } {
  const tag = handle ? `@${handle.replace(/^@/, '')}` : 'Esta persona';
  if (creator) {
    return {
      title: `${tag} está en otra llamada en este momento.`,
      subtitle: 'Intenta nuevamente cuando termine.',
    };
  }
  return {
    title: `${tag} está ocupado en otra llamada.`,
    subtitle: 'Intenta nuevamente cuando termine.',
  };
}
