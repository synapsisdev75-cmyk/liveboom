import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Gem,
  Gift,
  History,
  Shield,
  Zap,
} from 'lucide-react';
import {
  listCoinPackages,
  formatCop,
  packageCopLabel,
  type ResolvedCoinPackage,
} from '../lib/coinPackages';
import { api } from '../lib/api';
import { normalizeBlastBalances } from '../lib/blastBalances';
import {
  fetchWalletSummary,
  fetchWalletTransactions,
  ledgerLabel,
  signedAmount,
  type WalletLedgerRow,
  type WalletSummary,
} from '../lib/walletApi';
import { processGiftInbox } from '../lib/giftsFirestore';
import { CoinPackagesModal } from '../components/wallet/CoinPackagesModal';
import { PaymentMethodsStrip } from '../components/wallet/PaymentMethodsStrip';
import { WithdrawModal } from '../components/wallet/WithdrawModal';
import { useAuthStore } from '../store/authStore';
import { useCatalogConfigStore } from '../store/catalogConfigStore';
import { useT } from '../i18n';

const GRADIENT = 'bg-[linear-gradient(to_right,#EC4899,#06B6D4)]';

function packageBadge(pack: ResolvedCoinPackage) {
  if (pack.popular) return 'POPULAR';
  if (pack.bestValue) return 'MEJOR VALOR';
  return null;
}

function BlastArt({ artUrl, blast }: { artUrl: string; blast: number }) {
  return (
    <div className="relative mx-auto grid h-[4.25rem] w-[4.25rem] place-items-center sm:h-[4.75rem] sm:w-[4.75rem]">
      <img
        src={artUrl}
        alt=""
        width={76}
        height={76}
        draggable={false}
        className="relative h-full w-full object-contain drop-shadow-[0_6px_16px_rgba(236,72,153,0.35)]"
      />
      <span className="sr-only">{blast} blast</span>
    </div>
  );
}

