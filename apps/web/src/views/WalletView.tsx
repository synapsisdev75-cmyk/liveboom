import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CoinModal, RechargeButton } from '../components/wallet/CoinModal';
import { useAuthStore } from '../store/authStore';

export function WalletView() {
  const profile = useAuthStore((state) => state.profile);
  const error = useAuthStore((state) => state.error);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-full flex-col gap-5 rounded-2xl border border-white/10 bg-zinc-900/70 p-4 backdrop-blur-xl sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Mi Billetera</p>
        <h1 className="mt-1 text-lg font-bold text-white sm:text-xl">Coins Liveboom</h1>
      </div>
      {profile ? (
        <>
          <p className="text-3xl font-extrabold text-cyan-400 sm:text-4xl">
            {profile.coinsBalance.toLocaleString('es-CO')}{' '}
            <span className="text-base font-semibold text-zinc-400 sm:text-lg">coins</span>
          </p>
          <p className="text-sm text-zinc-400">Saldo de @{profile.handle}</p>
          <RechargeButton onClick={() => setOpen(true)} className="w-full sm:w-fit" />
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
      {open ? <CoinModal onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
