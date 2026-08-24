import { useEffect, useState } from 'react';
import { api, type CoinPackage, type TxnDto } from '../../lib/api';
import { COIN_TO_COP, coinsToCop, formatCop } from '../../lib/coinPackages';
import { useAuthStore } from '../../store/authStore';
import { TopupModal } from './TopupModal';
import { WithdrawModal } from './WithdrawModal';

const labels: Record<string, string> = {
  TOPUP: 'Recarga',
  GIFT_SENT: 'Regalo enviado',
  GIFT_RECEIVED: 'Regalo recibido',
  LOCK_PURCHASE: 'Candado',
  PENDING: 'Pendiente',
  COMPLETED: 'Completada',
  FAILED: 'Fallida',
};

export function WalletView() {
  const profile = useAuthStore((s) => s.profile);
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [txns, setTxns] = useState<TxnDto[]>([]);
  const [open, setOpen] = useState(false);
  const [openWithdraw, setOpenWithdraw] = useState(false);

  async function refresh() {
    const data = await api<{
      user: { coins: number };
      packages: CoinPackage[];
      transactions: TxnDto[];
    }>('/api/wallet');
    useAuthStore.getState().setCoins(data.user.coins);
    setPackages(data.packages);
    setTxns(data.transactions);
  }

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, []);

  const balance = profile?.coins ?? profile?.coinsBalance ?? 0;

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/5 bg-boom-panel p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-boom-cyan">Mi Billetera</p>
      <h1 className="mt-1 text-3xl font-bold text-white">
        {balance.toLocaleString('es-ES')}{' '}
        <span className="text-lg font-semibold text-boom-gold">COINS</span>
      </h1>
      <p className="mt-1 text-sm text-zinc-400">
        ≈ {formatCop(coinsToCop(balance))} · 1 coin = ${COIN_TO_COP} COP
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-6 py-2 font-bold text-white shadow-[0_0_15px_rgba(0,240,255,0.5)] transition-transform hover:scale-105"
        >
          Recargar Coins
        </button>
        <button
          type="button"
          onClick={() => setOpenWithdraw(true)}
          className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-6 py-2 font-bold text-emerald-300 hover:bg-emerald-500/20"
        >
          Retirar a COP
        </button>
      </div>

      <h2 className="mt-8 text-sm font-semibold text-zinc-300">Historial</h2>
      <ul className="chat-scroll mt-3 flex-1 space-y-2 overflow-y-auto">
        {txns.map((txn) => (
          <li
            key={txn.id}
            className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium text-white">{labels[txn.type] ?? txn.type}</p>
              <p className="text-xs text-zinc-500">
                {new Date(txn.createdAt).toLocaleString('es-CO')} · {labels[txn.status] ?? txn.status}
              </p>
            </div>
            <span className={txn.coins >= 0 ? 'font-bold text-emerald-400' : 'font-bold text-boom-fuchsia'}>
              {txn.coins > 0 ? '+' : ''}
              {txn.coins}
            </span>
          </li>
        ))}
      </ul>

      {open ? (
        <TopupModal
          packages={packages}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            void refresh();
          }}
        />
      ) : null}
      {openWithdraw ? (
        <WithdrawModal
          onClose={() => setOpenWithdraw(false)}
          onDone={() => {
            void refresh().catch(() => undefined);
          }}
        />
      ) : null}
    </section>
  );
}
