import { create } from 'zustand';
import {
  DEFAULT_SESSION_TTL_MIN,
  IDLE_LOCK_MS,
  SESSION_CONTINUE_ANSWER_MS,
  SESSION_CONTINUE_BEFORE_MS,
  createAdminSession,
  destroyAdminSession,
  extendAdminSession,
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
  /** Modal: ¿continúas en línea? */
  continuePromptOpen: boolean;
  continueDeadlineMs: number;
  hydrate: (uid: string) => Promise<boolean>;
  unlock: (input: { uid: string; email: string; ttlMin?: number }) => Promise<void>;
  touch: (uid: string | null) => void;
  continueOnline: (uid: string) => Promise<void>;
  declineContinue: (uid: string | null, email?: string | null) => Promise<void>;
  lock: (uid: string | null, email?: string | null) => Promise<void>;
};

let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
let warnTimer: ReturnType<typeof setTimeout> | null = null;
let answerTimer: ReturnType<typeof setTimeout> | null = null;
let expireTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers() {
  if (heartbeatTimer) clearTimeout(heartbeatTimer);
  if (warnTimer) clearTimeout(warnTimer);
  if (answerTimer) clearTimeout(answerTimer);
  if (expireTimer) clearTimeout(expireTimer);
  heartbeatTimer = null;
  warnTimer = null;
  answerTimer = null;
  expireTimer = null;
}

function scheduleHeartbeat(get: () => VaultState, set: (p: Partial<VaultState>) => void, uid: string) {
  if (heartbeatTimer) clearTimeout(heartbeatTimer);
  heartbeatTimer = setTimeout(() => {
    const state = get();
    if (!state.unlocked) return;
    void refreshAdminSessionIdle(uid, state.ttlMin).catch(() => undefined);
    scheduleHeartbeat(get, set, uid);
  }, Math.floor(IDLE_LOCK_MS / 2));
}

function openContinuePrompt(get: () => VaultState, set: (p: Partial<VaultState>) => void, uid: string) {
  if (!get().unlocked) return;
  if (get().continuePromptOpen) return;
  const continueDeadlineMs = Date.now() + SESSION_CONTINUE_ANSWER_MS;
  set({ continuePromptOpen: true, continueDeadlineMs });
  if (answerTimer) clearTimeout(answerTimer);
  answerTimer = setTimeout(() => {
    if (!get().unlocked || !get().continuePromptOpen) return;
    void get().lock(uid);
  }, SESSION_CONTINUE_ANSWER_MS);
}

function scheduleSessionWatch(get: () => VaultState, set: (p: Partial<VaultState>) => void, uid: string) {
  if (warnTimer) clearTimeout(warnTimer);
  if (expireTimer) clearTimeout(expireTimer);
  warnTimer = null;
  expireTimer = null;

  const { expiresAtMs, unlocked, continuePromptOpen } = get();
  if (!unlocked || !expiresAtMs) return;

  const now = Date.now();
  const warnAt = expiresAtMs - SESSION_CONTINUE_BEFORE_MS;

  if (expiresAtMs <= now) {
    void get().lock(uid);
    return;
  }

  if (continuePromptOpen) {
    // Ya hay prompt; el answerTimer gestiona el cierre.
    return;
  }

  if (warnAt <= now) {
    openContinuePrompt(get, set, uid);
  } else {
    warnTimer = setTimeout(() => openContinuePrompt(get, set, uid), warnAt - now);
  }

  expireTimer = setTimeout(() => {
    if (!get().unlocked) return;
    // Si respondió Sí, expiresAtMs ya se movió y este timer es viejo.
    if (get().expiresAtMs > Date.now() + 5_000) {
      scheduleSessionWatch(get, set, uid);
      return;
    }
    void get().lock(uid);
  }, expiresAtMs - now + 250);
}

function armSession(get: () => VaultState, set: (p: Partial<VaultState>) => void, uid: string) {
  clearTimers();
  set({ continuePromptOpen: false, continueDeadlineMs: 0 });
  scheduleHeartbeat(get, set, uid);
  scheduleSessionWatch(get, set, uid);
}

export const useSuperAdminVaultStore = create<VaultState>((set, get) => ({
  unlocked: false,
  checking: true,
  sessionId: null,
  expiresAtMs: 0,
  ttlMin: DEFAULT_SESSION_TTL_MIN,
  lastActivityMs: 0,
  continuePromptOpen: false,
  continueDeadlineMs: 0,

  hydrate: async (uid) => {
    set({ checking: true });
    try {
      const session = await fetchAdminSession(uid);
      if (!session) {
        clearTimers();
        set({
          unlocked: false,
          checking: false,
          sessionId: null,
          expiresAtMs: 0,
          continuePromptOpen: false,
          continueDeadlineMs: 0,
        });
        return false;
      }
      set({
        unlocked: true,
        checking: false,
        sessionId: session.sessionId,
        expiresAtMs: session.expiresAtMs,
        ttlMin: DEFAULT_SESSION_TTL_MIN,
        lastActivityMs: Date.now(),
        continuePromptOpen: false,
        continueDeadlineMs: 0,
      });
      armSession(get, set, uid);
      return true;
    } catch {
      set({ unlocked: false, checking: false });
      return false;
    }
  },

  unlock: async ({ uid, email, ttlMin }) => {
    const effectiveTtl = Math.max(DEFAULT_SESSION_TTL_MIN, ttlMin ?? DEFAULT_SESSION_TTL_MIN);
    const created = await createAdminSession({ uid, email, ttlMin: effectiveTtl });
    set({
      unlocked: true,
      checking: false,
      sessionId: created.sessionId,
      expiresAtMs: created.expiresAtMs,
      ttlMin: effectiveTtl,
      lastActivityMs: Date.now(),
      continuePromptOpen: false,
      continueDeadlineMs: 0,
    });
    armSession(get, set, uid);
  },

  touch: (uid) => {
    if (!uid || !get().unlocked) return;
    set({ lastActivityMs: Date.now() });
    // Heartbeat periódico ya corre; no alarga la hora de sesión.
  },

  continueOnline: async (uid) => {
    if (!uid || !get().unlocked) return;
    if (answerTimer) clearTimeout(answerTimer);
    answerTimer = null;
    const ttl = get().ttlMin || DEFAULT_SESSION_TTL_MIN;
    const expiresAtMs = await extendAdminSession(uid, ttl);
    set({
      expiresAtMs,
      lastActivityMs: Date.now(),
      continuePromptOpen: false,
      continueDeadlineMs: 0,
    });
    armSession(get, set, uid);
  },

  declineContinue: async (uid, email) => {
    await get().lock(uid, email);
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
      continuePromptOpen: false,
      continueDeadlineMs: 0,
    });
  },
}));
