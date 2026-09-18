import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

export type WithdrawalStatus = 'pending' | 'paid' | 'rejected';

export type WithdrawalRequest = {
  id: string;
  uid: string;
  coins: number;
  amountCop: number;
  status: WithdrawalStatus;
  fullName: string;
  handle: string;
  email: string;
  payoutMethod: string;
  documentId?: string;
  accountNumber?: string;
  accountType?: string;
  createdAt: string | null;
  createdAtMs: number;
  reviewNote?: string;
};

function asIso(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && 'toDate' in value) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

function mapDoc(id: string, data: Record<string, unknown>): WithdrawalRequest {
  const status = String(data.status || 'pending') as WithdrawalStatus;
  const createdAt = asIso(data.createdAt);
  const createdAtMs =
    Math.max(0, Math.floor(Number(data.createdAtMs) || 0)) ||
    (createdAt ? Date.parse(createdAt) || 0 : 0);
  return {
    id,
    uid: String(data.uid || ''),
    coins: Math.max(0, Math.floor(Number(data.coins) || 0)),
    amountCop: Math.max(0, Math.floor(Number(data.amountCop) || 0)),
    status: ['pending', 'paid', 'rejected'].includes(status) ? status : 'pending',
    fullName: String(data.fullName || '').trim() || '—',
    handle: String(data.handle || '').trim(),
    email: String(data.email || '').trim(),
    payoutMethod: String(data.payoutMethod || '').trim() || '—',
    documentId: data.documentId ? String(data.documentId) : undefined,
    accountNumber: data.accountNumber ? String(data.accountNumber) : undefined,
    accountType: data.accountType ? String(data.accountType) : undefined,
    createdAt,
    createdAtMs,
    reviewNote: data.reviewNote ? String(data.reviewNote) : undefined,
  };
}

export function formatWithdrawalWhen(iso: string | null, ms?: number) {
  const date = iso ? new Date(iso) : ms ? new Date(ms) : null;
  if (!date || Number.isNaN(date.getTime())) return { date: '—', time: '—', full: '—' };
  return {
    date: date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    time: date.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    full: date.toLocaleString('es-CO'),
  };
}

export function listenMyWithdrawals(
  uid: string,
  onChange: (rows: WithdrawalRequest[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const id = String(uid || '').trim();
  if (!id) {
    onChange([]);
    return () => undefined;
  }
  const q = query(
    collection(db, 'withdrawals'),
    where('uid', '==', id),
    orderBy('createdAtMs', 'desc'),
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>)));
    },
    (err) => onError?.(err instanceof Error ? err : new Error(String(err))),
  );
}

export function listenAllWithdrawals(
  onChange: (rows: WithdrawalRequest[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'withdrawals'), orderBy('createdAtMs', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>)));
    },
    (err) => onError?.(err instanceof Error ? err : new Error(String(err))),
  );
}

export async function updateWithdrawalStatusFs(
  id: string,
  status: WithdrawalStatus,
  reviewNote = '',
) {
  await updateDoc(doc(db, 'withdrawals', id), {
    status,
    reviewNote: reviewNote.slice(0, 240),
    reviewedAt: new Date().toISOString(),
  });
}
