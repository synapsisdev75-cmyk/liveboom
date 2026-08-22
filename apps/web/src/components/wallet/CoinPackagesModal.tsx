import { useEffect, useState } from 'react';
import { api, apiPublic } from '../../lib/api';
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
  const [simulateAvailable, setSimulateAvailable] = useState(false);

  useEffect(() => {
    void apiPublic<{ simulateAvailable?: boolean; pairOk?: boolean }>('/api/payments/status')
      .then((data) => setSimulateAvailable(Boolean(data.simulateAvailable)))
      .catch(() => undefined);
  }, []);

  async function simulatePay() {
    setBusy(true);
    setNote(null);
    try {
      const paid = await api<{ coinsBalance: number }>('/api/payments/simulate-topup', {
        method: 'POST',
        body: JSON.stringify({ packageId: selected }),
      });
      useAuthStore.getState().setCoins(paid.coinsBalance);
      await syncProfile();
      setNote('Recarga de prueba acreditada (sin Wompi).');
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'No se pudo simular la recarga');
    } finally {
      setBusy(false);
    }
  }

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
          setNote(
            `El pago quedó en estado ${status}. Si ves "firma inválida", usa Recarga de prueba o revisa las llaves Wompi en Vercel.`,
          );
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
      className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-4 shadow-[0_0_48px_rgba(0,240,255,0.12)] sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white sm:text-xl">Recargar coins</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Elige un paquete. El pago se abre sobre esta pantalla con Wompi.
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-sm text-zinc-500 hover:text-white">
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

        <div className="mt-6 flex flex-col gap-2 pb-[env(safe-area-inset-bottom)] sm:flex-row sm:justify-end sm:pb-0">
          {simulateAvailable ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void simulatePay()}
              className="w-full rounded-full border border-cyan-400/40 px-6 py-3 text-sm font-semibold text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-60 sm:w-auto sm:py-2"
            >
              Recarga de prueba (sin Wompi)
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void pay()}
            className="w-full rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-6 py-3 font-bold text-white shadow-[0_0_15px_rgba(0,240,255,0.5)] transition-transform hover:scale-105 disabled:opacity-60 sm:w-auto sm:py-2"
          >
            {busy ? 'Abriendo Wompi…' : 'Pagar con Wompi'}
          </button>
        </div>
      </div>
    </div>
  );
}
