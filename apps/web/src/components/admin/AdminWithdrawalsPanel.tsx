import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Download, RefreshCw } from 'lucide-react';
import { formatMoneyExact } from '../../lib/moneyDisplay';
import {
  downloadAdminWithdrawalReport,
  fetchAdminWithdrawals,
  patchAdminWithdrawal,
  quotedCop,
  type AdminWithdrawal,
  type WithdrawalReportMeta,
} from '../../lib/walletApi';

function formatWhen(value: string | null | undefined) {
  if (!value) return '—';
  const ms = Date.parse(String(value));
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusKey(status: string | null | undefined) {
  return String(status || '').toUpperCase();
}

function canAct(status: string | null | undefined) {
  const s = statusKey(status);
  return s === 'REQUESTED' || s === 'APPROVED' || s === 'PROCESSING' || s === 'PENDING';
}

function adminStatusLabel(status: string | null | undefined) {
  const s = statusKey(status);
  if (s === 'PAID' || s === 'COMPLETED') return 'Pagado';
  if (s === 'REJECTED') return 'Rechazado';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'Anulado';
  if (s === 'APPROVED') return 'Aprobado';
  if (s === 'PROCESSING') return 'En proceso';
  return 'Pendiente';
}

function adminStatusClass(status: string | null | undefined) {
  const s = statusKey(status);
  if (s === 'PAID' || s === 'COMPLETED') return 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30';
  if (s === 'REJECTED' || s === 'CANCELLED' || s === 'CANCELED') {
    return 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/30';
  }
  if (s === 'APPROVED') return 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/30';
  return 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30';
}

function userLabel(row: AdminWithdrawal) {
  return row.snapshot?.displayName || row.user?.displayName || row.user?.username || row.userId || 'Usuario';
}

export function AdminWithdrawalsPanel() {
  const [rows, setRows] = useState<AdminWithdrawal[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [report, setReport] = useState<WithdrawalReportMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { observations: string; ref: string }>>({});

  const applyPage = useCallback((page: Awaited<ReturnType<typeof fetchAdminWithdrawals>>, append: boolean) => {
    setRows((prev) => (append ? [...prev, ...(page.withdrawals || [])] : page.withdrawals || []));
    setNextCursor(page.nextCursor || null);
    if (page.report) setReport(page.report);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applyPage(await fetchAdminWithdrawals(null), false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las solicitudes.');
    } finally {
      setLoading(false);
    }
  }, [applyPage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      applyPage(await fetchAdminWithdrawals(nextCursor), true);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo cargar más');
    } finally {
      setLoadingMore(false);
    }
  }

  function draft(id: string) {
    return drafts[id] || { observations: '', ref: '' };
  }

  async function onStatus(row: AdminWithdrawal, status: string) {
    const id = row.withdrawalId || row.paymentReference;
    if (!id) return;
    const current = draft(id);
    if (status === 'PAID' && !current.ref.trim()) {
      setNote('Indica la referencia real del desembolso para marcar Pagado.');
      return;
    }
    const labels: Record<string, string> = {
      APPROVED: '¿Aprobar esta solicitud? No se paga todavía.',
      PROCESSING: '¿Pasar a En proceso?',
      PAID: `¿Marcar pagado ${formatMoneyExact(quotedCop(row) ?? 0, row.currency || 'COP')}?`,
      REJECTED: '¿Rechazar y devolver el BLAST reservado?',
      CANCELLED: '¿Anular y devolver el BLAST reservado?',
    };
    if (!window.confirm(labels[status] || '¿Actualizar estado?')) return;
    setBusyId(id);
    setNote(null);
    try {
      await patchAdminWithdrawal(id, {
        status,
        observations: current.observations,
        disbursementReference: current.ref,
      });
      setRows((prev) =>
        prev.map((item) =>
          (item.withdrawalId || item.paymentReference) === id
            ? {
                ...item,
                status,
                observations: current.observations,
                disbursementReference: status === 'PAID' ? current.ref : item.disbursementReference,
                paidAt: status === 'PAID' ? new Date().toISOString() : item.paidAt,
              }
            : item,
        ),
      );
      setNote('Solicitud actualizada. El Excel se sincroniza en el servidor.');
      void load();
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo actualizar');
    } finally {
      setBusyId(null);
    }
  }

  async function onDownload() {
    setDownloading(true);
    setNote(null);
    try {
      const file = await downloadAdminWithdrawalReport();
      const url = URL.createObjectURL(file.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo descargar el Excel');
    } finally {
      setDownloading(false);
    }
  }

  const totals = report?.summary;

  return (
    <div className="space-y-4">
      <div className="lb-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Banknote size={18} className="text-cyan-300" />
            Solicitud de retiros
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            {totals?.count ?? rows.length} en el sistema · esta página muestra {rows.length}
            {totals ? ` · solicitado ${formatMoneyExact(totals.totalCop ?? 0, 'COP')}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onDownload()}
            disabled={downloading}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-500/40 px-4 py-2 text-sm text-cyan-200 hover:border-cyan-400 disabled:opacity-50"
          >
            <Download size={14} />
            {downloading ? 'Descargando…' : 'Descargar Excel'}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
          <Link
            to="/super-admin?tab=verifications"
            className="inline-flex min-h-11 items-center rounded-xl border border-fuchsia-500/40 px-4 py-2 text-sm text-fuchsia-100 hover:border-fuchsia-400"
          >
            Expedientes de verificación
          </Link>
        </div>
      </div>

      <p
        className={`rounded-xl px-4 py-2 text-sm ${
          report?.pending
            ? 'border border-amber-500/30 bg-amber-500/10 text-amber-100'
            : 'border border-white/10 bg-black/20 text-zinc-400'
        }`}
      >
        {report?.pending
          ? `El Excel está pendiente de sincronizar${report.lastError ? `: ${report.lastError}` : '.'}`
          : `Excel actualizado ${report?.generatedAtLabel || 'aún no generado'}. La descarga es una copia con fecha de corte, no un archivo en vivo.`}
      </p>

      {note ? (
        <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200">{note}</p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">{error}</p>
      ) : null}

      {loading ? <p className="text-sm text-zinc-400">Cargando solicitudes…</p> : null}
      {!loading && !rows.length ? (
        <p className="text-sm text-zinc-400">No hay solicitudes de retiro.</p>
      ) : null}

      <ul className="space-y-3">
        {rows.map((row, index) => {
          const id = row.withdrawalId || row.paymentReference || `wd-${index}`;
          const money = quotedCop(row) ?? 0;
          const busy = busyId === id;
          const payout = row.payout;
          const current = draft(id);
          return (
            <li key={id} className="lb-panel space-y-3 rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-zinc-500">{id}</p>
                  <p className="text-sm font-semibold text-white">{userLabel(row)}</p>
                  <p className="text-xs text-zinc-500">
                    {row.snapshot?.email || row.user?.email || 'sin correo'}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{formatWhen(row.requestedAt)}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${adminStatusClass(row.status)}`}>
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
                    {Math.max(0, Math.floor(Number(row.earnedBlastAmount) || 0)).toLocaleString('es-CO')} BLAST ganados
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Datos de pago</p>
                  {payout ? (
                    <div className="space-y-0.5 text-sm text-zinc-200">
                      {payout.fullName ? <p>{payout.fullName}</p> : null}
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
              <label className="block text-xs text-zinc-400">
                Observaciones
                <input
                  value={current.observations}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [id]: { ...draft(id), observations: e.target.value },
                    }))
                  }
                  className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </label>
              {canAct(row.status) ? (
                <>
                  <label className="block text-xs text-zinc-400">
                    Referencia de pago (obligatoria para Pagado)
                    <input
                      value={current.ref}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [id]: { ...draft(id), ref: e.target.value } }))
                      }
                      className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onStatus(row, 'APPROVED')}
                      className="inline-flex min-h-11 items-center rounded-xl bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100 ring-1 ring-cyan-400/30 disabled:opacity-50"
                    >
                      Aprobar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onStatus(row, 'PROCESSING')}
                      className="inline-flex min-h-11 items-center rounded-xl bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 ring-1 ring-amber-400/30 disabled:opacity-50"
                    >
                      En proceso
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onStatus(row, 'PAID')}
                      className="inline-flex min-h-11 items-center rounded-xl bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 ring-1 ring-emerald-400/30 disabled:opacity-50"
                    >
                      Pagado
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onStatus(row, 'REJECTED')}
                      className="inline-flex min-h-11 items-center rounded-xl bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100 ring-1 ring-rose-400/30 disabled:opacity-50"
                    >
                      Rechazar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onStatus(row, 'CANCELLED')}
                      className="inline-flex min-h-11 items-center rounded-xl bg-zinc-700/60 px-4 py-2 text-sm font-semibold text-zinc-200 ring-1 ring-zinc-500/30 disabled:opacity-50"
                    >
                      Anular
                    </button>
                  </div>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>

      {nextCursor ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void loadMore()}
          className="min-h-11 w-full rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 disabled:opacity-50"
        >
          {loadingMore ? 'Cargando…' : 'Cargar más'}
        </button>
      ) : null}
    </div>
  );
}
