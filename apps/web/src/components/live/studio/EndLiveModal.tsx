type Props = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
};

export function EndLiveModal({ open, onCancel, onConfirm, busy }: Props) {
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
          Tu LIVE terminará para todos los espectadores.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/5 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-50"
          >
            {busy ? 'Finalizando…' : 'Finalizar LIVE'}
          </button>
        </div>
      </div>
    </div>
  );
}
