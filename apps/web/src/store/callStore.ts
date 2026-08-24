import { create } from 'zustand';
import { endPrivateCall, type FriendChip } from '../lib/socialFirestore';

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
  peer: CallPeer | null;
  video: boolean;
  token: string | null;
  serverUrl: string | null;
  incoming: IncomingCall | null;
  setIncoming: (incoming: IncomingCall | null) => void;
  beginOutgoing: (payload: {
    chatId: string;
    peer: CallPeer;
    video: boolean;
    token: string;
    serverUrl: string;
  }) => void;
  beginIncomingAccepted: (payload: {
    chatId: string;
    peer: CallPeer;
    video: boolean;
    token: string;
    serverUrl: string;
  }) => void;
  markActive: () => void;
  hangup: () => Promise<void>;
};

export const useCallStore = create<CallState>((set, get) => ({
  status: 'idle',
  chatId: null,
  peer: null,
  video: false,
  token: null,
  serverUrl: null,
  incoming: null,

  setIncoming: (incoming) => {
    const { status } = get();
    if (status === 'active' || status === 'ringing-out') return;
    set({ incoming, status: incoming ? 'ringing-in' : 'idle' });
  },

  beginOutgoing: ({ chatId, peer, video, token, serverUrl }) => {
    set({
      status: 'ringing-out',
      chatId,
      peer,
      video,
      token,
      serverUrl,
      incoming: null,
    });
  },

  beginIncomingAccepted: ({ chatId, peer, video, token, serverUrl }) => {
    set({
      status: 'active',
      chatId,
      peer,
      video,
      token,
      serverUrl,
      incoming: null,
    });
  },

  markActive: () => {
    if (get().status === 'idle') return;
    set({ status: 'active' });
  },

  hangup: async () => {
    const chatId = get().chatId || get().incoming?.chatId || null;
    set({
      status: 'idle',
      chatId: null,
      peer: null,
      video: false,
      token: null,
      serverUrl: null,
      incoming: null,
    });
    if (chatId) await endPrivateCall(chatId);
  },
}));
