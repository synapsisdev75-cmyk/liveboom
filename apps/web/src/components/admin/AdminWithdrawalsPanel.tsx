import { useEffect, useMemo, useState } from 'react';
import { Check, ClipboardCopy, Loader2, Search } from 'lucide-react';
import { formatCop } from '../../lib/coinPackages';
import {
  WITHDRAWAL_STATUS_CLASS,
  WITHDRAWAL_STATUS_LABEL,
  formatWithdrawalDate,
  listenAllWithdrawalRequests,
  resolveWithdrawalRequest,
  summarizeWithdrawals,
  type WithdrawalRequest,
  type WithdrawalStatus,
} from '../../lib/withdrawalsFirestore';
import { useAuthStore } from '../../store/authStore';
import { UserAvatar } from '../profile/UserAvatar';

type Filter = 'all' | WithdrawalStatus;

const FILTERS: Filter[] = ['pending', 'approved', 'paid', 'rejected', 'all'];

function copyAccount(row: WithdrawalRequest): string {
  return [
    `Usuario: ${row.displayName} (@${row.username || '—'})`,
    `Fecha: ${formatWithdrawalDate(row.createdAtMs)}`,
    `Blast: ${row.blast} · ${formatCop(row.amountCop)}`,
    `Titular: ${row.fullName}`,
    `Documento: ${row.documentId}`,
    `Medio: ${row.payoutMethod} (${row.accountType})`,
    `Cuenta: ${row.accountNumber}`,
  ].join('\n');
}

