import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  ClipboardCopy,
  Download,
  FileText,
  ImagePlus,
  Images,
  Loader2,
  Send,
  X,
} from 'lucide-react';
import {
  CHANGE_REQUEST_SECTIONS,
  createChangeRequest,
  downloadChangeRequestBundle,
  downloadChangeRequestImages,
  downloadPromptFile,
  formatChangeRequestForCursor,
  listenChangeRequests,
  sectionLabel,
  updateChangeRequestStatus,
  uploadChangeRequestImage,
  type AdminChangeRequest,
  type ChangeRequestStatus,
} from '../../lib/changeRequestsFirestore';
import { isOwnerEmail } from '../../lib/superAdmin';
import { useAuthStore } from '../../store/authStore';

type Filter = 'all' | ChangeRequestStatus;

const STATUS_LABEL: Record<ChangeRequestStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  applied: 'Aplicado',
};

const STATUS_CLASS: Record<ChangeRequestStatus, string> = {
  pending: 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30',
  approved: 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/30',
  rejected: 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/30',
  applied: 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30',
};

function formatWhen(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function AdminChangeRequestsPanel() {
  const profile = useAuthStore((s) => s.profile);
  const email = profile?.email ?? '';
  const uid = profile?.firebaseUid ?? '';
  const handle = profile?.handle ?? '';
  const owner = isOwnerEmail(email);

  const [rows, setRows] = useState<AdminChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  const [note, setNote] = useState<string | null>(null);

  const [section, setSection] = useState(CHANGE_REQUEST_SECTIONS[0]!.id);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dlBusyId, setDlBusyId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = listenChangeRequests(
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

  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
    // only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  function onPickImages(files: FileList | null) {
    if (!files?.length) return;
    const next: { file: File; url: string }[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      if (previews.length + next.length >= 6) break;
      next.push({ file, url: URL.createObjectURL(file) });
    }
    setPreviews((prev) => [...prev, ...next].slice(0, 6));
  }

  function removePreview(index: number) {
    setPreviews((prev) => {
      const row = prev[index];
      if (row) URL.revokeObjectURL(row.url);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!uid || !email) return;
    if (!prompt.trim()) {
      setNote('Escribe el prompt / qué quieres cambiar.');
      return;
    }
    setSubmitting(true);
    setNote(null);
    try {
      const imageUrls: string[] = [];
      for (const item of previews) {
        const url = await uploadChangeRequestImage(uid, item.file, item.file.type || 'image/jpeg');
        imageUrls.push(url);
      }
      await createChangeRequest({
        section,
        title: title.trim() || sectionLabel(section),
        prompt: prompt.trim(),
        imageUrls,
        createdByUid: uid,
        createdByEmail: email,
        createdByHandle: handle,
      });
      previews.forEach((p) => URL.revokeObjectURL(p.url));
      setPreviews([]);
      setTitle('');
      setPrompt('');
      setNote('Pedido enviado. El owner lo verá en la cola.');
      setFilter('pending');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo enviar el pedido');
    } finally {
      setSubmitting(false);
    }
  }

  async function setStatus(id: string, status: ChangeRequestStatus) {
    if (!owner) return;
    setBusyId(id);
    setNote(null);
    try {
      await updateChangeRequestStatus({
        id,
        status,
        reviewNote: reviewNotes[id] ?? '',
        reviewedByEmail: email,
      });
      setNote(`Marcado como ${STATUS_LABEL[status]}.`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo actualizar');
    } finally {
      setBusyId(null);
    }
  }

  async function copyForCursor(req: AdminChangeRequest) {
    try {
      await navigator.clipboard.writeText(formatChangeRequestForCursor(req));
      setNote('Copiado: pégalo aquí en Cursor (Ctrl+V).');
    } catch {
      setNote('No se pudo copiar al portapapeles.');
    }
  }

  async function copyPromptOnly(req: AdminChangeRequest) {
    try {
      await navigator.clipboard.writeText(req.prompt || '');
      setNote('Solo el prompt copiado.');
    } catch {
      setNote('No se pudo copiar el prompt.');
    }
  }

  async function downloadBundle(req: AdminChangeRequest) {
    setDlBusyId(req.id);
    setNote(null);
    try {
      const result = await downloadChangeRequestBundle(req);
      setNote(
        `Descargado: prompt.txt + ${result.images}/${req.imageUrls.length} imagen(es). Pega el .txt en Cursor y adjunta las fotos.`,
      );
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo descargar el paquete');
    } finally {
      setDlBusyId(null);
    }
  }

  async function downloadImagesOnly(req: AdminChangeRequest) {
    if (!req.imageUrls.length) {
      setNote('Este pedido no tiene imágenes.');
      return;
    }
    setDlBusyId(req.id);
    setNote(null);
    try {
      const n = await downloadChangeRequestImages(req);
      setNote(`Descargadas ${n}/${req.imageUrls.length} imágenes.`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudieron descargar las imágenes');
    } finally {
      setDlBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="lb-panel rounded-2xl p-4 sm:p-5">
        <h2 className="text-sm font-bold text-white">Nuevo pedido de cambio</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Elige la sección, describe el cambio (prompt) y sube capturas de referencia. El owner
          copia el pedido y lo aplica en Cursor (opción A).
        </p>
        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3">
          <label className="block space-y-1 text-xs text-zinc-400">
            Sección
            <select
              value={section}
              onChange={(e) => setSection(e.target.value as typeof section)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white"
            >
              {CHANGE_REQUEST_SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} — {s.hint}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-xs text-zinc-400">
            Título corto
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Ej. Botón recargar más visible en billetera"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600"
            />
          </label>
          <label className="block space-y-1 text-xs text-zinc-400">
            Prompt / instrucción
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              maxLength={8000}
              placeholder="Qué quieres cambiar, dónde está, cómo debería verse o comportarse…"
              className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600"
            />
          </label>
          <div>
            <p className="mb-2 text-xs text-zinc-400">Imágenes de referencia (hasta 6)</p>
            <div className="flex flex-wrap gap-2">
              {previews.map((p, i) => (
                <div key={p.url} className="relative h-20 w-20 overflow-hidden rounded-xl ring-1 ring-white/10">
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePreview(i)}
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white"
                    aria-label="Quitar imagen"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {previews.length < 6 ? (
                <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-xl border border-dashed border-zinc-600 text-zinc-400 hover:border-cyan-400/50 hover:text-cyan-300">
                  <ImagePlus size={22} />
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      onPickImages(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
              ) : null}
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting || !uid}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-4 py-2.5 text-sm font-bold text-zinc-950 disabled:opacity-50 sm:w-auto"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {submitting ? 'Enviando…' : 'Enviar pedido'}
          </button>
        </form>
      </section>

      {owner ? (
        <p className="rounded-xl border border-white/10 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
          Para dar acceso a otros supers usa la pestaña <span className="font-semibold text-fuchsia-300">Delegar</span>.
        </p>
      ) : null}

      <section className="lb-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-white">Cola de pedidos</h2>
            <p className="text-xs text-zinc-500">
              {pendingCount} pendiente{pendingCount === 1 ? '' : 's'}
              {owner
                ? ' · Usa “Pegar en Cursor” o “Descargar todo” (prompt.txt + imágenes) y pégalos aquí en el chat.'
                : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['pending', 'approved', 'applied', 'rejected', 'all'] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                  filter === id
                    ? 'bg-fuchsia-500/25 text-fuchsia-100 ring-1 ring-fuchsia-400/40'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {id === 'all' ? 'Todos' : STATUS_LABEL[id]}
              </button>
            ))}
          </div>
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
          <p className="mt-6 text-center text-sm text-zinc-500">Cargando pedidos…</p>
        ) : visible.length === 0 ? (
          <p className="mt-6 text-center text-sm text-zinc-500">No hay pedidos en este filtro.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {visible.map((req) => (
              <li
                key={req.id}
                className="rounded-2xl border border-white/10 bg-zinc-900/60 p-3 sm:p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CLASS[req.status]}`}>
                        {STATUS_LABEL[req.status]}
                      </span>
                      <span className="text-[11px] font-semibold text-cyan-300">
                        {sectionLabel(req.section)}
                      </span>
                    </div>
                    <h3 className="mt-1 text-sm font-bold text-white">{req.title}</h3>
                    <p className="text-[11px] text-zinc-500">
                      @{req.createdByHandle || '—'} · {req.createdByEmail} · {formatWhen(req.createdAt)}
                    </p>
                  </div>
                  <div className="flex max-w-full flex-wrap justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => void copyForCursor(req)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-500/90 to-cyan-400/90 px-3 text-xs font-bold text-zinc-950"
                      title="Copia prompt + URLs de imágenes para pegar en Cursor"
                    >
                      <ClipboardCopy size={14} />
                      Pegar en Cursor
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyPromptOnly(req)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15"
                    >
                      <FileText size={14} />
                      Copiar prompt
                    </button>
                    {owner ? (
                      <>
                        <button
                          type="button"
                          disabled={dlBusyId === req.id}
                          onClick={() => {
                            downloadPromptFile(req);
                            setNote('Descargado prompt.txt');
                          }}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-50"
                        >
                          <Download size={14} />
                          .txt
                        </button>
                        {req.imageUrls.length ? (
                          <button
                            type="button"
                            disabled={dlBusyId === req.id}
                            onClick={() => void downloadImagesOnly(req)}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-50"
                          >
                            {dlBusyId === req.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Images size={14} />
                            )}
                            Imágenes
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={dlBusyId === req.id}
                          onClick={() => void downloadBundle(req)}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-cyan-500/20 px-3 text-xs font-semibold text-cyan-100 ring-1 ring-cyan-400/30 disabled:opacity-50"
                        >
                          {dlBusyId === req.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Download size={14} />
                          )}
                          Descargar todo
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{req.prompt}</p>
                {req.imageUrls.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {req.imageUrls.map((url, idx) => (
                      <div key={url} className="relative">
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="block h-24 w-24 overflow-hidden rounded-xl ring-1 ring-white/10"
                        >
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        </a>
                        {owner ? (
                          <a
                            href={url}
                            download={`pedido-img-${idx + 1}`}
                            target="_blank"
                            rel="noreferrer"
                            className="absolute bottom-1 right-1 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white"
                            title="Abrir / guardar imagen"
                          >
                            <Download size={12} />
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {owner ? (
                  <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
                    <input
                      value={reviewNotes[req.id] ?? req.reviewNote}
                      onChange={(e) =>
                        setReviewNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                      }
                      placeholder="Nota de revisión (opcional)"
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyId === req.id}
                        onClick={() => void setStatus(req.id, 'approved')}
                        className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-cyan-500/20 px-3 text-xs font-semibold text-cyan-100 ring-1 ring-cyan-400/30 disabled:opacity-50"
                      >
                        <Check size={14} /> Aprobar
                      </button>
                      <button
                        type="button"
                        disabled={busyId === req.id}
                        onClick={() => void setStatus(req.id, 'applied')}
                        className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-emerald-500/20 px-3 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-400/30 disabled:opacity-50"
                      >
                        Aplicado
                      </button>
                      <button
                        type="button"
                        disabled={busyId === req.id}
                        onClick={() => void setStatus(req.id, 'rejected')}
                        className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-rose-500/20 px-3 text-xs font-semibold text-rose-100 ring-1 ring-rose-400/30 disabled:opacity-50"
                      >
                        Rechazar
                      </button>
                      {req.status !== 'pending' ? (
                        <button
                          type="button"
                          disabled={busyId === req.id}
                          onClick={() => void setStatus(req.id, 'pending')}
                          className="inline-flex min-h-10 items-center rounded-xl bg-zinc-800 px-3 text-xs font-semibold text-zinc-300 disabled:opacity-50"
                        >
                          Volver a pendiente
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : req.reviewNote ? (
                  <p className="mt-3 text-xs text-zinc-500">Nota owner: {req.reviewNote}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
