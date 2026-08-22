import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export function ProfileView() {
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const profile = useAuthStore((state) => state.profile);

  return (
    <div className="flex min-h-full flex-col gap-4 rounded-2xl bg-zinc-900 p-6">
      <h1 className="text-xl font-bold text-white">Perfil</h1>
      {profile ? (
        <dl className="grid gap-2 text-sm">
          <div>
            <dt className="text-zinc-500">Usuario</dt>
            <dd className="text-white">@{profile.handle}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Email</dt>
            <dd className="text-white">{profile.email}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Firebase UID</dt>
            <dd className="font-mono text-xs text-zinc-300">{profile.firebaseUid}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Coins</dt>
            <dd className="text-cyan-400">{profile.coinsBalance}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-zinc-400">
          {firebaseUser ? 'Firebase autenticó, pero falta sincronizar PostgreSQL.' : (
            <>
              <Link to="/login" className="text-cyan-400 underline">
                Inicia sesión
              </Link>{' '}
              para ver tu perfil.
            </>
          )}
        </p>
      )}
    </div>
  );
}
