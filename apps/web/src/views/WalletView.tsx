import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export function WalletView() {
  const profile = useAuthStore((state) => state.profile);
  const error = useAuthStore((state) => state.error);

  return (
    <div className="flex min-h-full flex-col gap-4 rounded-2xl bg-zinc-900 p-6">
      <h1 className="text-xl font-bold text-white">Mi Billetera</h1>
      {profile ? (
        <>
          <p className="text-3xl font-extrabold text-cyan-400">{profile.coinsBalance} coins</p>
          <p className="text-sm text-zinc-400">Saldo en PostgreSQL para @{profile.handle}</p>
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
    </div>
  );
}
