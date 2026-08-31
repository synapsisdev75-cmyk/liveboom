import { useState } from 'react';
import { api, type CoinPackage } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';

type Props = {
  packages: CoinPackage[];
  onClose: () => void;
  onDone: () => void;
};

export function TopupModal({ packages, onClose, onDone }: Props) {
  const [selected, setSelected] = useState(packages.find((p) => p.popular)?.id ?? packages[0]?.id);
  const [busy, setBusy] = useState(false);
  const setToast = useUiStore((s) => s.setToast);

  async function pay() {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await api<{ mock: boolean; reference: string; checkoutUrl: string | null }>(
        '/api/wallet/checkout',
        { method: 'POST', body: JSON.stringify({ packageId: selected }) },
      );

      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }

      await api('/api/wallet/simulate', {
        method: 'POST',
        body: JSON.stringify({ reference: result.reference }),
      });
      await useAuthStore.getState().syncProfile();
      setToast('Recarga simulada (Wompi no configurado). En producción se abre el checkout.');
      window.setTimeout(() => setToast(null), 3200);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="lb-safe-sheet w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#131417] p-4 shadow-gift sm:rounded-3xl sm:p-6">
        <h2 className="text-lg font-bold text-white">Recargar blast</h2>
        <p className="mt-1 text-sm text-zinc-400">Elige un paquete de blast para recargar.</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3">
          {packages.map((pack) => (
            <button
              key={pack.id}
              type="button"
              onClick={() => setSelected(pack.id)}
              className={`min-h-11 rounded-2xl border p-3 text-left sm:p-4 ${
                selected === pack.id
                  ? 'border-boom-cyan bg-boom-cyan/10'
                  : 'border-white/10 bg-black/30'
              }`}
            >
              {pack.popular ? (
                <span className="text-[10px] font-bold uppercase tracking-wide text-boom-fuchsia">
                  Popular
                </span>
              ) : null}
              <p className="text-lg font-bold text-white sm:text-xl">
                {pack.coins.toLocaleString('es-ES')}
              </p>
              <p className="text-xs text-zinc-400">blast</p>
            </button>
          ))}
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl px-4 py-2 text-sm text-zinc-400"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void pay()}
            className="min-h-11 rounded-xl bg-boom-cyan px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-60"
          >
            {busy ? 'Procesando…' : 'Pagar con Wompi'}
          </button>
        </div>
      </div>
    </div>
  );
}
