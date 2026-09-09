import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import { useAuthStore } from '../../store/authStore';

export function DeleteAccountSection() {
  const t = useT();
  const deleteAccount = useAuthStore((state) => state.deleteAccount);
  const busy = useAuthStore((state) => state.busy);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const confirmWord = t('settings.confirmDeleteWord');

  async function handleDelete() {
    if (confirm.trim().toUpperCase() !== confirmWord.toUpperCase()) {
      setError(t('settings.confirmDeleteError', { word: confirmWord }));
      return;
    }
    setError(null);
    try {
      await deleteAccount();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.deleteFailed'));
    }
  }

  return (
    <section className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-fuchsia-300" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-white">{t('settings.deleteAccount')}</h2>
          <p className="mt-1 text-xs text-zinc-400">
            {t('settings.deleteAccountHint')} {t('settings.deleteAccountSub')}
          </p>
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-3 rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 px-4 py-2 text-xs font-semibold text-fuchsia-200 transition hover:bg-fuchsia-500/20"
            >
              {t('settings.deleteMyAccount')}
            </button>
          ) : (
            <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-zinc-950/80 p-3">
              <p className="text-xs text-zinc-300">
                {t('settings.confirmDeleteHint', { word: confirmWord })}
              </p>
              <input
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder={confirmWord}
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
                  {busy ? t('settings.deleting') : t('settings.confirmDeletion')}
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
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
