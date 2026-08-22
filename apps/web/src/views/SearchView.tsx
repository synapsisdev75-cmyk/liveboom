import { FriendRequestsPanel } from '../components/social/FriendRequestsPanel';
import { UserSearchBar } from '../components/social/UserSearchBar';
import { useAuthStore } from '../store/authStore';
import { Link } from 'react-router-dom';

export function SearchView() {
  const profile = useAuthStore((state) => state.profile);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Comunidad</p>
        <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">Buscar amigos</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Encuentra creadores por @usuario, nombre o biografía.
        </p>
      </div>

      {profile ? (
        <>
          <UserSearchBar />
          <FriendRequestsPanel />
        </>
      ) : (
        <div className="rounded-2xl bg-zinc-900 p-6 text-center text-sm text-zinc-400">
          <Link to="/login" className="text-cyan-400 underline">
            Inicia sesión
          </Link>{' '}
          para buscar amigos y enviar solicitudes.
        </div>
      )}
    </div>
  );
}
