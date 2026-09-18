import { api } from './api';

export type WalletSummary = {
  purchasedBalance: number;
  earnedAvailable: number;
  earnedReserved: number;
  earnedTotal: number;
  totalAvailable: number;
  withdrawableBalance: number;
  coinsBalance: number;
  minWithdrawCoins?: number;
  coinToCop?: number;
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
  metadata?: Record<string, unknown> | null;
};

export async function fetchWalletSummary() {
  return api<WalletSummary>('/api/wallet/summary');
}

export async function fetchWalletTransactions(filter = 'all') {
  const data = await api<{ transactions: WalletLedgerRow[] }>(
    `/api/wallet/transactions?filter=${encodeURIComponent(filter)}`,
  );
  return data.transactions || [];
}

export function ledgerLabel(row: WalletLedgerRow) {
  const type = String(row.transactionType || '');
  switch (type) {
    case 'RECHARGE':
      return 'Recarga';
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
    case 'SPEND':
      return 'Gasto';
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
