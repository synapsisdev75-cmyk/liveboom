/**
 * Solicitudes de retiro (Blast ganados → COP).
 *
 * Reglas de negocio:
 * - Solo se retira `earnedBlastBalance` (regalos + llamadas / videollamadas).
 *   Los Blast comprados (`purchasedBlastBalance`) nunca son retirables.
 * - Al crear la solicitud el saldo ganado se reserva (se descuenta) y se suma a
 *   `earnedBlastWithdrawn`; si el Super Admin rechaza, se devuelve.
 */
import {
  collection,
  doc,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { COIN_TO_COP, MIN_WITHDRAW_COINS, coinsToCop } from './coinPackages';
import { normalizeBlastBalances } from './blastBalances';
import { db } from './firebase';

export const WITHDRAWALS_COLLECTION = 'withdrawalRequests';

export type WithdrawalStatus = 'pending' | 'approved' | 'paid' | 'rejected';

export type WithdrawalRequest = {
  id: string;
  uid: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  /** Blast ganados solicitados. */
  blast: number;
  amountCop: number;
  coinToCop: number;
  fullName: string;
  documentId: string;
  payoutMethod: string;
  accountNumber: string;
  accountType: string;
  status: WithdrawalStatus;
  reviewNote: string;
  reviewedByEmail: string | null;
  reviewedAtMs: number | null;
  createdAtMs: number;
  updatedAtMs: number | null;
};

export const WITHDRAWAL_STATUS_LABEL: Record<WithdrawalStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  paid: 'Pagado',
  rejected: 'Rechazado',
};

export const WITHDRAWAL_STATUS_CLASS: Record<WithdrawalStatus, string> = {
  pending: 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30',
  approved: 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/30',
  paid: 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30',
  rejected: 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/30',
};

const STATUSES: WithdrawalStatus[] = ['pending', 'approved', 'paid', 'rejected'];

function asStatus(value: unknown): WithdrawalStatus {
  const raw = String(value || 'pending') as WithdrawalStatus;
  return STATUSES.includes(raw) ? raw : 'pending';
}

function asMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toDate' in value) {
    try {
      return (value as { toDate: () => Date }).toDate().getTime();
    } catch {
      return null;
    }
  }
  return null;
}

function mapDoc(id: string, data: Record<string, unknown>): WithdrawalRequest {
  const blast = Math.max(0, Math.floor(Number(data.blast) || 0));
  return {
    id,
    uid: String(data.uid || ''),
    username: String(data.username || '').replace(/^@/, ''),
    displayName: String(data.displayName || data.fullName || 'Usuario'),
    email: String(data.email || ''),
    avatarUrl: (data.avatarUrl as string | null) ?? null,
    blast,
    amountCop: Math.max(0, Math.floor(Number(data.amountCop) || coinsToCop(blast))),
    coinToCop: Math.max(1, Math.floor(Number(data.coinToCop) || COIN_TO_COP)),
    fullName: String(data.fullName || ''),
    documentId: String(data.documentId || ''),
    payoutMethod: String(data.payoutMethod || ''),
    accountNumber: String(data.accountNumber || ''),
    accountType: String(data.accountType || ''),
    status: asStatus(data.status),
    reviewNote: String(data.reviewNote || ''),
    reviewedByEmail: data.reviewedByEmail ? String(data.reviewedByEmail) : null,
    reviewedAtMs: asMs(data.reviewedAtMs),
    createdAtMs: asMs(data.createdAtMs) ?? asMs(data.createdAt) ?? 0,
    updatedAtMs: asMs(data.updatedAtMs) ?? asMs(data.updatedAt),
  };
}

