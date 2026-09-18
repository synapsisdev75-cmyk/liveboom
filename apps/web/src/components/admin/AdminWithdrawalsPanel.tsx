import { useEffect, useMemo, useState } from 'react';
import { Banknote, Check, Loader2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { formatCop } from '../../lib/coinPackages';
import {
  formatWithdrawalWhen,
  listenAllWithdrawalRequests,
  type WithdrawalRequest,
  type WithdrawalStatus,
} from '../../lib/withdrawalRequestsFirestore';
import { useAuthStore } from '../../store/authStore';

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
  const email = useAuthStore((s) => s.profile?.email ?? '');
  const [rows, setRows] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = listenAllWithdrawalRequests((list) => {
      setRows(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api<{ withdrawals: WithdrawalRequest[] }>('/api/payments/admin/withdrawals');
        if (!cancelled && data.withdrawals?.length && rows.length === 0) {
          setRows(data.withdrawals);
        }
      } catch {
        /* Firestore listener es la fuente principal */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Solo respaldo inicial si el listener llega vacío.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter((row) => row.status === filter)),
    [filter, rows],
  );

  async function review(id: string, status: 'paid' | 'rejected') {
    setBusyId(id);
    setNote(null);
    try {
      await api(`/api/payments/admin/withdrawals/${id}`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      setRows((current) =>
        current.map((row) => (row.id === id ? { ...row, status, reviewedByEmail: email } : row)),
      );
      setNote(status === 'paid' ? 'Marcado como pagado.' : 'Solicitud rechazada. Se devolvieron los Blast ganados.');
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'No se pudo actualizar');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="lb-panel space-y-4 rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Retiros</p>
          <h2 className="text-lg font-bold text-white">Solicitudes de retiro</h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-400">
            Solo se retiran Blast ganados por regalos, llamadas y videollamadas. Las recargas no aparecen aquí.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['pending', 'paid', 'rejected', 'all'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                filter === id
                  ? 'bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/40'
                  : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {id === 'all' ? 'Todas' : STATUS_LABEL[id]}
            </button>
          ))}
        </div>
      </div>

      {note ? <p className="text-sm text-cyan-200">{note}</p> : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 size={14} className="animate-spin" /> Cargando solicitudes…
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-zinc-500">
          No hay solicitudes {filter === 'all' ? '' : STATUS_LABEL[filter].toLowerCase()}.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-white/10 bg-black/25 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">
                    {row.fullName || row.displayName || 'Usuario'}
                    {row.username ? (
                      <span className="ml-2 font-medium text-zinc-400">@{row.username}</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatWithdrawalWhen(row.createdAt, row.createdAtMs)}
                    {row.email ? ` · ${row.email}` : ''}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_CLASS[row.status]}`}>
                  {STATUS_LABEL[row.status]}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-4">
                <p className="text-xl font-black tabular-nums text-emerald-300">
                  {row.coins.toLocaleString('es-CO')}{' '}
                  <span className="text-sm font-semibold text-emerald-200/80">Blast</span>
                </p>
                <p className="text-sm font-semibold text-zinc-300">{formatCop(row.amountCop)}</p>
                <p className="text-xs text-zinc-500">
                  {row.payoutMethod || '—'}
                  {row.accountNumber ? ` · ${row.accountNumber}` : ''}
                  {row.accountType ? ` · ${row.accountType}` : ''}
                </p>
              </div>
              {row.status === 'pending' ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void review(row.id, 'paid')}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-emerald-500 px-4 text-sm font-bold text-zinc-950 disabled:opacity-50"
                  >
                    {busyId === row.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Marcar pagado
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void review(row.id, 'rejected')}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-rose-400/40 px-4 text-sm font-semibold text-rose-200 disabled:opacity-50"
                  >
                    <X size={14} />
                    Rechazar
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-center gap-2 text-[11px] text-zinc-600">
        <Banknote size={12} />
        {rows.length} solicitud{rows.length === 1 ? '' : 'es'} en total
      </p>
    </section>
  );
}
