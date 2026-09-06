import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { releaseOwnCallPresence } from '../lib/callAvailability';
import { releaseCallSession } from '../lib/liveKitCallService';
import { clearCallSession, readCallSession, saveCallSession } from '../lib/callSessionPersist';
import {
  endPrivateCall,
  peekPrivateCallStatus,
  postCallHistoryMessage,
  readCallBillingSnapshot,
  type FriendChip,
} from '../lib/socialFirestore';
import { useAuthStore } from './authStore';

export type CallPeer = FriendChip;

type CallStatus = 'idle' | 'ringing-out' | 'ringing-in' | 'active';

export type IncomingCall = {
  chatId: string;
  callId: string;
  video: boolean;
  peer: CallPeer;
  rateBlasts?: number;
  giftName?: string | null;
  giftEmoji?: string | null;
};

export type VideoCallEndedSummary = {
  handle: string;
  durationSec: number;
  rateBlasts: number;
  blocksCharged: number;
  totalBlasts: number;
  giftName: string | null;
  received: boolean;
};

export type CallBillingLive = {
  rateBlasts: number;
  spentBlasts: number;
  blocksCharged: number;
  giftName: string;
  payerUid: string | null;
};

type CallState = {
  status: CallStatus;
  chatId: string | null;
  callId: string | null;
  peer: CallPeer | null;
  video: boolean;
  token: string | null;
  serverUrl: string | null;
  incoming: IncomingCall | null;
  /** Timestamp cuando pasó a active (para duración). */
  activeStartedAt: number | null;
  /** Recarga de página: intentando recuperar la sesión LiveKit. */
  recovering: boolean;
  endedSummary: VideoCallEndedSummary | null;
  callBilling: CallBillingLive | null;
  setCallBilling: (value: CallBillingLive | null) => void;
  setRecovering: (value: boolean) => void;
  clearEndedSummary: () => void;
  setIncoming: (incoming: IncomingCall | null) => void;
  beginOutgoing: (payload: {
    chatId: string;
    callId: string;
    peer: CallPeer;
    video: boolean;
    token: string;
    serverUrl: string;
  }) => void;
  beginIncomingAccepted: (payload: {
    chatId: string;
    callId: string;
    peer: CallPeer;
    video: boolean;
    token: string;
    serverUrl: string;
  }) => void;
  markActive: (connectedAtMs?: number) => void;
  hangup: (outcome?: 'completed' | 'missed' | 'cancelled' | 'declined', opts?: { skipHistory?: boolean }) => Promise<void>;
};