export function WalletView() {
  const t = useT();
  const profile = useAuthStore((state) => state.profile);
  const error = useAuthStore((state) => state.error);
  const packsVersion = useCatalogConfigStore((s) => s.packsVersion);
  const coinPackages = listCoinPackages();
  void packsVersion;
  const [openTopup, setOpenTopup] = useState(false);
  const [initialPack, setInitialPack] = useState<string | undefined>();
  const [openWithdraw, setOpenWithdraw] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'recharge' | 'earning' | 'spend' | 'withdrawal'>('all');
  const [ledger, setLedger] = useState<WalletLedgerRow[]>([]);
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const packsRef = useRef<HTMLDivElement>(null);

  async function refreshWallet() {
    try {
      const summary = await fetchWalletSummary();
      setWalletSummary(summary);
      useAuthStore.getState().setBlastBalances({
        purchasedBlastBalance: summary.purchasedBalance,
        earnedBlastBalance: summary.earnedAvailable,
        coinsBalance: summary.totalAvailable,
      });
    } catch {
      /* el perfil Firestore sigue como respaldo visual */
    }
  }

  async function refreshHistory(filter = historyFilter) {
    try {
      const rows = await fetchWalletTransactions(filter);
      setLedger(rows);
    } catch {
      setLedger([]);
    }
  }

  useEffect(() => {
    if (profile) {
      void refreshWallet();
      if (showHistory) void refreshHistory();
    }
  }, [profile?.firebaseUid]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const transactionId = params.get('id');
    if (!transactionId || !profile) return;

    let cancelled = false;
    void (async () => {
      try {
        const paid = await api<{
          coinsBalance: number;
          coins?: number;
          purchasedBlastBalance?: number;
          earnedBlastBalance?: number;
        }>('/api/payments/complete-redirect', {
          method: 'POST',
          body: JSON.stringify({ transactionId }),
        });
        if (cancelled) return;
        const store = useAuthStore.getState();
        if (
          paid.purchasedBlastBalance != null ||
          paid.earnedBlastBalance != null
        ) {
          store.setBlastBalances({
            purchasedBlastBalance: Number(paid.purchasedBlastBalance) || 0,
            earnedBlastBalance: Number(paid.earnedBlastBalance) || 0,
            coinsBalance: Number(paid.coinsBalance) || 0,
          });
        } else {
          const fromApi = Number(paid.coinsBalance);
          if (Number.isFinite(fromApi)) {
            store.setCoins(fromApi);
          }
        }
        await store.syncProfile();
        await refreshWallet();
      } catch {
        /* webhook puede acreditar después */
      } finally {
        if (!cancelled) {
          const url = new URL(window.location.href);
          url.searchParams.delete('id');
          window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile?.firebaseUid]);

  useEffect(() => {
    if (!profile?.firebaseUid) return;
    let cancelled = false;
    const pull = async () => {
      try {
        await processGiftInbox(profile.firebaseUid);
        if (!cancelled) await useAuthStore.getState().syncProfile();
        if (!cancelled) await refreshWallet();
      } catch {
        /* ignore */
      }
    };
    void pull();
    // Reintento corto: el crédito de llamada puede llegar milisegundos después de abrir billetera.
    const t1 = window.setTimeout(() => {
      if (!cancelled) void pull();
    }, 600);
    const t2 = window.setTimeout(() => {
      if (!cancelled) void pull();
    }, 1800);
    const onVis = () => {
      if (document.visibilityState === 'visible') void pull();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [profile?.firebaseUid]);

  const fallback = normalizeBlastBalances({
    coinsBalance: profile?.coinsBalance,
    purchasedBlastBalance: profile?.purchasedBlastBalance,
    earnedBlastBalance: profile?.earnedBlastBalance,
    earnedBlastSpent: profile?.earnedBlastSpent,
    earnedBlastWithdrawn: profile?.earnedBlastWithdrawn,
  });
  const purchased = walletSummary?.purchasedBalance ?? fallback.purchasedBlastBalance;
  const earned = walletSummary?.earnedAvailable ?? fallback.earnedBlastBalance;
  const balance = walletSummary?.totalAvailable ?? fallback.totalBlastBalance;

  function openBuy(packageId?: string) {
    setInitialPack(packageId);
    setOpenTopup(true);
  }

  function scrollPacks(direction: 'left' | 'right') {
    packsRef.current?.scrollBy({
      left: direction === 'right' ? 220 : -220,
      behavior: 'smooth',
    });
  }

  return (
    <div className="lb-page mx-auto flex w-full max-w-4xl flex-col gap-5 pb-2 sm:gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400">
            {t('nav.walletShort')}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{t('wallet.title')}</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowHistory((v) => {
              const next = !v;
              if (next) void refreshHistory();
              return next;
            });
            void refreshWallet();
          }}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-[#14151c] px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-white/20 hover:text-white sm:px-3.5"
        >
          <History size={14} />
          <span className="sm:hidden">Historial</span>
          <span className="hidden sm:inline">Historial de transacciones</span>
        </button>
      </header>

      {profile ? (
        <>
          <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#12131a] p-4 sm:rounded-3xl sm:p-7">
            <video
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              src="/wallet/balance-loop.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              aria-hidden
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/30" />
            <div className="relative min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                Saldo total
              </p>
              <p className="mt-2 flex flex-wrap items-baseline gap-1.5 sm:gap-2">
                <span className="break-all text-4xl font-black tracking-tight text-[#00E5FF] drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] sm:text-5xl md:text-6xl">
                  {balance.toLocaleString('es-CO')}
                </span>
                <span className="text-lg font-semibold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)] sm:text-xl">
                  blast
                </span>
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
                <div className="min-w-0 rounded-xl border border-white/10 bg-black/35 px-2.5 py-2 backdrop-blur-sm sm:px-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400 sm:text-[11px]">
                    Comprados
                  </p>
                  <p className="mt-0.5 break-all text-sm font-bold tabular-nums text-white sm:text-base">
                    {purchased.toLocaleString('es-CO')} BLAST
                  </p>
                  <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">Recargas</p>
                </div>
                <div className="min-w-0 rounded-xl border border-emerald-400/25 bg-black/35 px-2.5 py-2 backdrop-blur-sm sm:px-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-300/90 sm:text-[11px]">
                    Ganados
                  </p>
                  <p className="mt-0.5 break-all text-sm font-bold tabular-nums text-emerald-200 sm:text-base">
                    {earned.toLocaleString('es-CO')} BLAST
                  </p>
                  <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">Regalos y llamadas</p>
                </div>
                <div className="min-w-0 rounded-xl border border-cyan-400/25 bg-black/35 px-2.5 py-2 backdrop-blur-sm sm:px-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-300/90 sm:text-[11px]">
                    Total
                  </p>
                  <p className="mt-0.5 break-all text-sm font-bold tabular-nums text-cyan-100 sm:text-base">
                    {balance.toLocaleString('es-CO')} BLAST
                  </p>
                  <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">Recargas + ganados</p>
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="button"
                  onClick={() => openBuy()}
                  className={`inline-flex h-11 w-full items-center justify-center rounded-full ${GRADIENT} px-6 text-sm font-bold text-white shadow-[0_6px_22px_rgba(236,72,153,0.3)] transition hover:brightness-110 sm:w-auto`}
                >
                  Recargar Blast
                </button>
                <button
                  type="button"
                  onClick={() => setOpenWithdraw(true)}
                  className="inline-flex h-11 w-full items-center justify-center rounded-full border-[1.5px] border-[#10B981] bg-black/35 px-6 text-sm font-bold text-[#10B981] backdrop-blur-sm transition hover:bg-[#10B981]/10 sm:w-auto"
                >
                  Retirar a COP
                </button>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-1 flex items-center gap-2">
              <Gem size={16} className="text-cyan-300" />
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-white">
                Comprar blast
              </h2>
            </div>
            <p className="mb-4 text-sm text-zinc-500">Elige el paquete que más te convenga</p>

            <div className="relative">
              <button
                type="button"
                aria-label="Paquetes anteriores"
                onClick={() => scrollPacks('left')}
                className="lb-wallet-carousel-nav absolute -left-1 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full md:grid"
              >
                <ChevronLeft size={18} />
              </button>
              <div
                ref={packsRef}
                className="gift-row flex snap-x snap-mandatory gap-3 overflow-x-auto px-0.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {coinPackages.map((pack) => {
                  const badge = packageBadge(pack);
                  return (
                    <article
                      key={pack.id}
                      className="lb-card relative flex w-[9.25rem] shrink-0 snap-start flex-col rounded-2xl border border-white/[0.08] bg-[#14151c] p-3 sm:w-[10rem] sm:p-3.5"
                    >
                      {badge ? (
                        <span className="absolute left-2 top-2 rounded-md bg-gradient-to-r from-fuchsia-500 to-violet-500 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-white">
                          {badge}
                        </span>
                      ) : null}
                      <p className="mt-1 truncate text-center text-[10px] font-bold uppercase tracking-wide text-cyan-300/90">
                        {pack.name}
                      </p>
                      <div className="mt-1">
                        <BlastArt artUrl={pack.artUrl} blast={pack.coins} />
                      </div>
                      <p className="mt-1 text-center text-xl font-black text-white sm:text-2xl">
                        {pack.coins.toLocaleString('es-CO')}
                      </p>
                      <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        blast
                      </p>
                      <p className="mt-1.5 text-center text-[11px] font-bold text-white">
                        {packageCopLabel(pack.amountInCop)}
                      </p>
                      <button
                        type="button"
                        onClick={() => openBuy(pack.id)}
                        className={`mt-2.5 flex h-9 w-full items-center justify-center rounded-full ${GRADIENT} text-[11px] font-bold text-white transition hover:brightness-110`}
                      >
                        Comprar
                      </button>
                    </article>
                  );
                })}
              </div>
              <button
                type="button"
                aria-label="Ver más paquetes"
                onClick={() => scrollPacks('right')}
                className="lb-wallet-carousel-nav absolute -right-1 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full md:grid"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </section>

          <section className="lb-wallet-benefits rounded-2xl p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  {
                    icon: <Gift size={20} />,
                    title: 'Envía regalos',
                    desc: 'Apoya a tus creadores favoritos',
                  },
                  {
                    icon: <Zap size={20} />,
                    title: 'Destaca en el chat',
                    desc: 'Usa efectos y mensajes especiales',
                  },
                  {
                    icon: <Crown size={20} />,
                    title: 'Súbete al top',
                    desc: 'Consigue más visibilidad en los rankings',
                  },
                  {
                    icon: <Shield size={20} />,
                    title: 'Más beneficios',
                    desc: 'Accede a eventos y promociones exclusivas',
                  },
                ] as const
              ).map((item) => (
                <div key={item.title} className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0">{item.icon}</span>
                  <div>
                    <p className="lb-wallet-benefits__title text-sm font-bold">{item.title}</p>
                    <p className="lb-wallet-benefits__desc mt-0.5 text-[11px] leading-snug">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="lb-wallet-payments-title mb-3 text-[11px] font-bold uppercase tracking-[0.16em]">
              Métodos de pago aceptados
            </h2>
            <PaymentMethodsStrip />
            <p className="mt-2 text-[11px] text-zinc-600">
              Pagos procesados de forma segura con Wompi (PSE, tarjetas y billeteras).
            </p>
          </section>

          {showHistory ? (
            <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-4">
              <h2 className="text-sm font-semibold text-zinc-200">{t('wallet.transactions')}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    ['all', 'Todos'],
                    ['recharge', 'Recargas'],
                    ['earning', 'Ganancias'],
                    ['spend', 'Gastos'],
                    ['withdrawal', 'Retiros'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setHistoryFilter(id);
                      void refreshHistory(id);
                    }}
                    className={`min-h-10 rounded-full px-3.5 text-xs font-semibold ${
                      historyFilter === id
                        ? 'bg-cyan-500/20 text-cyan-200'
                        : 'bg-black/30 text-zinc-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {ledger.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">
                  Aún no hay movimientos en este filtro.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {ledger.slice(0, 40).map((item) => {
                    const signed = signedAmount(item);
                    const group = item.filterGroup === 'recharge'
                      ? 'RECARGAS'
                      : item.filterGroup === 'earning'
                        ? 'GANANCIAS'
                        : item.filterGroup === 'spend'
                          ? 'GASTOS'
                          : item.filterGroup === 'withdrawal'
                            ? 'RETIROS'
                            : 'MOVIMIENTO';
                    return (
                      <li
                        key={item.id}
                        className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2.5 text-sm"
                      >
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                            {group}
                          </p>
                          <p className="font-medium text-white">{ledgerLabel(item)}</p>
                          <p className="text-xs text-zinc-500">
                            {item.createdAtMs
                              ? new Date(item.createdAtMs).toLocaleString('es-CO')
                              : ''}
                          </p>
                        </div>
                        <span
                          className={
                            signed >= 0 ? 'font-bold text-emerald-400' : 'font-bold text-fuchsia-400'
                          }
                        >
                          {signed >= 0 ? '+' : ''}
                          {signed.toLocaleString('es-CO')} BLAST
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}
        </>
      ) : (
        <section className="rounded-3xl border border-white/[0.08] bg-[#12131a] p-8 text-center">
          <Gem className="mx-auto h-12 w-12 text-cyan-400/50" />
          <p className="mt-4 text-3xl font-extrabold text-cyan-300">— blast</p>
          <p className="mt-2 text-sm text-zinc-400">
            <Link to="/login" className="text-cyan-400 underline">
              Inicia sesión
            </Link>{' '}
            para sincronizar tu saldo y comprar blast.
          </p>
        </section>
      )}

      {error ? <p className="text-sm text-fuchsia-400">{error}</p> : null}

      {openTopup ? (
        <CoinPackagesModal
          initialPackageId={initialPack}
          onClose={() => {
            setOpenTopup(false);
            setInitialPack(undefined);
          }}
        />
      ) : null}
      {openWithdraw ? (
        <WithdrawModal
          onClose={() => setOpenWithdraw(false)}
          onDone={() => {
            setOpenWithdraw(false);
            void refreshWallet();
            void refreshHistory();
            setShowHistory(true);
          }}
        />
      ) : null}
    </div>
  );
}
