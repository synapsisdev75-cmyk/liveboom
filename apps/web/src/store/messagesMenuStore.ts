import { create } from 'zustand';
import { MESSAGE_BOXES_ENABLED, isMessageBoxesVisibleNow } from '../lib/messagesUiFlags';
import type { FriendChip } from '../lib/socialFirestore';

export type MessagesPopupPeer = FriendChip & {
  chatId?: string | null;
  lastMessage?: string | null;
};

const MAX_OPEN = 3;
const MAX_MINIMIZED = 5;

function withoutUid(list: MessagesPopupPeer[], uid: string) {
  return list.filter((item) => item.uid !== uid);
}

/** Menú de mensajes: rail derecho + ventanas celular (varias) + minimizados. */
type MessagesMenuState = {
  railOpen: boolean;
  openWindows: MessagesPopupPeer[];
  minimized: MessagesPopupPeer[];
  setRailOpen: (open: boolean) => void;
  toggleRail: () => void;
  /** Abre un chat en ventana celular; puede haber varias a la vez. */
  openChatFromList: (peer: MessagesPopupPeer) => void;
  expandMinimized: (uid: string) => void;
  closeMinimized: (uid: string) => void;
  closeWindow: (uid: string) => void;
  minimizeWindow: (uid: string) => void;
  closeAll: () => void;
};

export const useMessagesMenuStore = create<MessagesMenuState>((set) => ({
  railOpen: false,
  openWindows: [],
  minimized: [],
  setRailOpen: (railOpen) => set({ railOpen }),
  toggleRail: () => set((state) => ({ railOpen: !state.railOpen })),
  openChatFromList: (peer) =>
    set((state) => {
      if (!MESSAGE_BOXES_ENABLED || !isMessageBoxesVisibleNow()) {
        return { openWindows: [], minimized: [] };
      }
      const minimized = withoutUid(state.minimized, peer.uid);
      const already = state.openWindows.find((item) => item.uid === peer.uid);
      if (already) {
        // Trae al frente (final del array) y actualiza datos.
        return {
          openWindows: [...withoutUid(state.openWindows, peer.uid), { ...already, ...peer }],
          minimized,
        };
      }
      let openWindows = [...state.openWindows, peer];
      if (openWindows.length > MAX_OPEN) {
        const [oldest, ...rest] = openWindows;
        openWindows = rest;
        if (oldest) {
          return {
            openWindows,
            minimized: [...withoutUid(minimized, oldest.uid), oldest].slice(-MAX_MINIMIZED),
          };
        }
      }
      return { openWindows, minimized };
    }),
  expandMinimized: (uid) =>
    set((state) => {
      if (!MESSAGE_BOXES_ENABLED || !isMessageBoxesVisibleNow()) {
        return { openWindows: [], minimized: [] };
      }
      const target = state.minimized.find((item) => item.uid === uid);
      if (!target) return state;
      let openWindows = [...withoutUid(state.openWindows, uid), target];
      let minimized = withoutUid(state.minimized, uid);
      if (openWindows.length > MAX_OPEN) {
        const [oldest, ...rest] = openWindows;
        openWindows = rest;
        if (oldest && oldest.uid !== uid) {
          minimized = [...withoutUid(minimized, oldest.uid), oldest].slice(-MAX_MINIMIZED);
        }
      }
      return { openWindows, minimized };
    }),
  closeMinimized: (uid) => set((state) => ({ minimized: withoutUid(state.minimized, uid) })),
  closeWindow: (uid) =>
    set((state) => ({
      openWindows: withoutUid(state.openWindows, uid),
      minimized: withoutUid(state.minimized, uid),
    })),
  minimizeWindow: (uid) =>
    set((state) => {
      const target = state.openWindows.find((item) => item.uid === uid);
      if (!target) return state;
      if (!MESSAGE_BOXES_ENABLED || !isMessageBoxesVisibleNow()) {
        return { openWindows: [], minimized: [] };
      }
      return {
        openWindows: withoutUid(state.openWindows, uid),
        minimized: [...withoutUid(state.minimized, uid), target].slice(-MAX_MINIMIZED),
      };
    }),
  closeAll: () => set({ railOpen: false, openWindows: [], minimized: [] }),
}));