/** Fecha + hora en formato local (es-CO). */
export function formatWithdrawalDate(ms: number | null): string {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export type CreateWithdrawalInput = {
  uid: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
  blast: number;
  fullName: string;
  documentId: string;
  payoutMethod: string;
  accountNumber: string;
  accountType: string;
};

export type CreateWithdrawalResult = {
  id: string;
  blast: number;
  amountCop: number;
  earnedBlastBalance: number;
  coinsBalance: number;
  purchasedBlastBalance: number;
};

/**
 * Reserva Blast ganados y registra la solicitud.
 * Falla si el usuario no tiene suficientes Blast ganados (los comprados no cuentan).
 */
export async function createWithdrawalRequest(
  input: CreateWithdrawalInput,
): Promise<CreateWithdrawalResult> {
  const uid = String(input.uid || '').trim();
  if (!uid) throw new Error('Inicia sesión para retirar');

  const blast = Math.max(0, Math.floor(Number(input.blast) || 0));
  if (blast < MIN_WITHDRAW_COINS) {
    throw new Error(
      `El retiro mínimo es ${MIN_WITHDRAW_COINS} Blast ganados ($${coinsToCop(
        MIN_WITHDRAW_COINS,
      ).toLocaleString('es-CO')} COP)`,
    );
  }

  const fullName = input.fullName.trim().slice(0, 120);
  const documentId = input.documentId.trim().slice(0, 32);
  const payoutMethod = input.payoutMethod.trim().slice(0, 40);
  const accountNumber = input.accountNumber.trim().slice(0, 40);
  const accountType = input.accountType.trim().slice(0, 20) || 'ahorros';

  if (fullName.length < 3) throw new Error('Indica el nombre completo del titular');
  if (documentId.length < 5) throw new Error('Indica la cédula o documento');
  if (payoutMethod.length < 2) throw new Error('Indica el banco o medio de pago');
  if (accountNumber.length < 6) throw new Error('Indica el número de cuenta o celular');

  const amountCop = coinsToCop(blast);
  const requestRef = doc(collection(db, WITHDRAWALS_COLLECTION));

  const balances = await runTransaction(db, async (tx) => {
    const userRef = doc(db, 'users', uid);
    const snap = await tx.get(userRef);
    const current = normalizeBlastBalances(
      snap.exists() ? (snap.data() as Record<string, unknown>) : {},
    );
    if (current.earnedBlastBalance < blast) {
      throw new Error(
        `Solo puedes retirar Blast ganados. Disponibles: ${current.earnedBlastBalance.toLocaleString(
          'es-CO',
        )}`,
      );
    }
    const next = normalizeBlastBalances({
      purchasedBlastBalance: current.purchasedBlastBalance,
      earnedBlastBalance: current.earnedBlastBalance - blast,
      earnedBlastSpent: current.earnedBlastSpent,
      earnedBlastWithdrawn: current.earnedBlastWithdrawn + blast,
    });
    tx.set(
      userRef,
      {
        coinsBalance: next.coinsBalance,
        purchasedBlastBalance: next.purchasedBlastBalance,
        earnedBlastBalance: next.earnedBlastBalance,
        earnedBlastWithdrawn: next.earnedBlastWithdrawn,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    tx.set(requestRef, {
      uid,
      username: String(input.username || '').replace(/^@/, '').slice(0, 40),
      displayName: String(input.displayName || fullName).slice(0, 80),
      email: String(input.email || '').trim().toLowerCase().slice(0, 120),
      avatarUrl: input.avatarUrl ?? null,
      blast,
      amountCop,
      coinToCop: COIN_TO_COP,
      fullName,
      documentId,
      payoutMethod,
      accountNumber,
      accountType,
      status: 'pending',
      reviewNote: '',
      reviewedByEmail: null,
      reviewedAtMs: null,
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    });
    return next;
  });

  return {
    id: requestRef.id,
    blast,
    amountCop,
    earnedBlastBalance: balances.earnedBlastBalance,
    purchasedBlastBalance: balances.purchasedBlastBalance,
    coinsBalance: balances.coinsBalance,
  };
}

function sortByDateDesc(rows: WithdrawalRequest[]): WithdrawalRequest[] {
  return [...rows].sort((a, b) => b.createdAtMs - a.createdAtMs);
}

/** Solicitudes propias (espacio del cliente). */
export function listenMyWithdrawalRequests(
  uid: string,
  onChange: (rows: WithdrawalRequest[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const id = String(uid || '').trim();
  if (!id) {
    onChange([]);
    return () => undefined;
  }
  const q = query(collection(db, WITHDRAWALS_COLLECTION), where('uid', '==', id), fsLimit(100));
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        sortByDateDesc(snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>))),
      );
    },
    (error) => onError?.(error instanceof Error ? error : new Error(String(error))),
  );
}

