import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Gem,
  Gift,
  History,
  Info,
  Shield,
  Zap,
} from 'lucide-react';
import {
  COIN_PACKAGES,
  coinsToCop,
  formatCop,
  packageCopLabel,
  type CoinPackageId,
} from '../lib/coinPackages';
import { api } from '../lib/api';
import { CoinPackagesModal } from '../components/wallet/CoinPackagesModal';
import { WithdrawModal } from '../components/wallet/WithdrawModal';
import { useAuthStore } from '../store/authStore';

type WithdrawalRow = {
  id: string;
  coins: number;
  amountCop: number;
  status: string;
  payoutMethod?: string;
  createdAt: string;
};

const GRADIENT = 'bg-[linear-gradient(to_right,#EC4899,#06B6D4)]';

function packageBadge(pack: (typeof COIN_PACKAGES)[number]) {
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
  const profile = useAuthStore((state) => state.profile);
  const error = useAuthStore((state) => state.error);
  const [openTopup, setOpenTopup] = useState(false);
  const [initialPack, setInitialPack] = useState<CoinPackageId | undefined>();
  const [openWithdraw, setOpenWithdraw] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const packsRef = useRef<HTMLDivElement>(null);

  async function refreshWithdrawals() {
    try {
      const data = await api<{ withdrawals: WithdrawalRow[] }>('/api/payments/withdrawals');
      setWithdrawals(data.withdrawals || []);
    } catch {
      setWithdrawals([]);
    }
  }

  useEffect(() => {
    if (profile) void refreshWithdrawals();
  }, [profile?.firebaseUid]);

  const balance = profile?.coinsBalance ?? 0;
  const balanceCop = coinsToCop(balance);

  function openBuy(packageId?: CoinPackageId) {
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
            Mi Billetera
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Blast Liveboom</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowHistory((v) => !v);
            void refreshWithdrawals();
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
                Saldo actual
              </p>
              <p className="mt-2 flex flex-wrap items-baseline gap-1.5 sm:gap-2">
                <span className="break-all text-4xl font-black tracking-tight text-[#00E5FF] drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] sm:text-5xl md:text-6xl">
                  {balance.toLocaleString('es-CO')}
                </span>
                <span className="text-lg font-semibold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)] sm:text-xl">
                  blast
                </span>
              </p>
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-zinc-200">
                ≈ {formatCop(balanceCop)}
                <Info size={14} className="text-zinc-400" />
              </p>
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
                className="absolute -left-1 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-zinc-900/95 text-white shadow-lg md:grid"
              >
                <ChevronLeft size={18} />
              </button>
              <div
                ref={packsRef}
                className="gift-row flex snap-x snap-mandatory gap-3 overflow-x-auto px-0.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {COIN_PACKAGES.map((pack) => {
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
                className="absolute -right-1 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-zinc-900/95 text-white shadow-lg md:grid"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-transparent bg-[#14151c] p-4 [background:linear-gradient(#14151c,#14151c)_padding-box,linear-gradient(90deg,#a855f7,#06b6d4)_border-box] sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  {
                    icon: <Gift className="text-violet-400" size={20} />,
                    title: 'Envía regalos',
                    desc: 'Apoya a tus creadores favoritos',
                  },
                  {
                    icon: <Zap className="text-fuchsia-400" size={20} />,
                    title: 'Destaca en el chat',
                    desc: 'Usa efectos y mensajes especiales',
                  },
                  {
                    icon: <Crown className="text-amber-300" size={20} />,
                    title: 'Súbete al top',
                    desc: 'Consigue más visibilidad en los rankings',
                  },
                  {
                    icon: <Shield className="text-emerald-400" size={20} />,
                    title: 'Más beneficios',
                    desc: 'Accede a eventos y promociones exclusivas',
                  },
                ] as const
              ).map((item) => (
                <div key={item.title} className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0">{item.icon}</span>
                  <div>
                    <p className="text-sm font-bold text-cyan-300">{item.title}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">
              Métodos de pago aceptados
            </h2>
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#14151c] px-4 py-3.5">
              {(
                [
                  { label: 'VISA', className: 'font-black tracking-widest text-white' },
                  { label: 'Mastercard', className: 'font-bold text-orange-400' },
                  { label: 'Nequi', className: 'font-bold text-violet-300' },
                  { label: 'Daviplata', className: 'font-bold text-red-400' },
                  { label: 'Mercado Pago', className: 'font-bold text-sky-400' },
                  { label: 'PayPal', className: 'font-bold text-blue-300' },
                ] as const
              ).map((m) => (
                <span
                  key={m.label}
                  className={`rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] ${m.className}`}
                >
                  {m.label}
                </span>
              ))}
              <span className="text-[11px] text-zinc-500">… y más</span>
            </div>
            <p className="mt-2 text-[11px] text-zinc-600">
              Pagos procesados de forma segura con Wompi (PSE, tarjetas y billeteras).
            </p>
          </section>

          {showHistory ? (
            <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-4">
              <h2 className="text-sm font-semibold text-zinc-200">Historial de transacciones</h2>
              {withdrawals.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">
                  Aún no hay retiros. Las recargas aparecen en tu saldo al instante.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {withdrawals.slice(0, 12).map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2.5 text-sm"
                    >
                      <div>
                        <p className="font-medium text-white">
                          −{item.coins.toLocaleString('es-CO')} blast → {formatCop(item.amountCop)}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {new Date(item.createdAt).toLocaleString('es-CO')} ·{' '}
                          {item.payoutMethod || '—'} ·{' '}
                          {item.status === 'pending' ? 'Pendiente de pago' : item.status}
                        </p>
                      </div>
                    </li>
                  ))}
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
            void refreshWithdrawals();
            setShowHistory(true);
          }}
        />
      ) : null}
    </div>
  );
}
