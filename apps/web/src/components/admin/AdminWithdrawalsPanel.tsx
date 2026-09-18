import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, RefreshCw, X } from 'lucide-react';
import { api } from '../../lib/api';
import { formatCop } from '../../lib/coinPackages';
import {
  formatWithdrawalWhen,
  listenAllWithdrawals,
  type WithdrawalRequest,
  type WithdrawalStatus,
} from '../../lib/withdrawalsFirestore';

type Filter = 'all' | WithdrawalStatus;

const STATUS_LABEL: Record<WithdrawalStatus, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  rejected: 'Rechazado',
};

const STATUS_CLASS: Record<WithdrawalStatus, string> = {
  pending: 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30',
  paid: 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30',
  rejected: 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/30',
};

export function AdminWithdrawalsPanel() {
  const [rows, setRows] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const unsub = listenAllWithdrawals(
      (list) => {
        setRows(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  async function refreshFromApi() {
    setNote(null);
    try {
      const data = await api<{ withdrawals: WithdrawalRequest[] }>('/api/payments/withdrawals/all');
      if (Array.isArray(data.withdrawals) && data.withdrawals.length) {
        setRows(
          data.withdrawals.map((row) => ({
            id: String(row.id),
            uid: String(row.uid || ''),
            coins: Math.max(0, Math.floor(Number(row.coins) || 0)),
            amountCop: Math.max(0, Math.floor(Number(row.amountCop) || 0)),
            status: (['pending', 'paid', 'rejected'].includes(String(row.status))
              ? row.status
              : 'pending') as WithdrawalStatus,
            fullName: String(row.fullName || '—'),
            handle: String(row.handle || ''),
            email: String(row.email || ''),
            payoutMethod: String(row.payoutMethod || '—'),
            createdAt: row.createdAt || null,
            createdAtMs: Number(row.createdAtMs) || (row.createdAt ? Date.parse(row.createdAt) : 0),
          })),
        );
      }
      setNote('Lista actualizada.');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo refrescar');
    }
  }

  async function setStatus(row: WithdrawalRequest, status: WithdrawalStatus) {
    setBusyId(row.id);
    setNote(null);
    try {
      await api(`/api/payments/withdrawals/${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, uid: row.uid }),
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
      setNote(`Marcado como ${STATUS_LABEL[status]}.`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo actualizar');
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  return (
    <section className="lb-panel space-y-4 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Solicitudes de retiro</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Solo blast ganados (regalos y llamadas). Nombre, fecha, hora y cantidad.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshFromApi()}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-white/20 hover:text-white"
        >
          <RefreshCw size={14} />
          Refrescar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['pending', 'paid', 'rejected', 'all'] as Filter[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              filter === id
                ? 'bg-fuchsia-500/20 text-fuchsia-100 ring-1 ring-fuchsia-400/40'
                : 'bg-zinc-800/60 text-zinc-400'
            }`}
          >
            {id === 'all' ? 'Todas' : STATUS_LABEL[id]}
          </button>
        ))}
      </div>

      {note ? <p className="text-sm text-cyan-300">{note}</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 size={16} className="animate-spin" /> Cargando solicitudes…
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-zinc-500">No hay solicitudes en este filtro.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => {
            const when = formatWithdrawalWhen(row.createdAt, row.createdAtMs);
            return (
              <li
                key={row.id}
                className="rounded-xl border border-white/10 bg-black/30 p-3 sm:p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{row.fullName}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {row.handle ? `@${row.handle}` : '—'}
                      {row.email ? ` · ${row.email}` : ''}
                    </p>
                    <p className="mt-2 text-sm text-emerald-300">
                      {row.coins.toLocaleString('es-CO')} blast → {formatCop(row.amountCop)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {when.date} · {when.time} · {row.payoutMethod}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${STATUS_CLASS[row.status]}`}
                    >
                      {STATUS_LABEL[row.status]}
                    </span>
                    {row.status === 'pending' ? (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void setStatus(row, 'paid')}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 text-xs font-semibold text-emerald-200 disabled:opacity-50"
                        >
                          <Check size={14} /> Pagado
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void setStatus(row, 'rejected')}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-rose-500/20 px-2.5 text-xs font-semibold text-rose-200 disabled:opacity-50"
                        >
                          <X size={14} /> Rechazar
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
