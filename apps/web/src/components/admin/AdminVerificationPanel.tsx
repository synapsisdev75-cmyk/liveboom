import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Shield } from 'lucide-react';
import {
  SLOT_LABELS,
  decideVerificationCase,
  fetchAdminVerificationCase,
  fetchAdminVerificationQueue,
  fetchVerificationFileUrl,
  statusLabel,
  type QueueCase,
  type VerificationCase,
} from '../../lib/verificationApi';

function formatWhen(ms: number | null | undefined) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AdminVerificationPanel() {
  const [rows, setRows] = useState<QueueCase[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState('queue');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [detail, setDetail] = useState<VerificationCase | null>(null);
  const [reason, setReason] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (append = false, cursor?: string | null) => {
      if (!append) setLoading(true);
      setError(null);
      try {
        const page = await fetchAdminVerificationQueue(cursor, filter);
        setRows((prev) => (append ? [...prev, ...(page.cases || [])] : page.cases || []));
        setNextCursor(page.nextCursor || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo cargar la cola');
      } finally {
        setLoading(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  async function openCase(uid: string) {
    setSelectedUid(uid);
    setNote(null);
    setReason('');
    setInternalNote('');
    setSlots([]);
    try {
      const next = await fetchAdminVerificationCase(uid);
      setDetail(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el expediente');
    }
  }

  async function decide(action: 'approve' | 'correct' | 'reject') {
    if (!selectedUid) return;
    if (action === 'correct' && !reason.trim()) {
      setNote('Indica la corrección concreta para el usuario.');
      return;
    }
    if (action === 'reject' && !reason.trim()) {
      setNote('Documenta el motivo de rechazo.');
      return;
    }
    const confirms = {
      approve:
        '¿Aprobar identidad y cuenta? El usuario podrá solicitar un retiro. No se transfiere dinero.',
      correct: '¿Pedir corrección? El usuario deberá reemplazar las evidencias marcadas.',
      reject: '¿Rechazar el expediente con el motivo indicado? No se transfiere dinero.',
    };
    if (!window.confirm(confirms[action])) return;
    setBusy(true);
    setNote(null);
    try {
      const next = await decideVerificationCase(selectedUid, {
        action,
        reason,
        internalNote,
        slots,
      });
      setDetail({ ...next, userId: selectedUid });
      setNote(
        action === 'approve'
          ? 'Expediente aprobado. El usuario ya puede solicitar un retiro; no se transfirió dinero.'
          : action === 'correct'
            ? 'Se pidió una corrección concreta.'
            : 'Expediente rechazado con motivo documentado.',
      );
      void load(false);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo registrar la decisión');
    } finally {
      setBusy(false);
    }
  }

  async function openFile(fileId: string) {
    if (!selectedUid) return;
    try {
      const signed = await fetchVerificationFileUrl(fileId, selectedUid);
      if (signed.url) window.open(signed.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo abrir el archivo');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)]">
      <section className="lb-panel space-y-3 rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-bold text-cyan-200">
              <Shield size={16} /> Expedientes de verificación
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Distinto de la solicitud financiera de retiro.{' '}
              <Link to="/super-admin?tab=withdrawals" className="text-cyan-300">
                Ir a retiros
              </Link>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(false)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-700 px-3 text-sm text-zinc-300"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilter('queue')}
            className={`min-h-11 rounded-xl px-3 text-sm ${filter === 'queue' ? 'bg-fuchsia-500/20 text-fuchsia-100' : 'text-zinc-400'}`}
          >
            Pendientes
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`min-h-11 rounded-xl px-3 text-sm ${filter === 'all' ? 'bg-fuchsia-500/20 text-fuchsia-100' : 'text-zinc-400'}`}
          >
            Todos
          </button>
        </div>
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {loading ? <p className="text-sm text-zinc-400">Cargando cola…</p> : null}
        {!loading && !rows.length ? (
          <p className="text-sm text-zinc-400">No hay expedientes en esta vista.</p>
        ) : null}
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.userId}>
              <button
                type="button"
                onClick={() => void openCase(row.userId)}
                className={`w-full rounded-xl border px-3 py-3 text-left ${
                  selectedUid === row.userId
                    ? 'border-cyan-400/40 bg-cyan-500/10'
                    : 'border-white/10 bg-black/20'
                }`}
              >
                <p className="text-sm font-semibold text-white">{row.legalName || 'Sin nombre legal'}</p>
                <p className="text-xs text-zinc-500">
                  {statusLabel(row.status)} · {row.documentType || '—'} · {formatWhen(row.updatedAtMs)}
                </p>
                <p className="font-mono text-[11px] text-zinc-600">{row.caseId}</p>
              </button>
            </li>
          ))}
        </ul>
        {nextCursor ? (
          <button
            type="button"
            className="min-h-11 text-sm text-cyan-300"
            onClick={() => void load(true, nextCursor)}
          >
            Cargar más
          </button>
        ) : null}
      </section>

      <section className="lb-panel space-y-4 rounded-2xl p-4">
        {!detail ? (
          <p className="text-sm text-zinc-400">Abre un expediente para revisar evidencias y decidir.</p>
        ) : (
          <>
            <header>
              <p className="font-mono text-[11px] text-zinc-500">{detail.caseId}</p>
              <h2 className="text-lg font-bold text-white">{detail.identity.legalName || 'Sin nombre legal'}</h2>
              <p className="text-xs text-zinc-500">
                Identidad {statusLabel(detail.identityStatus)} · Cuenta {statusLabel(detail.accountStatus)}
              </p>
            </header>
            <div className="grid gap-2 sm:grid-cols-2 text-sm text-zinc-200">
              <p>Documento: {detail.identity.documentType} {detail.identity.documentNumber}</p>
              <p>Nacimiento: {detail.identity.birthDate || '—'}</p>
              <p>Correo: {detail.identity.email || '—'}</p>
              <p>País: {detail.identity.documentCountry || 'CO'}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Cuentas</p>
              <ul className="mt-2 space-y-2">
                {detail.accounts.map((account) => (
                  <li key={account.id} className="rounded-xl bg-black/30 px-3 py-2 text-sm text-zinc-200">
                    {account.bank} · {account.accountType} · {account.accountNumberMasked} · {account.holderName} ·{' '}
                    {statusLabel(account.status)}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Documentos (enlace temporal, no publicar)</p>
              <ul className="mt-2 space-y-2">
                {detail.files.map((file) => (
                  <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/30 px-3 py-2">
                    <span className="text-sm text-zinc-200">
                      {SLOT_LABELS[file.slot] || file.slot} · {file.contentType}
                    </span>
                    <button type="button" className="min-h-11 text-sm text-cyan-300" onClick={() => void openFile(file.id)}>
                      Consultar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {detail.events?.length ? (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Historial</p>
                <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                  {detail.events.map((event) => (
                    <li key={event.id} className="rounded-xl bg-black/20 px-3 py-2 text-xs text-zinc-400">
                      {formatWhen(event.atMs)} · {event.type} · {event.actorEmail || 'sistema'}
                      {event.userMessage ? <span className="mt-1 block text-amber-100">Usuario: {event.userMessage}</span> : null}
                      {event.internalNote ? <span className="mt-1 block text-zinc-500">Interna: {event.internalNote}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <label className="block text-xs font-semibold text-zinc-400">
              Motivo para el usuario
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                className="mt-1 min-h-20 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                placeholder="Ej. El reverso del documento está borroso. Reemplaza únicamente esa imagen."
              />
            </label>
            <label className="block text-xs font-semibold text-zinc-400">
              Nota interna (no se muestra al usuario)
              <textarea
                value={internalNote}
                onChange={(event) => setInternalNote(event.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {detail.files.map((file) => (
                <label key={file.id} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/5 px-3 text-xs text-zinc-200">
                  <input
                    type="checkbox"
                    checked={slots.includes(file.slot)}
                    onChange={(event) => {
                      setSlots((prev) =>
                        event.target.checked ? [...prev, file.slot] : prev.filter((slot) => slot !== file.slot),
                      );
                    }}
                  />
                  Corregir {SLOT_LABELS[file.slot] || file.slot}
                </label>
              ))}
            </div>
            {note ? <p className="text-sm text-cyan-200">{note}</p> : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide('approve')}
                className="min-h-11 rounded-full bg-emerald-500 px-4 text-sm font-bold text-zinc-950 disabled:opacity-50"
              >
                Aprobar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide('correct')}
                className="min-h-11 rounded-full border border-amber-400/40 px-4 text-sm text-amber-100 disabled:opacity-50"
              >
                Pedir corrección
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide('reject')}
                className="min-h-11 rounded-full border border-rose-400/40 px-4 text-sm text-rose-100 disabled:opacity-50"
              >
                Rechazar
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
