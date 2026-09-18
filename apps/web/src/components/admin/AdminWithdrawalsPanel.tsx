import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { api } from '../../lib/api';
import { formatCop } from '../../lib/coinPackages';

type WithdrawalStatus = 'pending' | 'processing' | 'paid' | 'rejected';

type WithdrawalRow = {
  id: string;
  uid: string;
  userDisplayName: string;
  username: string;
  userEmail: string;
  coins: number;
  amountCop: number;
  fullName: string;
  documentId: string;
  payoutMethod: string;
  accountNumber: string;
  accountType: string;
  status: WithdrawalStatus;
  reviewNote?: string;
  reviewedByEmail?: string;
  createdAt: string;
  createdAtMs: number;
};

const STATUS_LABEL: Record<WithdrawalStatus, string> = {
  pending: 'Pendiente',
  processing: 'En proceso',
  paid: 'Pagado',
  rejected: 'Rechazado',
};

const STATUS_STYLE: Record<WithdrawalStatus, string> = {
  pending: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  processing: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
  paid: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  rejected: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
};

function safeStatus(value: string): WithdrawalStatus {
  return value === 'processing' || value === 'paid' || value === 'rejected'
    ? value
    : 'pending';
}

export function AdminWithdrawalsPanel() {
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | WithdrawalStatus>('pending');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ withdrawals: WithdrawalRow[] }>(
        '/api/payments/admin/withdrawals',
      );
      setRows(
        (data.withdrawals || []).map((row) => ({
          ...row,
          status: safeStatus(row.status),
        })),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los retiros');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      pending: rows.filter((row) => row.status === 'pending').length,
      processing: rows.filter((row) => row.status === 'processing').length,
      paid: rows.filter((row) => row.status === 'paid').length,
      rejected: rows.filter((row) => row.status === 'rejected').length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/^@/, '');
    return rows.filter((row) => {
      if (filter !== 'all' && row.status !== filter) return false;
      if (!needle) return true;
      return [
        row.userDisplayName,
        row.username,
        row.userEmail,
        row.fullName,
        row.documentId,
        row.accountNumber,
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [filter, query, rows]);

  async function updateStatus(row: WithdrawalRow, status: Exclude<WithdrawalStatus, 'pending'>) {
    const rejecting = status === 'rejected';
    const reviewNote = rejecting
      ? window.prompt('Motivo del rechazo (el Blast ganado se devolverá):', '')?.trim()
      : '';
    if (rejecting && reviewNote === undefined) return;
    if (
      !window.confirm(
        status === 'paid'
          ? `¿Confirmas que pagaste ${formatCop(row.amountCop)} a ${row.fullName}?`
          : status === 'rejected'
            ? `¿Rechazar y devolver ${row.coins.toLocaleString('es-CO')} Blast ganados?`
            : '¿Marcar esta solicitud en proceso?',
      )
    ) {
      return;
    }

    setBusyId(row.id);
    setError(null);
    setMessage(null);
    try {
      const data = await api<{ withdrawal: WithdrawalRow }>(
        `/api/payments/admin/withdrawals/${encodeURIComponent(row.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status, reviewNote: reviewNote || '' }),
        },
      );
      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? { ...data.withdrawal, status: safeStatus(data.withdrawal.status) }
            : item,
        ),
      );
      setMessage(
        status === 'rejected'
          ? 'Solicitud rechazada y Blast ganado devuelto.'
          : status === 'paid'
            ? 'Solicitud marcada como pagada.'
            : 'Solicitud marcada en proceso.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la solicitud');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <header className="lb-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Banknote size={19} className="text-emerald-300" />
            Solicitudes de retiro
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Solo Blast ganados por regalos, llamadas y videollamadas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm text-zinc-300 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </header>

      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {message}
        </p>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['pending', 'processing', 'paid', 'rejected', 'all'] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={`min-h-10 shrink-0 rounded-full px-3 text-xs font-semibold ${
              filter === status
                ? 'bg-fuchsia-500/20 text-fuchsia-100 ring-1 ring-fuchsia-400/40'
                : 'bg-zinc-800/70 text-zinc-400'
            }`}
          >
            {status === 'all' ? 'Todas' : STATUS_LABEL[status]} ({counts[status]})
          </button>
        ))}
      </div>

      <label className="lb-panel relative block rounded-2xl p-2">
        <Search
          size={15}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar nombre, usuario, email, documento o cuenta…"
          className="min-h-11 w-full rounded-xl bg-transparent pl-9 pr-3 text-sm text-white outline-none placeholder:text-zinc-600"
        />
      </label>

      {loading && rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">Cargando solicitudes…</p>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">
          No hay solicitudes con este filtro.
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {visible.map((row) => (
            <li key={row.id} className="lb-panel min-w-0 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">
                    {row.userDisplayName || row.fullName}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    @{row.username || 'sin-usuario'} · {row.userEmail || 'sin email'}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${STATUS_STYLE[row.status]}`}
                >
                  {STATUS_LABEL[row.status]}
                </span>
              </div>

              <div className="mt-3 rounded-xl bg-black/30 p-3">
                <p className="text-xl font-black text-emerald-300">
                  {row.coins.toLocaleString('es-CO')} Blast
                </p>
                <p className="text-sm font-semibold text-white">{formatCop(row.amountCop)}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                  <Clock3 size={12} />
                  {new Date(row.createdAt).toLocaleString('es-CO', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              </div>

              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-zinc-500">Titular</dt>
                <dd className="min-w-0 break-words text-zinc-200">{row.fullName}</dd>
                <dt className="text-zinc-500">Documento</dt>
                <dd className="break-all text-zinc-200">{row.documentId}</dd>
                <dt className="text-zinc-500">Medio</dt>
                <dd className="text-zinc-200">
                  {row.payoutMethod} · {row.accountType}
                </dd>
                <dt className="text-zinc-500">Cuenta</dt>
                <dd className="break-all font-mono text-zinc-200">{row.accountNumber}</dd>
              </dl>

              {row.reviewNote ? (
                <p className="mt-3 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
                  {row.reviewNote}
                </p>
              ) : null}

              {row.status === 'pending' || row.status === 'processing' ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {row.status === 'pending' ? (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void updateStatus(row, 'processing')}
                      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-200 disabled:opacity-50"
                    >
                      <Clock3 size={14} /> Procesar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void updateStatus(row, 'paid')}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-200 disabled:opacity-50"
                  >
                    <CheckCircle2 size={14} /> Pagado
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void updateStatus(row, 'rejected')}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-semibold text-rose-200 disabled:opacity-50"
                  >
                    <XCircle size={14} /> Rechazar
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
