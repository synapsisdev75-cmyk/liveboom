import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, RefreshCw } from 'lucide-react';
import { formatMoneyExact } from '../../lib/moneyDisplay';
import {
  confirmAdminWithdrawal,
  fetchAdminWithdrawals,
  quotedCop,
  rejectAdminWithdrawal,
  type AdminWithdrawal,
} from '../../lib/walletApi';

type Filter = 'all' | 'pending' | 'paid' | 'rejected';

function formatWhen(value: string | null | undefined) {
  if (!value) return '—';
  const ms = Date.parse(String(value));
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusKey(status: string | null | undefined) {
  return String(status || '').toUpperCase();
}

function isPending(status: string | null | undefined) {
  const s = statusKey(status);
  return s === 'REQUESTED' || s === 'PROCESSING' || s === 'PENDING';
}

function isPaid(status: string | null | undefined) {
  const s = statusKey(status);
  return s === 'PAID' || s === 'COMPLETED';
}

function isRejected(status: string | null | undefined) {
  const s = statusKey(status);
  return s === 'REJECTED' || s === 'CANCELLED' || s === 'CANCELED';
}

function adminStatusLabel(status: string | null | undefined) {
  if (isPaid(status)) return 'Pagado';
  if (isRejected(status)) return 'Rechazado';
  if (statusKey(status) === 'PROCESSING') return 'En proceso';
  return 'Pendiente';
}

function adminStatusClass(status: string | null | undefined) {
  if (isPaid(status)) return 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30';
  if (isRejected(status)) return 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/30';
  return 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30';
}

function userLabel(row: AdminWithdrawal) {
  const name = row.user?.displayName || row.user?.username;
  if (name) return name;
  if (row.user?.email) return row.user.email;
  return row.userId || 'Usuario';
}

export function AdminWithdrawalsPanel() {
  const [rows, setRows] = useState<AdminWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchAdminWithdrawals();
      setRows(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las solicitudes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = rows.filter((r) => isPending(r.status)).length;
  const paidCount = rows.filter((r) => isPaid(r.status)).length;
  const rejectedCount = rows.filter((r) => isRejected(r.status)).length;

  const visible = useMemo(() => {
    if (filter === 'pending') return rows.filter((r) => isPending(r.status));
    if (filter === 'paid') return rows.filter((r) => isPaid(r.status));
    if (filter === 'rejected') return rows.filter((r) => isRejected(r.status));
    return rows;
  }, [rows, filter]);

  async function onConfirm(row: AdminWithdrawal) {
    const id = row.withdrawalId || row.paymentReference;
    if (!id) return;
    const money = formatMoneyExact(quotedCop(row) ?? 0, row.currency || 'COP');
    if (!window.confirm(`¿Marcar como pagado ${money}?`)) return;
    setBusyId(id);
    setNote(null);
    try {
      await confirmAdminWithdrawal(id);
      setRows((prev) =>
        prev.map((item) =>
          (item.withdrawalId || item.paymentReference) === id
            ? { ...item, status: 'PAID', processedAt: new Date().toISOString() }
            : item,
        ),
      );
      setNote(`Retiro pagado: ${money}`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo confirmar el retiro');
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(row: AdminWithdrawal) {
    const id = row.withdrawalId || row.paymentReference;
    if (!id) return;
    if (!window.confirm('¿Rechazar esta solicitud? El BLAST se devolverá al creador.')) return;
    setBusyId(id);
    setNote(null);
    try {
      await rejectAdminWithdrawal(id);
      setRows((prev) =>
        prev.map((item) =>
          (item.withdrawalId || item.paymentReference) === id
            ? { ...item, status: 'REJECTED', processedAt: new Date().toISOString() }
            : item,
        ),
      );
      setNote('Solicitud rechazada. BLAST devuelto.');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo rechazar el retiro');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="lb-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Banknote size={18} className="text-cyan-300" />
            Solicitud de retiros
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            {rows.length} solicitudes ·{' '}
            <span className="text-amber-300">{pendingCount} pendientes</span> ·{' '}
            <span className="text-emerald-400">{paidCount} pagadas</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {note ? (
        <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200">
          {note}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['pending', `Pendientes (${pendingCount})`],
            ['all', `Todas (${rows.length})`],
            ['paid', `Pagadas (${paidCount})`],
            ['rejected', `Rechazadas (${rejectedCount})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`min-h-11 rounded-full px-4 py-2 text-xs font-semibold transition ${
              filter === id
                ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40'
                : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-zinc-400">Cargando solicitudes…</p> : null}

      {!loading && !visible.length ? (
        <p className="text-sm text-zinc-400">No hay solicitudes de retiro en este filtro.</p>
      ) : null}

      <ul className="space-y-3">
        {visible.map((row, index) => {
          const id = row.withdrawalId || row.paymentReference || `wd-${index}`;
          const money = quotedCop(row) ?? 0;
          const pending = isPending(row.status);
          const busy = busyId === id;
          const payout = row.payout;
          return (
            <li key={id} className="lb-panel space-y-3 rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{userLabel(row)}</p>
                  <p className="text-xs text-zinc-500">
                    {row.user?.username ? `@${row.user.username}` : null}
                    {row.user?.username && row.user?.email ? ' · ' : null}
                    {row.user?.email || null}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{formatWhen(row.requestedAt)}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${adminStatusClass(row.status)}`}
                >
                  {adminStatusLabel(row.status)}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Monto</p>
                  <p className="text-base font-semibold text-white">
                    {formatMoneyExact(money, row.currency || 'COP')}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {Math.max(0, Math.floor(Number(row.earnedBlastAmount) || 0)).toLocaleString('es-CO')}{' '}
                    BLAST ganados
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    Datos de pago
                  </p>
                  {payout ? (
                    <div className="space-y-0.5 text-sm text-zinc-200">
                      {payout.fullName ? <p>{payout.fullName}</p> : null}
                      {payout.documentId ? <p>Doc. {payout.documentId}</p> : null}
                      <p>
                        {payout.payoutMethod || 'Medio'}
                        {payout.accountType ? ` · ${payout.accountType}` : ''}
                      </p>
                      {payout.accountNumber ? (
                        <p className="font-mono text-cyan-200">{payout.accountNumber}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">Sin datos de cuenta</p>
                  )}
                </div>
              </div>

              {pending ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onConfirm(row)}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30 disabled:opacity-50"
                  >
                    {busy ? 'Procesando…' : 'Marcar pagado'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onReject(row)}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100 ring-1 ring-rose-400/30 hover:bg-rose-500/30 disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
