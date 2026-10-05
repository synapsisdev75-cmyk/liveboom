import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  onCancel: () => void;
  onConfirm: (closingLine: string) => void;
  busy?: boolean;
  error?: string | null;
};

export function EndLiveModal({ open, onCancel, onConfirm, busy, error }: Props) {
  const [line, setLine] = useState('');
  useEffect(() => {
    if (!open) setLine('');
  }, [open]);
  if (!open) return null;
  return (
    <div className="lb-live-studio-modal fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12131a] p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-live-title"
      >
        <h2 id="end-live-title" className="text-lg font-bold text-white">
          ¿Finalizar transmisión?
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          Tu LIVE terminará para todos los espectadores. Si quieres, déjales una frase.
        </p>
        <label className="mt-3 block">
          <span className="sr-only">Frase al cerrar</span>
          <input
            value={line}
            maxLength={140}
            disabled={busy}
            onChange={(event) => setLine(event.target.value.slice(0, 140))}
            placeholder="Una frase para quien estuvo aquí"
            className="min-h-11 w-full rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-white outline-none"
          />
        </label>
        {error ? <p className="mt-2 text-sm text-rose-400">{error}</p> : null}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/5 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(line.trim())}
            disabled={busy}
            className="min-h-11 flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-50"
          >
            {busy ? 'Finalizando…' : 'Finalizar LIVE'}
          </button>
        </div>
      </div>
    </div>
  );
}
