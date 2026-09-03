import { useState } from 'react';
import { api } from '../../lib/api';
import {
  COIN_PACKAGES,
  packageCopLabel,
  type CoinPackageId,
} from '../../lib/coinPackages';
import { setFirestoreCoins } from '../../lib/profileFirestore';
import { openWompiWidget, type WompiOrder } from '../../lib/wompiWidget';
import { useAuthStore } from '../../store/authStore';
import { PaymentMethodsStrip } from './PaymentMethodsStrip';

type Props = {
  onClose: () => void;
  initialPackageId?: CoinPackageId;
};

const DEFAULT_PACK: CoinPackageId = 'popular_200';

function packBadge(pack: (typeof COIN_PACKAGES)[number]) {
  if (pack.popular) return 'Popular';
  if (pack.bestValue) return 'Mejor valor';
  return pack.name;
}

export function CoinPackagesModal({ onClose, initialPackageId }: Props) {
  const syncProfile = useAuthStore((state) => state.syncProfile);
  const currentCoins = useAuthStore((state) => state.profile?.coinsBalance ?? 0);
  const [selected, setSelected] = useState<CoinPackageId>(
    initialPackageId && COIN_PACKAGES.some((p) => p.id === initialPackageId)
      ? initialPackageId
      : DEFAULT_PACK,
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function applyTopup(paid: { coinsBalance?: number; coins?: number }) {
    const store = useAuthStore.getState();
    const fromApi = Number(paid.coinsBalance);
    if (!Number.isFinite(fromApi)) return store.profile?.coinsBalance ?? 0;
    store.setCoins(fromApi);
    const uid = store.profile?.firebaseUid;
    if (uid) {
      void setFirestoreCoins(uid, fromApi).catch(() => undefined);
    }
    return fromApi;
  }

  async function pay() {
    setBusy(true);
    setNote(null);
    try {
      const order = await api<WompiOrder>('/api/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({ packageId: selected }),
      });

      if (order.checkoutUrl && (order.preferCheckout || !order.widgetAvailable)) {
        setNote('Redirigiendo al checkout seguro de Wompi…');
        window.location.href = order.checkoutUrl;
        return;
      }

      if (!order.widgetAvailable) {
        setNote('Wompi no reconoce la llave pública. Revisa las credenciales en el dashboard.');
        return;
      }

      try {
        openWompiWidget(order, (result) => {
          const status = result.transaction?.status;
          if (status === 'APPROVED') {
            void api<{ coinsBalance: number; coins?: number }>('/api/payments/complete-widget', {
              method: 'POST',
              body: JSON.stringify({ reference: order.reference }),
            })
              .then((paid) => {
                applyTopup(paid);
                void syncProfile();
              })
              .catch(() => {
                void syncProfile();
              });
            setNote('Pago aprobado. Tu blast ya está en la billetera.');
            return;
          }
          if (status === 'PENDING') {
            setNote('Pago en proceso. Wompi confirmará la recarga en breve.');
            return;
          }
          if (status) {
            setNote(
              `El pago quedó en estado ${status}. Si ves "firma inválida", revisa las llaves Wompi en Firebase.`,
            );
          }
        });
      } catch (widgetError) {
        if (order.checkoutUrl) {
          setNote('Abriendo checkout alternativo de Wompi…');
          window.location.href = order.checkoutUrl;
          return;
        }
        throw widgetError;
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'No se pudo crear el pedido');
    } finally {
      setBusy(false);
    }
  }

  const selectedPack = COIN_PACKAGES.find((pack) => pack.id === selected);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="lb-safe-sheet flex max-h-[92dvh] w-full max-w-4xl flex-col rounded-t-3xl border border-white/10 bg-zinc-950 shadow-[0_0_48px_rgba(0,240,255,0.12)] sm:rounded-3xl">
        <div className="shrink-0 border-b border-white/5 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white sm:text-xl">Recargar blast</h2>
              <p className="mt-1 text-sm text-zinc-400">
                El paquete se suma a tu saldo actual. Paga con Wompi sobre esta pantalla.
              </p>
              <p className="mt-2 text-sm text-cyan-300">
                Tienes {currentCoins.toLocaleString('es-CO')} blast
                {' → '}
                {(
                  currentCoins + (selectedPack?.coins ?? 0)
                ).toLocaleString('es-CO')}{' '}
                blast al recargar
              </p>
            </div>
            <button type="button" onClick={onClose} className="shrink-0 text-sm text-zinc-500 hover:text-white">
              Cerrar
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 sm:pt-4">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
            {COIN_PACKAGES.map((pack) => {
              const isSelected = selected === pack.id;
              const highlight = pack.popular || pack.bestValue;
              return (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => setSelected(pack.id)}
                  className={`relative rounded-2xl border p-3 text-left transition sm:p-3.5 ${
                    highlight
                      ? 'border-cyan-400/60 bg-cyan-400/10'
                      : isSelected
                        ? 'border-fuchsia-400 bg-fuchsia-500/10 ring-1 ring-fuchsia-400/40'
                        : 'border-white/10 bg-zinc-900 hover:border-white/25'
                  } ${isSelected && highlight ? 'ring-2 ring-cyan-300/70' : ''}`}
                >
                  {(pack.popular || pack.bestValue) && (
                    <span className="absolute left-2 top-2 rounded bg-gradient-to-r from-fuchsia-500 to-violet-500 px-1 py-0.5 text-[7px] font-black uppercase text-white">
                      {pack.popular ? 'Popular' : 'Mejor valor'}
                    </span>
                  )}
                  <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">
                    {packBadge(pack)}
                  </span>
                  <div className="mt-2 grid h-14 place-items-center sm:h-16">
                    <img
                      src={pack.artUrl}
                      alt=""
                      width={64}
                      height={64}
                      draggable={false}
                      className="h-14 w-14 object-contain sm:h-16 sm:w-16"
                    />
                  </div>
                  <p className="mt-1 text-lg font-black text-white sm:text-xl">
                    {pack.coins.toLocaleString('es-CO')}
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">blast</p>
                  <p className="mt-1 text-[11px] font-bold text-zinc-300">
                    {packageCopLabel(pack.amountInCop)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 border-t border-white/5 p-4 sm:p-6">
          <PaymentMethodsStrip compact className="mb-3" />
          {note ? (
            <p
              className={`mb-4 text-sm ${
                note.includes('aprobado') || note.includes('acreditada') ? 'text-emerald-400' : 'text-fuchsia-400'
              }`}
            >
              {note}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 pb-[env(safe-area-inset-bottom)] sm:flex-row sm:justify-end sm:pb-0">
            <button
              type="button"
              disabled={busy}
              onClick={() => void pay()}
              className="w-full rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-6 py-3 font-bold text-white shadow-[0_0_15px_rgba(0,240,255,0.5)] transition-transform hover:scale-105 disabled:opacity-60 sm:w-auto sm:py-2"
            >
              {busy ? 'Abriendo Wompi…' : `Pagar ${selectedPack ? packageCopLabel(selectedPack.amountInCop) : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
