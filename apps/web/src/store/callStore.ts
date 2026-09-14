import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { releaseOwnCallPresence } from '../lib/callAvailability';
import { releasePendingCallMicrophone } from '../lib/callMedia';
import { releaseCallSession, logCallConnect } from '../lib/liveKitCallService';
import { clearCallSession, readCallSession, saveCallSession } from '../lib/callSessionPersist';
import {
  endPrivateCall,
  peekPrivateCallStatus,
  postCallHistoryMessage,
  readCallBillingSnapshot,
  type FriendChip,
} from '../lib/socialFirestore';
import { stopCallBilling } from '../lib/callBillingApi';
import {
  calculateBlastDue,
  creatorCopForBlast,
  normalizePlatformCallType,
} from '../lib/callPricing';
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
  video?: boolean;
  creatorValueCop?: number;
};

export type CallBillingLive = {
  rateBlasts: number;
  spentBlasts: number;
  blocksCharged: number;
  giftName: string;
  payerUid: string | null;
  callType?: string;
  creatorValueCop?: number;
  connectedSeconds?: number;
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
  lastError: string | null;
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
  setCallCredentials: (payload: { token: string; serverUrl: string; callId?: string }) => void;
  hangup: (outcome?: 'completed' | 'missed' | 'cancelled' | 'declined', opts?: { skipHistory?: boolean; error?: string | null }) => Promise<void>;
};

