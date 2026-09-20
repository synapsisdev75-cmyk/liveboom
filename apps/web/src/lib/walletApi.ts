import { api, ApiError, getApiBase } from './api';
import { auth } from './firebase';

export type WalletSummary = {
  purchasedBalance: number;
  earnedAvailable: number;
  earnedBlastAvailable?: number;
  earnedReserved: number;
  earnedTotal: number;
  totalAvailable: number;
  withdrawableBalance: number;
  coinsBalance: number;
  withdrawableAmount?: number | string;
  currency?: string;
  minWithdrawBlast?: number;
  minWithdrawAmount?: number | string;
};

export type WalletLedgerRow = {
  id: string;
  transactionType: string;
  bucket?: string | null;
  amount: number;
  direction?: string | null;
  filterGroup?: string;
  status?: string;
  createdAtMs?: number;
  packageId?: string | null;
  referenceType?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PayoutQuote = {
  ok: boolean;
  earnedBlastAmount: number;
  moneyAmountCOP?: number;
  moneyAmountExact: string;
  withdrawableAmount?: number;
  currency: string;
};

export type PublicWithdrawal = {
  withdrawalId: string | null;
  userId: string | null;
  earnedBlastAmount: number;
  moneyAmountCOP?: number;
  moneyAmountExact: string;
  currency: string;
  status: string;
  requestedAt?: string | null;
  processedAt?: string | null;
  paymentReference?: string | null;
  walletRulesVersion?: string | null;
};

export type AdminWithdrawalPayout = {
  fullName?: string | null;
  documentId?: string | null;
  payoutMethod?: string | null;
  accountNumber?: string | null;
  accountType?: string | null;
};

export type AdminWithdrawalUser = {
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
};

export type AdminWithdrawal = PublicWithdrawal & {
  payout?: AdminWithdrawalPayout | null;
  user?: AdminWithdrawalUser | null;
  snapshot?: AdminWithdrawalUser | null;
  observations?: string | null;
  disbursementReference?: string | null;
  paidAt?: string | null;
  reviewFlags?: string[];
  updatedAtMs?: number | null;
};

export type WithdrawalReportMeta = {
  pending?: boolean;
  generatedAtMs?: number | null;
  generatedAtLabel?: string | null;
  lastError?: string | null;
  rowCount?: number;
  summary?: {
    count?: number;
    totalCop?: number;
    pagado?: number;
    porPagar?: number;
  } | null;
};

/** Lee el COP que ya calculó el backend. Nunca multiplica BLAST × tasa. */
export function quotedCop(payload: {
  moneyAmountCOP?: number | string | null;
  withdrawableAmount?: number | string | null;
  moneyAmountExact?: string | number | null;
} | null | undefined): number | null {
  if (!payload) return null;
  const raw = payload.moneyAmountCOP ?? payload.withdrawableAmount ?? payload.moneyAmountExact;
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.floor(raw));
  const whole = String(raw).trim().split('.')[0];
  const n = Math.floor(Number(whole || '0') || 0);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

export async function fetchWalletSummary() {
  return api<WalletSummary>('/api/wallet/summary');
}

export async function fetchPayoutQuote(blast: number) {
  return api<PayoutQuote>(`/api/wallet/payout-quote?blast=${encodeURIComponent(String(blast))}`);
}

export async function fetchWalletTransactions(filter = 'all') {
  const data = await api<{ transactions: WalletLedgerRow[] }>(
    `/api/wallet/transactions?filter=${encodeURIComponent(filter)}`,
  );
  return data.transactions || [];
}

export async function fetchWalletWithdrawals() {
  const data = await api<{ withdrawals: PublicWithdrawal[] }>('/api/wallet/withdrawals');
  return data.withdrawals || [];
}

export async function fetchAdminWithdrawals(cursor?: string | null) {
  const params = new URLSearchParams({ limit: '30' });
  if (cursor) params.set('cursor', cursor);
  return api<{
    withdrawals: AdminWithdrawal[];
    nextCursor: string | null;
    report?: WithdrawalReportMeta | null;
  }>(`/api/wallet/admin/withdrawals?${params.toString()}`);
}

export async function patchAdminWithdrawal(
  id: string,
  body: {
    status?: string;
    observations?: string;
    disbursementReference?: string;
  },
) {
  return api<{ ok: boolean }>(`/api/wallet/admin/withdrawals/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function confirmAdminWithdrawal(id: string, disbursementReference: string) {
  return api<{ ok: boolean }>(`/api/wallet/withdrawals/${encodeURIComponent(id)}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ disbursementReference }),
  });
}

export async function rejectAdminWithdrawal(id: string) {
  return api<{ ok: boolean }>(`/api/wallet/withdrawals/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
  });
}

export async function downloadAdminWithdrawalReport() {
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'No hay sesión de Firebase');
  const jwt = await user.getIdToken();
  const response = await fetch(`${getApiBase()}/api/wallet/admin/withdrawals/report`, {
    headers: { Authorization: `Bearer ${jwt}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(response.status, data.error || 'No se pudo descargar el Excel');
  }
  const blob = await response.blob();
  const header = response.headers.get('Content-Disposition') || '';
  const match = header.match(/filename="([^"]+)"/);
  return { blob, filename: match?.[1] || 'LiveBoom-Control-Retiros.xlsx' };
}

export function ledgerLabel(row: WalletLedgerRow) {
  const type = String(row.transactionType || '');
  switch (type) {
    case 'RECHARGE':
      if (String(row.status || '').toLowerCase() === 'pending') return 'Recarga en proceso';
      return 'BLAST comprados';
    case 'EARNING_GIFT':
      return 'Regalo recibido';
    case 'EARNING_CALL':
      return 'Llamada';
    case 'EARNING_VIDEO_CALL':
      return 'Videollamada';
    case 'EARNING_LIVE':
      return 'LIVE';
    case 'EARNING_PRIVATE':
      return 'LIVE privado';
    case 'EARNING_SUBSCRIPTION':
      return 'Suscripción';
    case 'SPEND': {
      const reason = String(row.referenceType || '').toLowerCase();
      if (reason.includes('gift')) return 'Regalo enviado';
      if (reason.includes('call')) return 'Llamada';
      if (reason.includes('live')) return 'LIVE';
      return 'Gasto';
    }
    case 'WITHDRAWAL_REQUEST':
      return 'Retiro solicitado';
    case 'WITHDRAWAL_PAID':
      return 'Retiro pagado';
    case 'WITHDRAWAL_REJECTED':
      return 'Retiro rechazado';
    case 'REFUND':
      return 'Devolución';
    case 'ADJUSTMENT':
      return 'Ajuste';
    default:
      return type || 'Movimiento';
  }
}

export function signedAmount(row: WalletLedgerRow) {
  const amount = Math.max(0, Math.floor(Number(row.amount) || 0));
  if (row.direction === 'DEBIT' || String(row.transactionType || '').startsWith('WITHDRAWAL_REQUEST')) {
    return -amount;
  }
  if (row.transactionType === 'SPEND') return -amount;
  if (row.transactionType === 'WITHDRAWAL_PAID') return -amount;
  return amount;
}
