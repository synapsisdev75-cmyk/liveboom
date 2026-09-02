import { api, apiPublic, getApiBase } from './api';
import { setFirestoreCoins } from './profileFirestore';
import { openWompiWidget, type WompiOrder } from './wompiWidget';
import { useAuthStore } from '../store/authStore';

const PENDING_KEY = 'lb_wompi_pending';

export type PaymentStatus = {
  configured: boolean;
  sandbox: boolean;
  pairOk: boolean;
  firestore?: boolean;
  simulateAvailable?: boolean;
};

export type PaidTopup = {
  reference: string;
  coins: number;
  coinsBalance: number;
  duplicate?: boolean;
};

type PendingWompi = {
  kind: 'coins' | 'promo';
  reference: string;
  packageId?: string;
  coins?: number;
};

export function paymentsApiUrl(path: string) {
  return `${getApiBase()}${path}`;
}

export async function fetchPaymentStatus(): Promise<PaymentStatus> {
  return apiPublic<PaymentStatus>('/api/payments/status');
}

export function rememberPendingWompi(pending: PendingWompi) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // private mode
  }
}

export function readPendingWompi(): PendingWompi | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingWompi;
    if (!parsed?.reference) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingWompi() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

export function applyPaidCoinsToPage(paid: { coinsBalance?: number; coins?: number }) {
  const store = useAuthStore.getState();
  const current = store.profile?.coinsBalance ?? 0;
  const fromApi = Number(paid.coinsBalance);
  const added = Math.max(0, Number(paid.coins) || 0);
  const next = Math.max(Number.isFinite(fromApi) ? fromApi : 0, current + added);
  store.setCoins(next);
  const uid = store.profile?.firebaseUid;
  if (uid) {
    void setFirestoreCoins(uid, next).catch(() => undefined);
  }
  return next;
}

export async function keepPaidCoinsOnPage(next: number) {
  await useAuthStore.getState().syncProfile();
  const now = useAuthStore.getState().profile?.coinsBalance ?? 0;
  if (now < next) {
    useAuthStore.getState().setCoins(next);
    const uid = useAuthStore.getState().profile?.firebaseUid;
    if (uid) void setFirestoreCoins(uid, next).catch(() => undefined);
  }
}

export async function createCoinOrder(packageId: string) {
  const currentBalance = useAuthStore.getState().profile?.coinsBalance ?? 0;
  const order = await api<WompiOrder & { packageId?: string; coins?: number }>(
    '/api/payments/create-order',
    {
      method: 'POST',
      timeoutMs: 25_000,
      body: JSON.stringify({ packageId, currentBalance }),
    },
  );
  rememberPendingWompi({
    kind: 'coins',
    reference: order.reference,
    packageId: order.packageId || packageId,
    coins: order.coins,
  });
  return order;
}

export async function completeCoinPayment(input: {
  reference?: string;
  transactionId?: string;
}) {
  const pending = readPendingWompi();
  const reference = input.reference || pending?.reference || '';
  const transactionId = input.transactionId || '';
  const paid = await api<PaidTopup>('/api/payments/complete-widget', {
    method: 'POST',
    timeoutMs: 25_000,
    body: JSON.stringify({
      reference: reference || undefined,
      transactionId: transactionId || undefined,
      currentBalance: useAuthStore.getState().profile?.coinsBalance ?? 0,
    }),
  });
  clearPendingWompi();
  return paid;
}

/** Abre Wompi y, si el widget no redirige, acredita en la misma pantalla. */
export async function payCoinPackageWithWompi(packageId: string) {
  const order = await createCoinOrder(packageId);
  const result = await openWompiWidget(order);
  const status = result?.transaction?.status;
  const transactionId = result?.transaction?.id;
  if (!status && !transactionId) {
    return { outcome: 'closed' as const, order };
  }
  if (status === 'PENDING') {
    return { outcome: 'pending' as const, order, status };
  }
  if (status && status !== 'APPROVED' && !transactionId) {
    return { outcome: 'rejected' as const, order, status };
  }
  const paid = await completeCoinPayment({
    reference: result?.transaction?.reference || order.reference,
    transactionId,
  });
  const next = applyPaidCoinsToPage(paid);
  await keepPaidCoinsOnPage(next);
  return { outcome: 'approved' as const, order, paid, next };
}

/** Vuelta de Wompi a /billetera?id=… (móvil). */
export function readWompiReturnFromUrl(search = window.location.search) {
  const params = new URLSearchParams(search);
  const transactionId = params.get('id') || '';
  const reference =
    params.get('lb_ref') ||
    params.get('reference') ||
    readPendingWompi()?.reference ||
    '';
  return { transactionId, reference };
}

export function stripWompiReturnFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('id');
  url.searchParams.delete('lb_ref');
  url.searchParams.delete('reference');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export async function settleWompiReturnOnWalletPage() {
  const { transactionId, reference } = readWompiReturnFromUrl();
  if (!transactionId && !reference) return null;
  const paid = await completeCoinPayment({ transactionId, reference });
  const next = applyPaidCoinsToPage(paid);
  await keepPaidCoinsOnPage(next);
  stripWompiReturnFromUrl();
  return { paid, next };
}
