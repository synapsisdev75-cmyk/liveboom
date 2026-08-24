import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { COIN_TO_COP, formatCop, coinsToCop } from '../lib/coinPackages';
import { api } from '../lib/api';
import { CoinModal, RechargeButton } from '../components/wallet/CoinModal';
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

export function WalletView() {
  const profile = useAuthStore((state) => state.profile);
  const error = useAuthStore((state) => state.error);
  const [openTopup, setOpenTopup] = useState(false);
  const [openWithdraw, setOpenWithdraw] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);

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

  return (
    <div className="flex min-h-full flex-col gap-5 rounded-2xl border border-white/10 bg-zinc-900/70 p-4 backdrop-blur-xl sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Mi Billetera</p>
        <h1 className="mt-1 text-lg font-bold text-white sm:text-xl">Coins Liveboom</h1>
      </div>
      {profile ? (
        <>
          <p className="text-3xl font-extrabold text-cyan-400 sm:text-4xl">
            {balance.toLocaleString('es-CO')}{' '}
            <span className="text-base font-semibold text-zinc-400 sm:text-lg">coins</span>
          </p>
          <p className="text-sm text-zinc-400">
            Saldo de @{profile.handle} · Equivale a{' '}
            <span className="font-semibold text-emerald-400">{formatCop(coinsToCop(balance))}</span>
          </p>
          <p className="text-xs text-zinc-500">Retiro justo: 1 coin = ${COIN_TO_COP} COP</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <RechargeButton onClick={() => setOpenTopup(true)} className="w-full sm:w-fit" />
            <button
              type="button"
              onClick={() => setOpenWithdraw(true)}
              className="w-full rounded-full border border-emerald-400/40 bg-emerald-500/10 px-5 py-2.5 text-sm font-bold text-emerald-300 hover:bg-emerald-500/20 sm:w-fit"
            >
              Retirar a COP
            </button>
          </div>

          {withdrawals.length > 0 ? (
            <section className="mt-2 space-y-2 border-t border-white/10 pt-4">
              <h2 className="text-sm font-semibold text-zinc-300">Retiros recientes</h2>
              <ul className="space-y-2">
                {withdrawals.slice(0, 8).map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium text-white">
                        −{item.coins.toLocaleString('es-CO')} coins → {formatCop(item.amountCop)}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {new Date(item.createdAt).toLocaleString('es-CO')} · {item.payoutMethod || '—'} ·{' '}
                        {item.status === 'pending' ? 'Pendiente de pago' : item.status}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-3xl font-extrabold text-cyan-400">— coins</p>
          <p className="text-sm text-zinc-400">
            <Link to="/login" className="text-cyan-400 underline">
              Inicia sesión
            </Link>{' '}
            para sincronizar tu saldo con el backend.
          </p>
        </>
      )}
      {error ? <p className="text-sm text-fuchsia-400">{error}</p> : null}
      {openTopup ? <CoinModal onClose={() => setOpenTopup(false)} /> : null}
      {openWithdraw ? (
        <WithdrawModal
          onClose={() => setOpenWithdraw(false)}
          onDone={() => {
            void refreshWithdrawals();
          }}
        />
      ) : null}
    </div>
  );
}
