import { create } from 'zustand';
import {
  IDLE_LOCK_MS,
  createAdminSession,
  destroyAdminSession,
  fetchAdminSession,
  refreshAdminSessionIdle,
} from '../lib/superAdminSecurity';

type VaultState = {
  unlocked: boolean;
  checking: boolean;
  sessionId: string | null;
  expiresAtMs: number;
  ttlMin: number;
  lastActivityMs: number;
  hydrate: (uid: string) => Promise<boolean>;
  unlock: (input: { uid: string; email: string; ttlMin: number }) => Promise<void>;
  touch: (uid: string | null) => void;
  lock: (uid: string | null, email?: string | null) => Promise<void>;
};

let idleTimer: ReturnType<typeof setTimeout> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers() {
  if (idleTimer) clearTimeout(idleTimer);
  if (refreshTimer) clearTimeout(refreshTimer);
  idleTimer = null;
  refreshTimer = null;
}

function scheduleIdle(get: () => VaultState, set: (p: Partial<VaultState>) => void, uid: string) {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    void get().lock(uid);
  }, IDLE_LOCK_MS);

  if (refreshTimer) clearTimeout(refreshTimer);
  // Renueva Firestore ~ cada mitad del idle para que las reglas sigan OK
  refreshTimer = setTimeout(() => {
    const state = get();
    if (!state.unlocked) return;
    void refreshAdminSessionIdle(uid, state.ttlMin)
      .then((expiresAtMs) => set({ expiresAtMs, lastActivityMs: Date.now() }))
      .catch(() => undefined);
  }, Math.floor(IDLE_LOCK_MS / 2));
}

export const useSuperAdminVaultStore = create<VaultState>((set, get) => ({
  unlocked: false,
  checking: true,
  sessionId: null,
  expiresAtMs: 0,
  ttlMin: 20,
  lastActivityMs: 0,

  hydrate: async (uid) => {
    set({ checking: true });
    try {
      const session = await fetchAdminSession(uid);
      if (!session) {
        clearTimers();
        set({ unlocked: false, checking: false, sessionId: null, expiresAtMs: 0 });
        return false;
      }
      set({
        unlocked: true,
        checking: false,
        sessionId: session.sessionId,
        expiresAtMs: session.expiresAtMs,
        lastActivityMs: Date.now(),
      });
      scheduleIdle(get, set, uid);
      return true;
    } catch {
      set({ unlocked: false, checking: false });
      return false;
    }
  },

  unlock: async ({ uid, email, ttlMin }) => {
    const created = await createAdminSession({ uid, email, ttlMin });
    set({
      unlocked: true,
      checking: false,
      sessionId: created.sessionId,
      expiresAtMs: created.expiresAtMs,
      ttlMin,
      lastActivityMs: Date.now(),
    });
    scheduleIdle(get, set, uid);
  },

  touch: (uid) => {
    if (!uid || !get().unlocked) return;
    set({ lastActivityMs: Date.now() });
    scheduleIdle(get, set, uid);
  },

  lock: async (uid, email) => {
    clearTimers();
    if (uid) await destroyAdminSession(uid, email || undefined);
    set({
      unlocked: false,
      checking: false,
      sessionId: null,
      expiresAtMs: 0,
      lastActivityMs: 0,
    });
  },
}));
