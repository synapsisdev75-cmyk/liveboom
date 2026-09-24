import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  listCoinPackages,
  packageCopLabel,
  type ResolvedCoinPackage,
} from '../../lib/coinPackages';
import { openWompiWidget, type WompiOrder } from '../../lib/wompiWidget';
import { confirmBlastPurchase } from '../../lib/blastPurchaseClient';
import {
  BLAST_RECHARGE_DECLINED,
  BLAST_RECHARGE_PENDING,
  BLAST_RECHARGE_PURCHASED_LABEL,
  BLAST_RECHARGE_SUCCESS_BODY,
  BLAST_RECHARGE_SUCCESS_TITLE,
  formatPurchasedBlast,
} from '../../lib/blastRechargeCopy';
import { fetchWalletSummary } from '../../lib/walletApi';
import {
  clearPendingBlastRecharge,
  markPendingBlastRecharge,
  watchPendingBlastRecharge,
} from '../../lib/pendingBlastRecharge';
import { isNativeApp, openWompiCheckoutUrl } from '../../lib/wompiCheckout';
import { useAuthStore } from '../../store/authStore';
import { useCatalogConfigStore } from '../../store/catalogConfigStore';
import { PaymentMethodsStrip } from './PaymentMethodsStrip';

type RechargeNote =
  | { kind: 'success'; coins?: number }
  | { kind: 'pending' }
  | { kind: 'declined' }
  | { kind: 'error'; text: string };

function RechargeStatus({ note }: { note: RechargeNote }) {
  if (note.kind === 'success') {
    return (
      <div className="mb-4 space-y-1 text-sm text-emerald-300">
        <p className="font-bold">{BLAST_RECHARGE_SUCCESS_TITLE}</p>
        <p>{BLAST_RECHARGE_SUCCESS_BODY}</p>
        {note.coins ? (
          <p className="font-semibold text-white">
            {BLAST_RECHARGE_PURCHASED_LABEL} {formatPurchasedBlast(note.coins)}
          </p>
        ) : null}
      </div>
    );
  }
  if (note.kind === 'pending') {
    return <p className="mb-4 text-sm text-emerald-400">{BLAST_RECHARGE_PENDING}</p>;
  }
  if (note.kind === 'declined') {
    return <p className="mb-4 text-sm text-fuchsia-400">{BLAST_RECHARGE_DECLINED}</p>;
  }
  return <p className="mb-4 text-sm text-fuchsia-400">{note.text}</p>;
}

type Props = {
  onClose: () => void;
  initialPackageId?: string;
};

const DEFAULT_PACK = 'popular_200';

function packBadge(pack: ResolvedCoinPackage) {
  if (pack.popular) return 'Popular';
  if (pack.bestValue) return 'Mejor valor';
  return pack.name;
}

