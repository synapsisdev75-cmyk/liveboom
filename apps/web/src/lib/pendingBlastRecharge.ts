import { api } from './api';
import { fetchWalletSummary } from './walletApi';
import { useAuthStore } from '../store/authStore';
import { getSocket } from './socket';
import { isNativeApp } from './wompiCheckout';

const STORAGE_KEY = 'lb.pendingBlastRecharge.v1';
/** Poll largo: webhook puede tardar en Nequi/PSE; sobrevive cierre del modal. */
const POLL_MS = 2_500;
const MAX_WATCH_MS = 10 * 60 * 1000;

export type PendingBlastRecharge = {
  reference: string;
  purchasedBefore: number;
  startedAt: number;
};

type WatchHandlers = {
  onCredited?: (coins: number) => void;
  onPending?: () => void;
  onDeclined?: () => void;
};

let pollTimer: number | null = null;
let stopAt = 0;
let socketBound = false;
let resumeBound = false;
let handlers: WatchHandlers = {};

function readPending(): PendingBlastRecharge | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingBlastRecharge;
    if (!parsed?.reference || !Number.isFinite(parsed.startedAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePending(pending: PendingBlastRecharge | null) {
  try {
    if (!pending) {
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const raw = JSON.stringify(pending);
    sessionStorage.setItem(STORAGE_KEY, raw);
    localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    /* ignore quota */
  }
}

export function getPendingBlastRecharge(): PendingBlastRecharge | null {
  return readPending();
}

export function markPendingBlastRecharge(reference: string) {
  const ref = String(reference || '').trim();
  if (!ref) return;
  const purchasedBefore = Math.max(
    0,
    Math.floor(Number(useAuthStore.getState().profile?.purchasedBlastBalance) || 0),
  );
  writePending({ reference: ref, purchasedBefore, startedAt: Date.now() });
}

export function clearPendingBlastRecharge() {
  writePending(null);
  stopPoll();
}

function stopPoll() {
  if (pollTimer != null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function applySummaryGain(purchasedBefore: number): number {
  const summary = useAuthStore.getState().profile;
  const now = Math.max(0, Math.floor(Number(summary?.purchasedBlastBalance) || 0));
  return Math.max(0, now - purchasedBefore);
}

async function refreshBalances() {
  try {
    const summary = await fetchWalletSummary();
    useAuthStore.getState().setBlastBalances({
      purchasedBlastBalance: summary.purchasedBalance,
      earnedBlastBalance: summary.earnedAvailable,
      coinsBalance: summary.totalAvailable,
    });
  } catch {
    try {
      await useAuthStore.getState().syncProfile();
    } catch {
      /* ignore */
    }
  }
}

async function queryOrderByReference(reference: string): Promise<'credited' | 'pending' | 'declined' | 'unknown'> {
  try {
    const paid = await api<{
      pending?: boolean;
      coins?: number;
      coinsBalance?: number;
      purchasedBlastBalance?: number;
      earnedBlastBalance?: number;
      status?: string;
    }>('/api/payments/complete-widget', {
      method: 'POST',
      body: JSON.stringify({ reference }),
      timeoutMs: 20_000,
    });

    if (paid?.pending) return 'pending';
    if (paid?.purchasedBlastBalance != null || paid?.earnedBlastBalance != null) {
      useAuthStore.getState().setBlastBalances({
        purchasedBlastBalance: Number(paid.purchasedBlastBalance) || 0,
        earnedBlastBalance: Number(paid.earnedBlastBalance) || 0,
        coinsBalance: Number(paid.coinsBalance) || 0,
      });
      return 'credited';
    }
    if (Number(paid?.coins) > 0 || Number(paid?.coinsBalance) > 0) {
      if (paid.coinsBalance != null) {
        const earned = Math.max(
          0,
          Math.floor(Number(useAuthStore.getState().profile?.earnedBlastBalance) || 0),
        );
        useAuthStore.getState().setBlastBalances({
          purchasedBlastBalance: Math.max(0, Number(paid.coinsBalance) - earned),
          earnedBlastBalance: earned,
          coinsBalance: Number(paid.coinsBalance),
        });
      }
      return 'credited';
    }
    const status = String(paid?.status || '').toUpperCase();
    if (status === 'DECLINED') return 'declined';
    return 'pending';
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (/declinado|DECLINED|no fue aprobado/i.test(msg)) return 'declined';
    return 'unknown';
  }
}

async function tickOnce() {
  const pending = readPending();
  if (!pending) {
    stopPoll();
    return;
  }
  if (Date.now() > stopAt || Date.now() - pending.startedAt > MAX_WATCH_MS) {
    clearPendingBlastRecharge();
    return;
  }

  handlers.onPending?.();
  await refreshBalances();
  const gained = applySummaryGain(pending.purchasedBefore);
  if (gained > 0) {
    clearPendingBlastRecharge();
    handlers.onCredited?.(gained);
    window.dispatchEvent(
      new CustomEvent('liveboom:recharge-credited', { detail: { coins: gained, reference: pending.reference } }),
    );
    return;
  }

  const orderState = await queryOrderByReference(pending.reference);
  if (orderState === 'credited') {
    await refreshBalances();
    const again = applySummaryGain(pending.purchasedBefore);
    clearPendingBlastRecharge();
    const coins = again > 0 ? again : 0;
    handlers.onCredited?.(coins);
    window.dispatchEvent(
      new CustomEvent('liveboom:recharge-credited', {
        detail: { coins, reference: pending.reference },
      }),
    );
    return;
  }
  if (orderState === 'declined') {
    clearPendingBlastRecharge();
    handlers.onDeclined?.();
    window.dispatchEvent(new CustomEvent('liveboom:recharge-declined', { detail: { reference: pending.reference } }));
  }
}

function ensureSocket() {
  if (socketBound) return;
  socketBound = true;
  void getSocket()
    .then((socket) => {
      socket.on('wallet_updated', () => {
        void tickOnce();
      });
    })
    .catch(() => {
      socketBound = false;
    });
}

async function bindNativeResume() {
  if (resumeBound || !isNativeApp()) return;
  resumeBound = true;
  try {
    const { App } = await import('@capacitor/app');
    const { Browser } = await import('@capacitor/browser');
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive && readPending()) void tickOnce();
    });
    void App.addListener('resume', () => {
      if (readPending()) void tickOnce();
    });
    void Browser.addListener('browserFinished', () => {
      if (readPending()) void tickOnce();
    });
    void App.addListener('appUrlOpen', ({ url }) => {
      try {
        const parsed = new URL(url);
        const txnId = parsed.searchParams.get('id');
        if (txnId) {
          void api('/api/payments/complete-redirect', {
            method: 'POST',
            body: JSON.stringify({
              transactionId: txnId,
              reference: readPending()?.reference || undefined,
            }),
            timeoutMs: 20_000,
          })
            .then(() => tickOnce())
            .catch(() => tickOnce());
          return;
        }
      } catch {
        /* ignore parse */
      }
      if (readPending()) void tickOnce();
    });
  } catch {
    resumeBound = false;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && readPending()) void tickOnce();
  });
}

/**
 * Arranca (o reanuda) el watcher global. Seguro llamar muchas veces.
 */
export function watchPendingBlastRecharge(nextHandlers: WatchHandlers = {}) {
  handlers = { ...handlers, ...nextHandlers };
  const pending = readPending();
  if (!pending) return;
  stopAt = Math.max(stopAt, Date.now() + MAX_WATCH_MS);
  ensureSocket();
  void bindNativeResume();
  void tickOnce();
  if (pollTimer == null) {
    pollTimer = window.setInterval(() => {
      void tickOnce();
    }, POLL_MS);
  }
}

/** Llama al montar la app autenticada. */
export function initPendingBlastRechargeWatcher() {
  void bindNativeResume();
  if (readPending()) watchPendingBlastRecharge();
}
