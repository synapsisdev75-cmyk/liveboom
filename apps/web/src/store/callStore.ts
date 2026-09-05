import { useEffect, useState } from 'react';
import { create } from 'zustand';
import {
  endPrivateCall,
  postCallHistoryMessage,
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

  setIncoming: (incoming) => {
    const { status } = get();
    if (status === 'active' || status === 'ringing-out') return;
    set({
      incoming,
      status: incoming ? 'ringing-in' : 'idle',
      callId: incoming?.callId || null,
    });
  },

  beginOutgoing: ({ chatId, callId, peer, video, token, serverUrl }) => {
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
    set({
      status: 'active',
      activeStartedAt: fromServer || get().activeStartedAt || Date.now(),
    });
  },

  hangup: async (forcedOutcome, opts) => {
    const prev = get();
    const chatId = prev.chatId || prev.incoming?.chatId || null;
    const callId = prev.callId || prev.incoming?.callId || null;
    const wasActive = prev.status === 'active';
    const wasRingingOut = prev.status === 'ringing-out';
    const wasRingingIn = prev.status === 'ringing-in';
    const video = prev.video || Boolean(prev.incoming?.video);
    const durationSec =
      wasActive && prev.activeStartedAt
        ? Math.max(1, Math.round((Date.now() - prev.activeStartedAt) / 1000))
        : 0;

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
    });

    if (!chatId) return;

    const me = useAuthStore.getState().profile;
    let outcome = forcedOutcome;
    if (!outcome) {
      if (wasActive) outcome = 'completed';
      else if (wasRingingIn) outcome = 'declined';
      else if (wasRingingOut) outcome = 'missed';
      else outcome = 'cancelled';
    }

    if (!opts?.skipHistory && me?.firebaseUid && callId) {
      await postCallHistoryMessage(chatId, me.firebaseUid, {
        callId,
        video,
        outcome,
        durationSec,
      }).catch(() => undefined);
    }

    await endPrivateCall(chatId);
  },
}));

export function formatCallClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
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
