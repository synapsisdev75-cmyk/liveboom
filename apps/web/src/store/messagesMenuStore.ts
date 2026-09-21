import { create } from 'zustand';
import { MESSAGE_BOXES_ENABLED } from '../lib/messagesUiFlags';
import type { FriendChip } from '../lib/socialFirestore';

export type MessagesPopupPeer = FriendChip & {
  chatId?: string | null;
  lastMessage?: string | null;
};

const MAX_MINIMIZED = 4;

function withoutUid(list: MessagesPopupPeer[], uid: string) {
  return list.filter((item) => item.uid !== uid);
}

/** Menú de mensajes: rail derecho temporal + chat flotante + minimizados. */
type MessagesMenuState = {
  railOpen: boolean;
  popupPeer: MessagesPopupPeer | null;
  minimized: MessagesPopupPeer[];
  setRailOpen: (open: boolean) => void;
  toggleRail: () => void;
  setPopupPeer: (peer: MessagesPopupPeer | null) => void;
  /** Abre un chat; si ya hay otro abierto, lo minimiza a pastilla foto+nombre. */
  openChatFromList: (peer: MessagesPopupPeer) => void;
  expandMinimized: (uid: string) => void;
  closeMinimized: (uid: string) => void;
  closePopup: () => void;
  minimizeCurrent: () => void;
  closeAll: () => void;
};

export const useMessagesMenuStore = create<MessagesMenuState>((set) => ({
  railOpen: false,
  popupPeer: null,
  minimized: [],
  setRailOpen: (railOpen) => set({ railOpen }),
  toggleRail: () => set((state) => ({ railOpen: !state.railOpen })),
  setPopupPeer: (popupPeer) => set({ popupPeer }),
  openChatFromList: (peer) =>
    set((state) => {
      if (!MESSAGE_BOXES_ENABLED) {
        return { railOpen: false, popupPeer: peer, minimized: [] };
      }
      const prev = state.popupPeer;
      let minimized = withoutUid(state.minimized, peer.uid);
      if (prev && prev.uid !== peer.uid) {
        minimized = [...withoutUid(minimized, prev.uid), prev].slice(-MAX_MINIMIZED);
      }
      return { railOpen: false, popupPeer: peer, minimized };
    }),
  expandMinimized: (uid) =>
    set((state) => {
      const target = state.minimized.find((item) => item.uid === uid);
      if (!target) return state;
      const prev = state.popupPeer;
      let minimized = withoutUid(state.minimized, uid);
      if (MESSAGE_BOXES_ENABLED && prev && prev.uid !== uid) {
        minimized = [...minimized, prev].slice(-MAX_MINIMIZED);
      }
      return { popupPeer: target, minimized };
    }),
  closeMinimized: (uid) => set((state) => ({ minimized: withoutUid(state.minimized, uid) })),
  closePopup: () => set({ popupPeer: null }),
  minimizeCurrent: () =>
    set((state) => {
      const prev = state.popupPeer;
      if (!prev) return state;
      if (!MESSAGE_BOXES_ENABLED) return { popupPeer: null, minimized: [] };
      return {
        popupPeer: null,
        minimized: [...withoutUid(state.minimized, prev.uid), prev].slice(-MAX_MINIMIZED),
      };
    }),
  closeAll: () => set({ railOpen: false, popupPeer: null, minimized: [] }),
}));
