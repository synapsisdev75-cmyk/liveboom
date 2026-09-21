import { create } from 'zustand';
import type { FriendChip } from '../lib/socialFirestore';

export type MessagesPopupPeer = FriendChip & {
  chatId?: string | null;
  lastMessage?: string | null;
};

/** Menú de mensajes: rail derecho temporal + chat flotante compartido. */
type MessagesMenuState = {
  railOpen: boolean;
  popupPeer: MessagesPopupPeer | null;
  setRailOpen: (open: boolean) => void;
  toggleRail: () => void;
  setPopupPeer: (peer: MessagesPopupPeer | null) => void;
  openChatFromList: (peer: MessagesPopupPeer) => void;
  closeAll: () => void;
};

export const useMessagesMenuStore = create<MessagesMenuState>((set) => ({
  railOpen: false,
  popupPeer: null,
  setRailOpen: (railOpen) => set({ railOpen }),
  toggleRail: () => set((state) => ({ railOpen: !state.railOpen })),
  setPopupPeer: (popupPeer) => set({ popupPeer }),
  openChatFromList: (peer) => set({ railOpen: false, popupPeer: peer }),
  closeAll: () => set({ railOpen: false, popupPeer: null }),
}));
