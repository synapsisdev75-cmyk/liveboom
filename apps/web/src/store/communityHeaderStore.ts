import { create } from 'zustand';
import {
  buildDefaultCommunityHeader,
  listenCommunityHeader,
  type CommunityHeaderDoc,
  type CommunityHeaderTheme,
} from '../lib/communityHeaderFirestore';

type State = {
  ready: boolean;
  config: CommunityHeaderDoc;
  hydrate: () => () => void;
  themeFor: (mode: 'light' | 'dark') => CommunityHeaderTheme;
};

export const useCommunityHeaderStore = create<State>((set, get) => ({
  ready: false,
  config: buildDefaultCommunityHeader(),

  hydrate: () => {
    const unsub = listenCommunityHeader((doc) => {
      set({ ready: true, config: doc });
    });
    return unsub;
  },

  themeFor: (mode) => {
    const { config } = get();
    return mode === 'dark' ? config.dark : config.light;
  },
}));
