import { Archive, FileDown, Loader2, Trash2, X } from 'lucide-react';
import { useState } from 'react';

type View = 'menu' | 'delete' | 'clear' | 'export';
type Busy = 'delete' | 'clear' | 'archive' | 'pdf' | 'both' | null;

export function ConversationActionsModal({
  handle,
  archived,
  onClose,
  onDelete,
  onClear,
  onArchive,
  onUnarchive,
  onPdf,
}: {
  handle: string;
  archived: boolean;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onClear: () => Promise<void>;
  onArchive: () => Promise<void>;
  onUnarchive: () => Promise<void>;
  onPdf: () => Promise<void>;
}) {
  const [view, setView] = useState<View>('menu');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: Busy, action: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
      onClose();
    } catch {
      setError('No se pudo completar la acción. Intenta nuevamente.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="lb-chat-manage-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lb-chat-manage-title"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div className="lb-chat-manage" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p id="lb-chat-manage-title" className="text-sm font-bold" style={{ color: 'var(--text-primary, #fff)' }}>
              {view === 'export' ? 'Archivar conversación' : 'Administrar conversación'}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted, #a1a1aa)' }}>
              @{handle}
            </p>
          </div>
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-lg"
            style={{ color: 'var(--text-muted, #a1a1aa)' }}
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {view === 'menu' ? (
          <div className="space-y-2">
            <button type="button" className="lb-chat-manage-option" onClick={() => setView('delete')}>
              <Trash2 size={16} className="text-rose-300" />
              <span>
                <strong>Borrar chat</strong>
                <em>Elimina toda la conversación.</em>
              </span>
            </button>
            <button type="button" className="lb-chat-manage-option" onClick={() => setView('clear')}>
              <span className="text-base">🧹</span>
              <span>
                <strong>Vaciar chat</strong>
                <em>Borra los mensajes, pero mantiene abierta la conversación.</em>
              </span>
            </button>
            <button type="button" className="lb-chat-manage-option" onClick={() => setView('export')}>
              <Archive size={16} className="text-cyan-300" />
              <span>
                <strong>Archivar / Exportar</strong>
                <em>Conserva el historial y permite crear una copia PDF.</em>
              </span>
            </button>
          </div>
        ) : null}

        {view === 'delete' ? (
          <div>
            <p className="text-sm font-semibold text-white">¿Eliminar completamente esta conversación?</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              Se eliminarán los mensajes y archivos de esta conversación para ambos participantes. Esta acción no se
              puede deshacer.
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" className="lb-chat-manage-btn" onClick={() => setView('menu')} disabled={Boolean(busy)}>
                Cancelar
              </button>
              <button
                type="button"
                className="lb-chat-manage-btn lb-chat-manage-btn--danger"
                disabled={Boolean(busy)}
                onClick={() => void run('delete', onDelete)}
              >
                {busy === 'delete' ? <Loader2 size={14} className="animate-spin" /> : null}
                {busy === 'delete' ? 'Eliminando…' : 'Eliminar conversación'}
              </button>
            </div>
          </div>
        ) : null}

        {view === 'clear' ? (
          <div>
            <p className="text-sm font-semibold text-white">¿Vaciar todos los mensajes de esta conversación?</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              La conversación seguirá disponible, pero su contenido actual desaparecerá para ambos participantes.
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" className="lb-chat-manage-btn" onClick={() => setView('menu')} disabled={Boolean(busy)}>
                Cancelar
              </button>
              <button
                type="button"
                className="lb-chat-manage-btn lb-chat-manage-btn--danger"
                disabled={Boolean(busy)}
                onClick={() => void run('clear', onClear)}
              >
                {busy === 'clear' ? <Loader2 size={14} className="animate-spin" /> : null}
                {busy === 'clear' ? 'Vaciando…' : 'Vaciar chat'}
              </button>
            </div>
          </div>
        ) : null}

        {view === 'export' ? (
          <div className="space-y-2">
            <button
              type="button"
              className="lb-chat-manage-option"
              disabled={Boolean(busy)}
              onClick={() => void run('archive', archived ? onUnarchive : onArchive)}
            >
              <Archive size={16} className="text-cyan-300" />
              <span>
                <strong>{archived ? 'Desarchivar chat' : 'Archivar chat'}</strong>
                <em>
                  {busy === 'archive'
                    ? archived
                      ? 'Desarchivando…'
                      : 'Archivando…'
                    : archived
                      ? 'Regresa a Todos.'
                      : 'Solo en tu lista de Archivados.'}
                </em>
              </span>
              {busy === 'archive' ? <Loader2 size={14} className="animate-spin" /> : null}
            </button>
            <button
              type="button"
              className="lb-chat-manage-option"
              disabled={Boolean(busy)}
              onClick={() => void run('pdf', onPdf)}
            >
              <FileDown size={16} className="text-violet-300" />
              <span>
                <strong>Crear PDF</strong>
                <em>{busy === 'pdf' ? 'Generando PDF…' : 'Copia privada de tu historial.'}</em>
              </span>
              {busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : null}
            </button>
            <button
              type="button"
              className="lb-chat-manage-option"
              disabled={Boolean(busy) || archived}
              onClick={() =>
                void run('both', async () => {
                  await onArchive();
                  await onPdf();
                })
              }
            >
              <FileDown size={16} className="text-fuchsia-300" />
              <span>
                <strong>Archivar + Crear PDF</strong>
                <em>{busy === 'both' ? 'Generando PDF…' : 'Archiva y descarga tu copia.'}</em>
              </span>
              {busy === 'both' ? <Loader2 size={14} className="animate-spin" /> : null}
            </button>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}

        {view === 'menu' || view === 'export' ? (
          <button type="button" className="lb-chat-manage-btn mt-4 w-full" onClick={onClose} disabled={Boolean(busy)}>
            Cancelar
          </button>
        ) : null}
      </div>
    </div>
  );
}
