import { Smartphone } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchGiftStackedAlphaStatus,
  runGiftStackedAlpha,
  type GiftStackedAlphaStatus,
} from '../../lib/giftMediaApi';

/**
 * Estado de la versión iPhone de los regalos. El servidor la genera solo en segundo plano;
 * el botón reintenta los fallidos y adelanta una tanda.
 */
export function GiftStackedAlphaPanel() {
  const [status, setStatus] = useState<GiftStackedAlphaStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchGiftStackedAlphaStatus());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el estado');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pending = status?.pending ?? 0;
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [pending, refresh]);

  async function run() {
    setBusy(true);
    setError('');
    try {
      setStatus(await runGiftStackedAlpha());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar la versión iPhone');
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  const done = status && status.total > 0 && status.pending === 0;

  return (
    <div className="lb-panel flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm">
      <Smartphone size={18} className="shrink-0 text-cyan-300" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white">Versión iPhone / Safari (sin fondo)</p>
        <p className="text-xs text-zinc-400">
          {status
            ? done
              ? `Lista para los ${status.total} regalos.`
              : `${status.ready} de ${status.total} listas · ${status.pending} en proceso (el servidor las genera solo).`
            : 'Consultando…'}
        </p>
        {status?.failed.length ? (
          <p className="mt-1 text-xs text-amber-300">
            Con error: {status.failed.map((f) => f.name).join(', ')}
          </p>
        ) : null}
        {error ? <p className="mt-1 text-xs text-rose-400">{error}</p> : null}
      </div>
      <button
        type="button"
        disabled={busy || Boolean(done)}
        onClick={() => void run()}
        className="min-h-11 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50"
      >
        {busy ? 'Generando…' : done ? 'Todo listo' : 'Generar versión iPhone'}
      </button>
    </div>
  );
}
