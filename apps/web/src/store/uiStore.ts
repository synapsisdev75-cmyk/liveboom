import { create } from 'zustand';
import type { GiftDto, StreamDto } from '../lib/api';

export type NavId = 'home' | 'explore' | 'messages' | 'wallet' | 'profile';

export type ChatMessage = {
  id: string;
  author: string;
  avatar: string | null;
  text: string;
  isHost?: boolean;
  donation?: number;
};

export type GiftBurst = {
  id: string;
  emoji: string;
  label: string;
  left: number;
};

export type Donor = {
  rank: 1 | 2 | 3;
  name: string;
  avatar: string;
  coins: number;
};

type UiState = {
  nav: NavId;
  view: 'feed' | 'live';
  activeStream: StreamDto | null;
  streams: StreamDto[];
  gifts: GiftDto[];
  donors: Donor[];
  messages: ChatMessage[];
  bursts: GiftBurst[];
  giftOpen: boolean;
  draft: string;
  toast: string | null;
  walletOpen: boolean;
  setNav: (nav: NavId) => void;
  setStreams: (streams: StreamDto[]) => void;
  setGifts: (gifts: GiftDto[]) => void;
  setDonors: (donors: Donor[]) => void;
  openStream: (stream: StreamDto) => void;
  backToFeed: () => void;
  setDraft: (value: string) => void;
  pushMessage: (message: ChatMessage) => void;
  pushBurst: (burst: GiftBurst) => void;
  dismissBurst: (id: string) => void;
  toggleGifts: () => void;
  setToast: (toast: string | null) => void;
  setWalletOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  nav: 'home',
  view: 'feed',
  activeStream: null,
  streams: [],
  gifts: [],
  donors: [],
  messages: [],
  bursts: [],
  giftOpen: false,
  draft: '',
  toast: null,
  walletOpen: false,

  setNav: (nav) =>
    set({
      nav,
      view: nav === 'home' ? 'feed' : 'feed',
      giftOpen: false,
    }),
  setStreams: (streams) => set({ streams }),
  setGifts: (gifts) => set({ gifts }),
  setDonors: (donors) => set({ donors }),
  openStream: (stream) =>
    set({
      view: 'live',
      nav: 'home',
      activeStream: stream,
      messages: [],
      bursts: [],
      giftOpen: false,
    }),
  backToFeed: () => set({ view: 'feed', activeStream: null, giftOpen: false }),
  setDraft: (draft) => set({ draft }),
  pushMessage: (message) => set((state) => ({ messages: [...state.messages.slice(-80), message] })),
  pushBurst: (burst) => set((state) => ({ bursts: [...state.bursts, burst] })),
  dismissBurst: (id) => set((state) => ({ bursts: state.bursts.filter((item) => item.id !== id) })),
  toggleGifts: () => set((state) => ({ giftOpen: !state.giftOpen })),
  setToast: (toast) => set({ toast }),
  setWalletOpen: (walletOpen) => set({ walletOpen }),
}));
