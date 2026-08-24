import { FriendRequestsPanel } from '../components/social/FriendRequestsPanel';
import { InternalChatPanel } from '../components/social/InternalChatPanel';
import { UserSearchBar } from '../components/social/UserSearchBar';
import { DeleteAccountSection } from '../components/account/DeleteAccountSection';
import { useAuthStore } from '../store/authStore';
import { Link } from 'react-router-dom';
import { useState } from 'react';

export function SearchView() {
  const profile = useAuthStore((state) => state.profile);
  const [category, setCategory] = useState('');

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Comunidad</p>
        <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">Buscar amigos</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Encuentra creadores por @usuario, nombre, biografía o categoría.
        </p>
      </div>

      {profile ? (
        <>
          <UserSearchBar category={category} onCategoryChange={setCategory} />
          <FriendRequestsPanel />
          <InternalChatPanel compact />
          <DeleteAccountSection />
        </>
      ) : (
        <div className="rounded-2xl bg-zinc-900 p-6 text-center text-sm text-zinc-400">
          <p>
            <Link to="/login" className="text-cyan-400 underline">
              Inicia sesión
            </Link>{' '}
            o{' '}
            <Link to="/registro" className="text-cyan-400 underline">
              crea una cuenta
            </Link>{' '}
            para buscar amigos y enviar solicitudes.
          </p>
        </div>
      )}
    </div>
  );
}
