import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

const CONFIRM_WORD = 'ELIMINAR';

export function DeleteAccountSection() {
  const deleteAccount = useAuthStore((state) => state.deleteAccount);
  const busy = useAuthStore((state) => state.busy);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleDelete() {
    if (confirm.trim().toUpperCase() !== CONFIRM_WORD) {
      setError(`Escribe ${CONFIRM_WORD} para confirmar.`);
      return;
    }
    setError(null);
    try {
      await deleteAccount();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la cuenta.');
    }
  }

  return (
    <section className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-fuchsia-300" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-white">Eliminar cuenta</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Se borrarán tu perfil, publicaciones, amistades y mensajes. Esta acción no se puede deshacer.
          </p>
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-3 rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 px-4 py-2 text-xs font-semibold text-fuchsia-200 transition hover:bg-fuchsia-500/20"
            >
              Eliminar mi cuenta
            </button>
          ) : (
            <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-zinc-950/80 p-3">
              <p className="text-xs text-zinc-300">
                Para confirmar, escribe <span className="font-bold text-white">{CONFIRM_WORD}</span> abajo:
              </p>
              <input
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder={CONFIRM_WORD}
                className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600"
              />
              {error ? <p className="text-xs text-fuchsia-300">{error}</p> : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDelete()}
                  className="rounded-lg bg-fuchsia-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {busy ? 'Eliminando…' : 'Confirmar eliminación'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setConfirm('');
                    setError(null);
                  }}
                  className="rounded-lg border border-white/10 px-4 py-2 text-xs text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
