import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

export type WithdrawalStatus = 'pending' | 'paid' | 'rejected';

export type WithdrawalRequest = {
  id: string;
  uid: string;
  displayName: string;
  fullName: string;
  username: string;
  email: string;
  coins: number;
  amountCop: number;
  payoutMethod: string;
  accountNumber: string;
  accountType: string;
  documentId: string;
  status: WithdrawalStatus;
  source: string;
  reviewNote: string;
  reviewedByEmail: string | null;
  createdAt: string | null;
  createdAtMs: number;
};

function asIso(value: unknown, fallbackMs?: number): string | null {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object' && 'toDate' in value) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      /* ignore */
    }
  }
  if (fallbackMs && Number.isFinite(fallbackMs) && fallbackMs > 0) {
    return new Date(fallbackMs).toISOString();
  }
  return null;
}

function mapDoc(id: string, data: Record<string, unknown>): WithdrawalRequest {
  const status = String(data.status || 'pending') as WithdrawalStatus;
  const createdAtMs = Number(data.createdAtMs) || 0;
  return {
    id,
    uid: String(data.uid || ''),
    displayName: String(data.displayName || data.fullName || data.username || ''),
    fullName: String(data.fullName || data.displayName || ''),
    username: String(data.username || ''),
    email: String(data.email || ''),
    coins: Math.max(0, Math.floor(Number(data.coins) || 0)),
    amountCop: Math.max(0, Math.floor(Number(data.amountCop) || 0)),
    payoutMethod: String(data.payoutMethod || ''),
    accountNumber: String(data.accountNumber || ''),
    accountType: String(data.accountType || ''),
    documentId: String(data.documentId || ''),
    status: ['pending', 'paid', 'rejected'].includes(status) ? status : 'pending',
    source: String(data.source || 'earned'),
    reviewNote: String(data.reviewNote || ''),
    reviewedByEmail: data.reviewedByEmail ? String(data.reviewedByEmail) : null,
    createdAt: asIso(data.createdAt, createdAtMs),
    createdAtMs,
  };
}

export function formatWithdrawalWhen(iso: string | null, ms?: number) {
  const date = iso ? new Date(iso) : ms ? new Date(ms) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  try {
    return date.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return date.toISOString();
  }
}

export function listenMyWithdrawalRequests(
  uid: string,
  onChange: (rows: WithdrawalRequest[]) => void,
): Unsubscribe {
  const id = String(uid || '').trim();
  if (!id) {
    onChange([]);
    return () => undefined;
  }
  const q = query(
    collection(db, 'withdrawalRequests'),
    where('uid', '==', id),
    orderBy('createdAtMs', 'desc'),
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((docSnap) => mapDoc(docSnap.id, docSnap.data() as Record<string, unknown>)));
    },
    () => onChange([]),
  );
}

export function listenAllWithdrawalRequests(
  onChange: (rows: WithdrawalRequest[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'withdrawalRequests'), orderBy('createdAtMs', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((docSnap) => mapDoc(docSnap.id, docSnap.data() as Record<string, unknown>)));
    },
    () => onChange([]),
  );
}
