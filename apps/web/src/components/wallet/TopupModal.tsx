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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#131417] p-6 shadow-gift">
        <h2 className="text-lg font-bold text-white">Recargar coins</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Pagos con Wompi (cuenta empresarial). Montos en COP.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {packages.map((pack) => (
            <button
              key={pack.id}
              type="button"
              onClick={() => setSelected(pack.id)}
              className={`rounded-2xl border p-4 text-left ${
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
              <p className="text-xl font-bold text-white">{pack.coins.toLocaleString('es-ES')}</p>
              <p className="text-xs text-zinc-400">
                ${(pack.amountCents / 100).toLocaleString('es-CO')} COP
              </p>
            </button>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-zinc-400">
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void pay()}
            className="rounded-xl bg-boom-cyan px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-60"
          >
            {busy ? 'Procesando…' : 'Pagar con Wompi'}
          </button>
        </div>
      </div>
    </div>
  );
}