export const useCallStore = create<CallState>((set, get) => ({
  status: 'idle',
  chatId: null,
  callId: null,
  peer: null,
  video: false,
  token: null,
  serverUrl: null,
  incoming: null,
  activeStartedAt: null,
  recovering: false,
  endedSummary: null,
  callBilling: null,
  setCallBilling: (value) => set({ callBilling: value }),
  setRecovering: (value) => set({ recovering: value }),
  clearEndedSummary: () => set({ endedSummary: null }),

  setIncoming: (incoming) => {
    const { status } = get();
    if (status === 'active' || status === 'ringing-out') return;
    if (incoming) {
      saveCallSession({
        chatId: incoming.chatId,
        callId: incoming.callId,
        video: incoming.video,
        role: 'callee',
        connectedAt: null,
        peer: incoming.peer,
      });
    } else {
      clearCallSession();
    }
    set({
      incoming,
      status: incoming ? 'ringing-in' : 'idle',
      callId: incoming?.callId || null,
    });
  },

  beginOutgoing: ({ chatId, callId, peer, video, token, serverUrl }) => {
    saveCallSession({
      chatId,
      callId,
      video,
      role: 'caller',
      connectedAt: null,
      peer,
    });
    set({
      status: 'ringing-out',
      chatId,
      callId,
      peer,
      video,
      token,
      serverUrl,
      incoming: null,
      activeStartedAt: null,
    });
  },

  beginIncomingAccepted: ({ chatId, callId, peer, video, token, serverUrl }) => {
    saveCallSession({
      chatId,
      callId,
      video,
      role: 'callee',
      connectedAt: Date.now(),
      peer,
    });
    set({
      status: 'active',
      chatId,
      callId,
      peer,
      video,
      token,
      serverUrl,
      incoming: null,
      activeStartedAt: Date.now(),
    });
  },

  markActive: (connectedAtMs) => {
    if (get().status === 'idle') return;
    const parsed = Number(connectedAtMs);
    const fromServer = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    const started = fromServer || get().activeStartedAt || Date.now();
    const existing = readCallSession();
    const prev = get();
    if (prev.chatId && prev.callId && prev.peer) {
      saveCallSession({
        chatId: prev.chatId,
        callId: prev.callId,
        video: prev.video,
        role: existing?.role || (prev.status === 'ringing-in' ? 'callee' : 'caller'),
        connectedAt: started,
        peer: prev.peer,
      });
    }
    set({
      status: 'active',
      activeStartedAt: started,
    });
  },

    hangup: async (forcedOutcome, opts) => {
    const prev = get();
    const chatId = prev.chatId || prev.incoming?.chatId || null;
    const callId = prev.callId || prev.incoming?.callId || null;
    const wasActive = prev.status === 'active';
    const wasRingingOut = prev.status === 'ringing-out';
    const wasRingingIn = prev.status === 'ringing-in';

    if (wasRingingIn && !wasActive && chatId) {
      const remote = await peekPrivateCallStatus(chatId).catch(() => null);
      if (remote === 'active') {
        clearCallSession();
        set({
          status: 'idle',
          chatId: null,
          callId: null,
          peer: null,
          video: false,
          token: null,
          serverUrl: null,
          incoming: null,
          activeStartedAt: null,
          recovering: false,
          callBilling: null,
        });
        return;
      }
    }

    const video = prev.video || Boolean(prev.incoming?.video);
    const durationSec =
      wasActive && prev.activeStartedAt
        ? Math.max(1, Math.round((Date.now() - prev.activeStartedAt) / 1000))
        : 0;

    const live = prev.callBilling;
    const me = useAuthStore.getState().profile;
    let summary: VideoCallEndedSummary | null = null;
    if (video && wasActive && chatId) {
      const billing = await readCallBillingSnapshot(chatId).catch(() => null);
      const rate = billing?.rateBlasts || live?.rateBlasts || 0;
      const total = billing?.totalBlasts || live?.spentBlasts || 0;
      const blocks = billing?.blocksCharged || live?.blocksCharged || 0;
      const payer = billing?.payerUid || live?.payerUid || null;
      summary = {
        handle: prev.peer?.username || prev.incoming?.peer.username || '',
        durationSec,
        rateBlasts: rate,
        blocksCharged: blocks,
        totalBlasts: total,
        giftName: billing?.giftName || live?.giftName || null,
        received: Boolean(payer && me?.firebaseUid && payer !== me.firebaseUid),
      };
    }

    const cleanup = Promise.all([
      me?.firebaseUid ? releaseOwnCallPresence(me.firebaseUid, callId).catch(() => undefined) : Promise.resolve(),
      releaseCallSession(callId),
      chatId ? endPrivateCall(chatId) : Promise.resolve(),
    ]);
    await Promise.race([
      cleanup,
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 2500);
      }),
    ]);
    clearCallSession();

    set({
      status: 'idle',
      chatId: null,
      callId: null,
      peer: null,
      video: false,
      token: null,
      serverUrl: null,
      incoming: null,
      activeStartedAt: null,
      recovering: false,
      callBilling: null,
      endedSummary: summary,
    });

    let outcome = forcedOutcome;
    if (!outcome) {
      if (wasActive) outcome = 'completed';
      else if (wasRingingIn) outcome = 'declined';
      else if (wasRingingOut) outcome = 'missed';
      else outcome = 'cancelled';
    }

    if (!opts?.skipHistory && me?.firebaseUid && callId && chatId) {
      await postCallHistoryMessage(chatId, me.firebaseUid, {
        callId,
        video,
        outcome,
        durationSec,
        giftName: summary?.giftName,
        rateBlasts: summary?.rateBlasts,
        blocksCharged: summary?.blocksCharged,
        totalBlasts: summary?.totalBlasts,
      }).catch(() => undefined);
    }
  },
}));

export function formatCallClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function connectedAtToMs(value: string | null | undefined): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

export function useCallElapsed() {
  const status = useCallStore((state) => state.status);
  const started = useCallStore((state) => state.activeStartedAt);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status !== 'active' || !started) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - started) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [status, started]);

  return elapsed;
}
