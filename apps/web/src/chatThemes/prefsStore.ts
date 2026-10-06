import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { create } from 'zustand';
import { db } from '../lib/firebase';
import { appearanceForFirestore, DEFAULT_CHAT_APPEARANCE, normalizeChatAppearance } from './appearance';
import type { ChatAppearance } from './types';

const CACHE_PREFIX = 'liveboom:chat-theme:v1:';
const LAST_UID_KEY = 'liveboom:chat-theme:last-uid';
const MAX_CACHED_CHATS = 60;

export type ChatThemeScope = 'global' | 'chat';

type CacheShape = { global: ChatAppearance; perChat: Record<string, ChatAppearance> };

export function chatAppearanceDocId(chatId: string) {
  return `c_${chatId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 150)}`;
}

function readCache(uid: string | null): CacheShape {
  const empty: CacheShape = { global: { ...DEFAULT_CHAT_APPEARANCE }, perChat: {} };
  if (!uid || typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + uid);
    if (!raw) return empty;
    const data = JSON.parse(raw) as { global?: unknown; perChat?: Record<string, unknown> };
    const perChat: Record<string, ChatAppearance> = {};
    for (const [chatId, value] of Object.entries(data.perChat || {})) {
      perChat[chatId] = normalizeChatAppearance(value);
    }
    return { global: normalizeChatAppearance(data.global), perChat };
  } catch {
    return empty;
  }
}

function writeCache(uid: string | null, cache: CacheShape) {
  if (!uid || typeof window === 'undefined') return;
  try {
    const entries = Object.entries(cache.perChat)
      .sort((a, b) => b[1].updatedAtMs - a[1].updatedAtMs)
      .slice(0, MAX_CACHED_CHATS);
    const perChat: Record<string, unknown> = {};
    for (const [chatId, value] of entries) {
      if (!hasLocalBlob(value)) perChat[chatId] = appearanceForFirestore(value);
    }
    window.localStorage.setItem(
      CACHE_PREFIX + uid,
      JSON.stringify({
        global: hasLocalBlob(cache.global) ? undefined : appearanceForFirestore(cache.global),
        perChat,
      }),
    );
    window.localStorage.setItem(LAST_UID_KEY, uid);
  } catch {
    /* modo privado / sin espacio */
  }
}

function hasLocalBlob(appearance: ChatAppearance) {
  return Boolean(appearance.customBackground?.full.startsWith('blob:'));
}

function readLastUid() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LAST_UID_KEY);
  } catch {
    return null;
  }
}

type State = {
  uid: string | null;
  global: ChatAppearance;
  perChat: Record<string, ChatAppearance>;
  bindUser: (uid: string | null) => void;
  watchChat: (chatId: string) => () => void;
  save: (scope: ChatThemeScope, appearance: ChatAppearance, chatId?: string | null) => Promise<void>;
  clearChat: (chatId: string) => Promise<void>;
};

let globalUnsub: Unsubscribe | null = null;
const chatWatchers = new Map<string, { count: number; unsub: Unsubscribe }>();

const initialUid = readLastUid();
const initialCache = readCache(initialUid);

/** Preferencias de tema del chat: caché local primero, Firestore después (offline conserva el último). */
export const useChatThemePrefs = create<State>((set, get) => {
  function persist() {
    const { uid, global, perChat } = get();
    writeCache(uid, { global, perChat });
  }

  function stopWatchers(includeChats: boolean) {
    globalUnsub?.();
    globalUnsub = null;
    if (!includeChats) return;
    chatWatchers.forEach((entry) => entry.unsub());
    chatWatchers.clear();
  }

  return {
    uid: initialUid,
    global: initialCache.global,
    perChat: initialCache.perChat,

    bindUser: (uid) => {
      if (uid === get().uid && (globalUnsub || !uid)) return;
      const userChanged = uid !== get().uid;
      stopWatchers(userChanged);
      if (userChanged) {
        const cache = readCache(uid);
        set({ uid, global: cache.global, perChat: cache.perChat });
      }
      if (!uid) return;
      globalUnsub = onSnapshot(
        doc(db, 'users', uid, 'chatAppearance', 'global'),
        (snap) => {
          if (get().uid !== uid) return;
          if (!snap.exists()) return;
          const remote = normalizeChatAppearance(snap.data());
          if (remote.updatedAtMs < get().global.updatedAtMs) return;
          set({ global: remote });
          persist();
        },
        () => undefined,
      );
    },

    watchChat: (chatId) => {
      const uid = get().uid;
      if (!uid || !chatId) return () => undefined;
      const existing = chatWatchers.get(chatId);
      if (existing) {
        existing.count += 1;
      } else {
        const unsub = onSnapshot(
          doc(db, 'users', uid, 'chatAppearance', chatAppearanceDocId(chatId)),
          (snap) => {
            if (get().uid !== uid) return;
            const current = get().perChat[chatId];
            if (!snap.exists()) {
              if (!current || snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
              const next = { ...get().perChat };
              delete next[chatId];
              set({ perChat: next });
              persist();
              return;
            }
            const remote = normalizeChatAppearance(snap.data());
            if (current && remote.updatedAtMs < current.updatedAtMs) return;
            set({ perChat: { ...get().perChat, [chatId]: remote } });
            persist();
          },
          () => undefined,
        );
        chatWatchers.set(chatId, { count: 1, unsub });
      }
      return () => {
        const entry = chatWatchers.get(chatId);
        if (!entry) return;
        entry.count -= 1;
        if (entry.count <= 0) {
          entry.unsub();
          chatWatchers.delete(chatId);
        }
      };
    },

    save: async (scope, appearance, chatId) => {
      const uid = get().uid;
      const next = { ...appearance, updatedAtMs: Date.now() };
      if (scope === 'chat' && chatId) {
        set({ perChat: { ...get().perChat, [chatId]: next } });
      } else {
        set({ global: next });
      }
      persist();
      if (!uid) return;
      const docId = scope === 'chat' && chatId ? chatAppearanceDocId(chatId) : 'global';
      await setDoc(doc(db, 'users', uid, 'chatAppearance', docId), {
        ...appearanceForFirestore(next),
        scope,
        conversationId: scope === 'chat' && chatId ? chatId : null,
        updatedAt: serverTimestamp(),
      });
    },

    clearChat: async (chatId) => {
      const uid = get().uid;
      const next = { ...get().perChat };
      delete next[chatId];
      set({ perChat: next });
      persist();
      if (!uid) return;
      await deleteDoc(doc(db, 'users', uid, 'chatAppearance', chatAppearanceDocId(chatId)));
    },
  };
});
