import { useState } from 'react';
import { api } from '../../lib/api';
import { COIN_PACKAGES, type CoinPackageId } from '../../lib/coinPackages';
import { openWompiWidget, type WompiOrder } from '../../lib/wompiWidget';
import { useAuthStore } from '../../store/authStore';

type Props = {
  onClose: () => void;
};

export function CoinPackagesModal({ onClose }: Props) {
  const syncProfile = useAuthStore((state) => state.syncProfile);
  const [selected, setSelected] = useState<CoinPackageId>('500_coins');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setNote(null);
    try {
      const order = await api<WompiOrder>('/api/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({ packageId: selected }),
      });
      openWompiWidget(order, (result) => {
        const status = result.transaction?.status;
        if (status === 'APPROVED') {
          void api<{ coinsBalance: number }>('/api/payments/complete-widget', {
            method: 'POST',
            body: JSON.stringify({ reference: order.reference }),
          })
            .then((paid) => {
              useAuthStore.getState().setCoins(paid.coinsBalance);
              void syncProfile();
            })
            .catch(() => {
              void syncProfile();
            });
          setNote('Pago aprobado. Tus coins ya están en la billetera.');
          return;
        }
        if (status === 'PENDING') {
          setNote('Pago en proceso. Wompi confirmará la recarga en breve.');
          return;
        }
        if (status) {
          setNote(`El pago quedó en estado ${status}.`);
        }
      });
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'No se pudo crear el pedido');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-zinc-950 p-6 shadow-[0_0_48px_rgba(0,240,255,0.12)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">Recargar coins</h2>
            <p className="mt-1 text-sm text-zinc-400">Elige un paquete. El pago se abre sobre esta pantalla con Wompi.</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-zinc-500 hover:text-white">
            Cerrar
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {COIN_PACKAGES.map((pack) => {
            const isSelected = selected === pack.id;
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => setSelected(pack.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  pack.popular
                    ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.22)]'
                    : isSelected
                      ? 'border-fuchsia-400 bg-fuchsia-500/10'
                      : 'border-white/10 bg-zinc-900 hover:border-white/25'
                } ${isSelected && pack.popular ? 'ring-2 ring-cyan-300/70' : ''}`}
              >
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide ${
                    pack.popular ? 'text-cyan-300' : 'text-zinc-500'
                  }`}
                >
                  {pack.popular ? 'Popular' : pack.id === '100_coins' ? 'Inicial' : 'Pro'}
                </span>
                <p className="mt-2 text-lg font-extrabold text-white">{pack.name}</p>
                <p className="mt-1 text-2xl font-black text-white">
                  {pack.coins.toLocaleString('es-CO')}{' '}
                  <span className="text-sm font-semibold text-zinc-400">Coins</span>
                </p>
                <p className="mt-2 text-sm font-semibold text-cyan-400">{pack.priceLabel}</p>
              </button>
            );
          })}
        </div>

        {note ? (
          <p
            className={`mt-4 text-sm ${
              note.startsWith('Pago') || note.includes('aprobado') ? 'text-emerald-400' : 'text-fuchsia-400'
            }`}
          >
            {note}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => void pay()}
            className="rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-6 py-2 font-bold text-white shadow-[0_0_15px_rgba(0,240,255,0.5)] transition-transform hover:scale-105 disabled:opacity-60"
          >
            {busy ? 'Abriendo Wompi…' : 'Pagar'}
          </button>
        </div>
      </div>
    </div>
  );
}