/** Super Admin: solicitudes de retiro de todos los usuarios (fecha, hora, nombre y blast). */
export function AdminWithdrawalsPanel() {
  const profile = useAuthStore((s) => s.profile);
  const reviewerEmail = profile?.email ?? '';

  const [rows, setRows] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsub = listenAllWithdrawalRequests(
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

  const totals = useMemo(() => summarizeWithdrawals(rows), [rows]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== 'all' && row.status !== filter) return false;
      if (!term) return true;
      return (
        row.displayName.toLowerCase().includes(term) ||
        row.username.toLowerCase().includes(term) ||
        row.email.toLowerCase().includes(term) ||
        row.fullName.toLowerCase().includes(term) ||
        row.documentId.toLowerCase().includes(term)
      );
    });
  }, [rows, filter, search]);

  async function setStatus(row: WithdrawalRequest, status: WithdrawalStatus) {
    setBusyId(row.id);
    setNote(null);
    try {
      await resolveWithdrawalRequest({
        id: row.id,
        status,
        reviewNote: notes[row.id] ?? row.reviewNote,
        reviewedByEmail: reviewerEmail,
      });
      setNote(
        status === 'rejected'
          ? `Rechazado: se devolvieron ${row.blast.toLocaleString('es-CO')} blast a @${row.username}.`
          : `Solicitud marcada como ${WITHDRAWAL_STATUS_LABEL[status]}.`,
      );
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo actualizar la solicitud');
    } finally {
      setBusyId(null);
    }
  }

  async function copyRow(row: WithdrawalRequest) {
    try {
      await navigator.clipboard.writeText(copyAccount(row));
      setNote('Datos de pago copiados.');
    } catch {
      setNote('No se pudo copiar al portapapeles.');
    }
  }

  return (
    <div className="space-y-4">
      <section className="lb-panel rounded-2xl p-4 sm:p-5">
        <h2 className="text-sm font-bold text-white">Solicitudes de retiro</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Los usuarios solo pueden retirar Blast ganados (regalos en publicaciones, Flash Boom, Boom
          Clip, transmisiones y batallas, más llamadas y videollamadas). Las recargas no son
          retirables.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-amber-400/25 bg-amber-500/5 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300/90">
              Pendientes
            </p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-amber-100">{totals.pending}</p>
          </div>
          <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/5 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-300/90">
              Por pagar
            </p>
            <p className="mt-0.5 break-all text-sm font-bold tabular-nums text-cyan-100">
              {formatCop(totals.pendingCop)}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/5 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-300/90">
              Pagado
            </p>
            <p className="mt-0.5 break-all text-sm font-bold tabular-nums text-emerald-100">
              {formatCop(totals.paidCop)}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
              Solicitudes
            </p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-white">{totals.count}</p>
          </div>
        </div>
      </section>

      <section className="lb-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`min-h-9 rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                  filter === id
                    ? 'bg-fuchsia-500/25 text-fuchsia-100 ring-1 ring-fuchsia-400/40'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {id === 'all' ? 'Todas' : WITHDRAWAL_STATUS_LABEL[id]}
              </button>
            ))}
          </div>
          <label className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, @usuario o documento"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-2.5 pl-8 pr-3 text-xs text-white placeholder:text-zinc-600"
            />
          </label>
        </div>

        {note ? (
          <p className="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
            {note}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-center text-sm text-zinc-500">Cargando solicitudes…</p>
        ) : visible.length === 0 ? (
          <p className="mt-6 text-center text-sm text-zinc-500">
            No hay solicitudes en este filtro.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {visible.map((row) => (
              <li
                key={row.id}
                className="rounded-2xl border border-white/10 bg-zinc-900/60 p-3 sm:p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <UserAvatar
                      uid={row.uid}
                      src={row.avatarUrl}
                      username={row.username}
                      size={40}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            WITHDRAWAL_STATUS_CLASS[row.status]
                          }`}
                        >
                          {WITHDRAWAL_STATUS_LABEL[row.status]}
                        </span>
                        <h3 className="truncate text-sm font-bold text-white">{row.displayName}</h3>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                        @{row.username || '—'}
                        {row.email ? ` · ${row.email}` : ''}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {formatWithdrawalDate(row.createdAtMs)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black tabular-nums text-cyan-300">
                      {row.blast.toLocaleString('es-CO')}
                      <span className="ml-1 text-xs font-semibold text-zinc-400">blast</span>
                    </p>
                    <p className="text-sm font-bold text-emerald-300">{formatCop(row.amountCop)}</p>
                  </div>
                </div>

                <dl className="mt-3 grid gap-2 text-[11px] text-zinc-400 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="font-semibold uppercase tracking-wide text-zinc-500">Titular</dt>
                    <dd className="break-words text-zinc-200">{row.fullName || '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide text-zinc-500">
                      Documento
                    </dt>
                    <dd className="break-words text-zinc-200">{row.documentId || '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide text-zinc-500">Medio</dt>
                    <dd className="break-words text-zinc-200">
                      {row.payoutMethod || '—'} · {row.accountType || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide text-zinc-500">Cuenta</dt>
                    <dd className="break-words text-zinc-200">{row.accountNumber || '—'}</dd>
                  </div>
                </dl>

                <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
                  <input
                    value={notes[row.id] ?? row.reviewNote}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    placeholder="Nota para el usuario (opcional)"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === row.id || row.status === 'approved'}
                      onClick={() => void setStatus(row, 'approved')}
                      className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-cyan-500/20 px-3 text-xs font-semibold text-cyan-100 ring-1 ring-cyan-400/30 disabled:opacity-40"
                    >
                      {busyId === row.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Check size={14} />
                      )}
                      Aprobar
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id || row.status === 'paid'}
                      onClick={() => void setStatus(row, 'paid')}
                      className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-emerald-500/20 px-3 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-400/30 disabled:opacity-40"
                    >
                      Marcar pagado
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id || row.status === 'rejected'}
                      onClick={() => void setStatus(row, 'rejected')}
                      className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-rose-500/20 px-3 text-xs font-semibold text-rose-100 ring-1 ring-rose-400/30 disabled:opacity-40"
                      title="Rechazar y devolver los blast ganados"
                    >
                      Rechazar y devolver
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyRow(row)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15"
                    >
                      <ClipboardCopy size={14} />
                      Copiar datos
                    </button>
                  </div>
                  {row.reviewedByEmail ? (
                    <p className="text-[11px] text-zinc-500">
                      Revisado por {row.reviewedByEmail} · {formatWithdrawalDate(row.reviewedAtMs)}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