export function CoinPackagesModal({ onClose, initialPackageId }: Props) {
  const syncProfile = useAuthStore((state) => state.syncProfile);
  const currentCoins = useAuthStore((state) => state.profile?.coinsBalance ?? 0);
  const packsVersion = useCatalogConfigStore((s) => s.packsVersion);
  const packs = listCoinPackages();
  void packsVersion;
  const [selected, setSelected] = useState<string>(
    initialPackageId && packs.some((p) => p.id === initialPackageId)
      ? initialPackageId
      : DEFAULT_PACK,
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<RechargeNote | null>(null);

  useEffect(() => {
    const onCredited = (event: Event) => {
      const detail = (event as CustomEvent<{ coins?: number }>).detail;
      setNote({ kind: 'success', coins: Math.max(0, Math.floor(Number(detail?.coins) || 0)) });
      void syncProfile();
    };
    const onDeclined = () => setNote({ kind: 'declined' });
    window.addEventListener('liveboom:recharge-credited', onCredited);
    window.addEventListener('liveboom:recharge-declined', onDeclined);
    watchPendingBlastRecharge({
      onCredited: (coins) => setNote({ kind: 'success', coins }),
      onPending: () => setNote((prev) => (prev?.kind === 'success' ? prev : { kind: 'pending' })),
      onDeclined: () => setNote({ kind: 'declined' }),
    });
    return () => {
      window.removeEventListener('liveboom:recharge-credited', onCredited);
      window.removeEventListener('liveboom:recharge-declined', onDeclined);
    };
  }, [syncProfile]);

  function applyWalletSummary() {
    void fetchWalletSummary()
      .then((summary) => {
        useAuthStore.getState().setBlastBalances({
          purchasedBlastBalance: summary.purchasedBalance,
          earnedBlastBalance: summary.earnedAvailable,
          coinsBalance: summary.totalAvailable,
        });
      })
      .catch(() => undefined);
  }

  function beginPendingWatch(reference: string) {
    markPendingBlastRecharge(reference);
    setNote({ kind: 'pending' });
    watchPendingBlastRecharge({
      onCredited: (coins) => {
        setNote({ kind: 'success', coins });
        void applyWalletSummary();
      },
      onPending: () => setNote((prev) => (prev?.kind === 'success' ? prev : { kind: 'pending' })),
      onDeclined: () => setNote({ kind: 'declined' }),
    });
  }

  function applyTopup(paid: {
    coinsBalance?: number;
    coins?: number;
    purchasedBlastBalance?: number;
    earnedBlastBalance?: number;
  }) {
    const store = useAuthStore.getState();
    if (paid.purchasedBlastBalance != null || paid.earnedBlastBalance != null) {
      store.setBlastBalances({
        purchasedBlastBalance: Number(paid.purchasedBlastBalance) || 0,
        earnedBlastBalance: Number(paid.earnedBlastBalance) || 0,
        coinsBalance: Number(paid.coinsBalance) || 0,
      });
      return store.profile?.coinsBalance ?? 0;
    }
    const fromApi = Number(paid.coinsBalance);
    if (!Number.isFinite(fromApi)) return store.profile?.coinsBalance ?? 0;
    const earned = Math.max(0, Math.floor(Number(store.profile?.earnedBlastBalance) || 0));
    store.setBlastBalances({
      purchasedBlastBalance: Math.max(0, fromApi - earned),
      earnedBlastBalance: earned,
      coinsBalance: fromApi,
    });
    return fromApi;
  }

  async function openHostedCheckout(order: WompiOrder) {
    beginPendingWatch(order.reference);
    setNote({
      kind: 'error',
      text: isNativeApp()
        ? 'Abriendo checkout seguro de Wompi… Al terminar, vuelve a LiveBoom; tu BLAST se acredita solo.'
        : 'Redirigiendo al checkout seguro de Wompi…',
    });
    const mode = await openWompiCheckoutUrl(String(order.checkoutUrl));
    if (mode === 'external') {
      setNote({ kind: 'pending' });
    }
  }

  async function pay() {
    setBusy(true);
    setNote(null);
    try {
      const order = await api<WompiOrder>('/api/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({ packageId: selected }),
        timeoutMs: 45_000,
      });

      // Capacitor: Custom Tabs conserva la sesión Firebase. Nequi/PSE no rompen el WebView.
      if (isNativeApp() && order.checkoutUrl) {
        await openHostedCheckout(order);
        return;
      }

      if (order.checkoutUrl && (order.preferCheckout || !order.widgetAvailable)) {
        await openHostedCheckout(order);
        return;
      }

      if (!order.widgetAvailable) {
        setNote({
          kind: 'error',
          text: 'Wompi no reconoce la llave pública. Revisa las credenciales en el dashboard.',
        });
        return;
      }

      try {
        openWompiWidget(order, (result) => {
          const txn =
            result.transaction ||
            result.data?.transaction ||
            (result.id && result.status ? { id: result.id, status: result.status } : null);
          const status = String(txn?.status || '').toUpperCase();
          const txnId = String(txn?.id || '').trim();
          if (status === 'APPROVED') {
            if (txnId) {
              void confirmBlastPurchase({
                transactionId: txnId,
                reference: order.reference,
                path: '/api/payments/reconcile',
              })
                .then((paid) => {
                  if (paid.pending) {
                    beginPendingWatch(order.reference);
                    return;
                  }
                  clearPendingBlastRecharge();
                  applyTopup(paid);
                  const credited = Math.max(
                    0,
                    Math.floor(Number(paid.coins) || Number(order.coins) || 0),
                  );
                  setNote({ kind: 'success', coins: credited });
                  void applyWalletSummary();
                })
                .catch((error) => {
                  const msg = error instanceof Error ? error.message : '';
                  if (/declinado|DECLINED|no fue aprobado/i.test(msg)) {
                    clearPendingBlastRecharge();
                    setNote({ kind: 'declined' });
                    return;
                  }
                  beginPendingWatch(order.reference);
                });
            } else {
              beginPendingWatch(order.reference);
            }
            return;
          }
          if (status === 'PENDING') {
            beginPendingWatch(order.reference);
            return;
          }
          if (status === 'DECLINED' || status) {
            clearPendingBlastRecharge();
            setNote({ kind: 'declined' });
          }
        });
      } catch (widgetError) {
        if (order.checkoutUrl) {
          await openHostedCheckout(order);
          return;
        }
        throw widgetError;
      }
    } catch (error) {
      setNote({
        kind: 'error',
        text: error instanceof Error ? error.message : 'No se pudo crear el pedido',
      });
    } finally {
      setBusy(false);
    }
  }

  const selectedPack = packs.find((pack) => pack.id === selected);

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
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
            {packs.map((pack) => {
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
          {note ? <RechargeStatus note={note} /> : null}

          <div className="flex flex-col gap-2 pb-[env(safe-area-inset-bottom)] sm:flex-row sm:justify-end sm:pb-0">
            <button
              type="button"
              disabled={busy}
              onClick={() => void pay()}
              className="w-full rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-6 py-3 font-bold text-white shadow-[0_0_15px_rgba(0,240,255,0.5)] transition-transform hover:scale-105 disabled:opacity-60 sm:w-auto sm:py-2"
            >
              {busy ? 'Abriendo Wompi…' : 'Recargar BLAST'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