let hangupBusy = false;

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
  lastError: null,
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
    } else if (status === 'ringing-in') {
      clearCallSession();
    }
    set({
      incoming,
      status: incoming ? 'ringing-in' : 'idle',
      chatId: incoming?.chatId || null,
      callId: incoming?.callId || null,
    });
  },

  beginOutgoing: ({ chatId, callId, peer, video, token, serverUrl }) => {
    const prev = get();
    logCallConnect('callStatus', {
      callId,
      roomName: null,
      callerId: useAuthStore.getState().profile?.firebaseUid || null,
      receiverId: peer.uid,
      identity: useAuthStore.getState().profile?.firebaseUid || null,
      tokenGenerated: Boolean(token),
      liveKitUrlPresent: Boolean(serverUrl),
      callStatus: 'ringing-out',
      prevCallId: prev.callId,
    });
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
      lastError: null,
    });
  },

  beginIncomingAccepted: ({ chatId, callId, peer, video, token, serverUrl }) => {
    logCallConnect('callStatus', {
      callId,
      callerId: peer.uid,
      receiverId: useAuthStore.getState().profile?.firebaseUid || null,
      identity: useAuthStore.getState().profile?.firebaseUid || null,
      tokenGenerated: Boolean(token),
      liveKitUrlPresent: Boolean(serverUrl),
      callStatus: 'active',
    });
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
      lastError: null,
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
    logCallConnect('callStatus', {
      callId: prev.callId,
      identity: useAuthStore.getState().profile?.firebaseUid || null,
      callStatus: 'active',
      tokenGenerated: Boolean(prev.token),
      liveKitUrlPresent: Boolean(prev.serverUrl),
    });
  },

  setCallCredentials: ({ token, serverUrl, callId }) => {
    const prev = get();
    if (prev.status === 'idle') return;
    set({
      token,
      serverUrl,
      callId: callId || prev.callId,
    });
  },

  hangup: async (forcedOutcome, opts) => {
    const prev = get();
    if (hangupBusy) return;
    if (prev.status === 'idle' && !prev.incoming) return;
    hangupBusy = true;

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
    const live = prev.callBilling;
    const me = useAuthStore.getState().profile;
    let outcome = forcedOutcome;
    if (!outcome) {
      if (wasActive) outcome = 'completed';
      else if (wasRingingIn) outcome = 'declined';
      else if (wasRingingOut) outcome = 'missed';
      else outcome = 'cancelled';
    }

    const callType = normalizePlatformCallType(
      live?.callType || (video ? 'video_720' : 'voice'),
    );
    let rateBlasts = Math.max(0, live?.rateBlasts || 0);
    let totalBlasts = Math.max(0, live?.spentBlasts || 0);
    let creatorValueCop = Math.max(0, live?.creatorValueCop || 0);
    let payerUid = live?.payerUid || null;

    // Resolver total cobrado/ganado ANTES de limpiar UI (caller y receptor).
    if (wasActive && (rateBlasts > 0 || Boolean(callId))) {
      if (chatId) {
        try {
          const snap = await readCallBillingSnapshot(chatId);
          rateBlasts = Math.max(rateBlasts, snap.rateBlasts || 0);
          totalBlasts = Math.max(totalBlasts, snap.totalBlasts || 0);
          creatorValueCop = Math.max(creatorValueCop, snap.creatorValueCop || 0);
          if (snap.payerUid) payerUid = snap.payerUid;
        } catch {
          /* ignore */
        }
      }
      if (callId) {
        try {
          const final = await stopCallBilling({
            callId,
            connectedSeconds: durationSec,
          });
          rateBlasts = Math.max(rateBlasts, final.rateBlasts || 0);
          totalBlasts = Math.max(totalBlasts, final.blastAlreadyCharged || 0);
          creatorValueCop = Math.max(creatorValueCop, final.creatorValueCop || 0);
          if (
            payerUid &&
            me?.firebaseUid &&
            payerUid === me.firebaseUid &&
            (final.purchasedBlastBalance != null || final.earnedBlastBalance != null)
          ) {
            useAuthStore.getState().setBlastBalances({
              purchasedBlastBalance: final.purchasedBlastBalance ?? 0,
              earnedBlastBalance: final.earnedBlastBalance ?? 0,
              coinsBalance: final.callerBalance,
            });
          } else if (
            payerUid &&
            me?.firebaseUid &&
            payerUid === me.firebaseUid &&
            final.callerBalance != null &&
            final.callerBalance >= 0
          ) {
            useAuthStore.getState().setCoins(final.callerBalance);
          }
        } catch {
          /* billing puede no haberse iniciado */
        }
      }
      // Si aún no hay cobro registrado pero la llamada pasó la gracia, estimar lo debido.
      if (totalBlasts <= 0 && rateBlasts > 0) {
        const due = calculateBlastDue(durationSec, callType);
        if (due > 0) {
          totalBlasts = due;
          if (creatorValueCop <= 0) creatorValueCop = creatorCopForBlast(due);
        }
      } else if (creatorValueCop <= 0 && totalBlasts > 0) {
        creatorValueCop = creatorCopForBlast(totalBlasts);
      }
    }

    const iAmReceiver = Boolean(payerUid && me?.firebaseUid && payerUid !== me.firebaseUid);
    const summary: VideoCallEndedSummary | null =
      wasActive && rateBlasts > 0
        ? {
            handle: prev.peer?.username || prev.incoming?.peer.username || '',
            durationSec,
            rateBlasts,
            blocksCharged: live?.blocksCharged || 0,
            totalBlasts,
            giftName: live?.giftName || null,
            received: iAmReceiver,
            video,
            creatorValueCop,
          }
        : video && wasActive
          ? {
              handle: prev.peer?.username || prev.incoming?.peer.username || '',
              durationSec,
              rateBlasts,
              blocksCharged: live?.blocksCharged || 0,
              totalBlasts,
              giftName: live?.giftName || null,
              received: iAmReceiver,
              video: true,
              creatorValueCop,
            }
          : null;

    releasePendingCallMicrophone();
    console.info('[CALL] cleanup', {
      callId,
      reason: outcome || opts?.error || 'hangup',
      status: prev.status,
      totalBlasts,
    });
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
      lastError: opts?.error || null,
    });

    try {
      if (wasRingingIn && !wasActive && chatId) {
        const remote = await peekPrivateCallStatus(chatId).catch(() => null);
        if (remote === 'active') return;
      }
      if (chatId) {
        void endPrivateCall(chatId, { callId, outcome }).catch(() => undefined);
      }
      void releaseCallSession(callId);
      if (me?.firebaseUid) {
        void releaseOwnCallPresence(me.firebaseUid, callId).catch(() => undefined);
      }
      if (!opts?.skipHistory && me?.firebaseUid && callId && chatId) {
        void postCallHistoryMessage(chatId, me.firebaseUid, {
          callId,
          video,
          outcome,
          durationSec,
          giftName: summary?.giftName,
          rateBlasts: summary?.rateBlasts,
          blocksCharged: summary?.blocksCharged,
          totalBlasts: summary?.totalBlasts,
          blastSpent: summary && !summary.received ? summary.totalBlasts : undefined,
          blastEarned: summary?.received ? summary.totalBlasts : undefined,
          creatorValueCop: summary?.creatorValueCop,
          callType,
        }).catch(() => undefined);
      }
      if (wasActive && iAmReceiver) {
        void useAuthStore.getState().syncProfile().catch(() => undefined);
      }
      if (wasActive && chatId && rateBlasts > 0) {
        void readCallBillingSnapshot(chatId)
          .then((billing) => {
            if (!billing || !summary) return;
            const nextTotal = Math.max(summary.totalBlasts, billing.totalBlasts || 0);
            const nextCop = Math.max(summary.creatorValueCop || 0, billing.creatorValueCop || 0);
            if (nextTotal === summary.totalBlasts && nextCop === (summary.creatorValueCop || 0)) return;
            set({
              endedSummary: {
                ...summary,
                rateBlasts: billing.rateBlasts || summary.rateBlasts,
                blocksCharged: billing.blocksCharged || summary.blocksCharged,
                totalBlasts: nextTotal,
                giftName: billing.giftName || summary.giftName,
                creatorValueCop: nextCop,
                received: Boolean(
                  billing.payerUid && me?.firebaseUid && billing.payerUid !== me.firebaseUid,
                ),
              },
            });
          })
          .catch(() => undefined);
      }
    } finally {
      hangupBusy = false;
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