/** Todas las solicitudes (Super Admin). */
export function listenAllWithdrawalRequests(
  onChange: (rows: WithdrawalRequest[]) => void,
  onError?: (error: Error) => void,
  max = 300,
): Unsubscribe {
  const q = query(
    collection(db, WITHDRAWALS_COLLECTION),
    orderBy('createdAtMs', 'desc'),
    fsLimit(max),
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        sortByDateDesc(snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>))),
      );
    },
    (error) => onError?.(error instanceof Error ? error : new Error(String(error))),
  );
}

/**
 * Cambia el estado de una solicitud (Super Admin).
 * `rejected` devuelve los Blast ganados al usuario; volver a `pending`/`approved`/`paid`
 * desde `rejected` los vuelve a reservar.
 */
export async function resolveWithdrawalRequest(input: {
  id: string;
  status: WithdrawalStatus;
  reviewNote?: string;
  reviewedByEmail: string;
}): Promise<void> {
  const id = String(input.id || '').trim();
  if (!id) throw new Error('Solicitud no válida');
  const nextStatus = asStatus(input.status);
  const reviewNote = (input.reviewNote ?? '').trim().slice(0, 500);
  const reviewedByEmail = input.reviewedByEmail.trim().toLowerCase();

  await runTransaction(db, async (tx) => {
    const requestRef = doc(db, WITHDRAWALS_COLLECTION, id);
    const snap = await tx.get(requestRef);
    if (!snap.exists()) throw new Error('La solicitud ya no existe');
    const data = snap.data() as Record<string, unknown>;
    const current = asStatus(data.status);
    if (current === nextStatus) return;

    const blast = Math.max(0, Math.floor(Number(data.blast) || 0));
    const uid = String(data.uid || '');
    const refunding = nextStatus === 'rejected';
    const reReserving = current === 'rejected';

    if (uid && blast > 0 && (refunding || reReserving)) {
      const userRef = doc(db, 'users', uid);
      const userSnap = await tx.get(userRef);
      const balances = normalizeBlastBalances(
        userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : {},
      );
      if (reReserving && balances.earnedBlastBalance < blast) {
        throw new Error('El usuario ya no tiene esos Blast ganados disponibles');
      }
      const next = normalizeBlastBalances({
        purchasedBlastBalance: balances.purchasedBlastBalance,
        earnedBlastBalance: refunding
          ? balances.earnedBlastBalance + blast
          : balances.earnedBlastBalance - blast,
        earnedBlastSpent: balances.earnedBlastSpent,
        earnedBlastWithdrawn: Math.max(
          0,
          refunding
            ? balances.earnedBlastWithdrawn - blast
            : balances.earnedBlastWithdrawn + blast,
        ),
      });
      tx.set(
        userRef,
        {
          coinsBalance: next.coinsBalance,
          purchasedBlastBalance: next.purchasedBlastBalance,
          earnedBlastBalance: next.earnedBlastBalance,
          earnedBlastWithdrawn: next.earnedBlastWithdrawn,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }

    tx.update(requestRef, {
      status: nextStatus,
      reviewNote,
      reviewedByEmail,
      reviewedAtMs: Date.now(),
      updatedAtMs: Date.now(),
    });
  });
}

export type WithdrawalTotals = {
  count: number;
  pending: number;
  approved: number;
  paid: number;
  rejected: number;
  pendingBlast: number;
  pendingCop: number;
  paidBlast: number;
  paidCop: number;
};

export function summarizeWithdrawals(rows: WithdrawalRequest[]): WithdrawalTotals {
  const totals: WithdrawalTotals = {
    count: rows.length,
    pending: 0,
    approved: 0,
    paid: 0,
    rejected: 0,
    pendingBlast: 0,
    pendingCop: 0,
    paidBlast: 0,
    paidCop: 0,
  };
  for (const row of rows) {
    totals[row.status] += 1;
    if (row.status === 'pending' || row.status === 'approved') {
      totals.pendingBlast += row.blast;
      totals.pendingCop += row.amountCop;
    }
    if (row.status === 'paid') {
      totals.paidBlast += row.blast;
      totals.paidCop += row.amountCop;
    }
  }
  return totals;
}
