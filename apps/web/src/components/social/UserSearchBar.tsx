import { Search, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CategoryChips } from '../search/CategoryChips';
import { categoryLabel } from '../../lib/categories';
import { api } from '../../lib/api';
import { FriendRequestButton } from './FriendRequestButton';
import { profileHref } from '../../lib/profileFirestore';

export type SearchUser = {
  uid?: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  category?: string | null;
  friendshipStatus: 'none' | 'friends' | 'pending_sent' | 'pending_received' | 'blocked' | 'self';
  isFollowing: boolean;
};

type Props = {
  category?: string;
  onCategoryChange?: (category: string) => void;
};

export function UserSearchBar({ category = '', onCategoryChange }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const value = query.trim();
    const timer = window.setTimeout(() => {
      setBusy(true);
      void (async () => {
        try {
          if (value.length >= 1) {
            const { searchFirestoreUsers } = await import('../../lib/profileFirestore');
            const fsUsers = await searchFirestoreUsers(value);
            let mapped: SearchUser[] = fsUsers
              .filter((user) => !category || user.category === category)
              .map((user) => ({
                uid: user.firebaseUid,
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
                bio: user.bio,
                category: user.category,
                friendshipStatus: 'none' as const,
                isFollowing: false,
              }));
            if (mapped.length === 0) {
              const params = new URLSearchParams({ q: value });
              if (category) params.set('category', category);
              const data = await api<{ users: SearchUser[] }>(`/api/social/search?${params.toString()}`);
              mapped = data.users || [];
            }
            setResults(mapped);
          } else {
            const params = new URLSearchParams();
            if (category) params.set('category', category);
            else params.set('browse', '1');
            const data = await api<{ users: SearchUser[] }>(`/api/social/search?${params.toString()}`);
            setResults(data.users || []);
          }
        } catch {
          setResults([]);
        } finally {
          setBusy(false);
        }
      })();
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, category]);

  const showEmpty = !busy && results.length === 0 && (query.trim().length >= 1 || Boolean(category));

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900 p-4">
      {onCategoryChange ? <CategoryChips value={category} onChange={onCategoryChange} /> : null}
      <label className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2">
        <Search size={18} className="shrink-0 text-cyan-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por @usuario, nombre o bio…"
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
        />
      </label>
      {!query && !category && results.length > 0 ? (
        <p className="mt-2 text-xs text-zinc-500">Creadores en Liveboom</p>
      ) : null}
      {category && query.trim().length < 1 ? (
        <p className="mt-2 text-xs text-zinc-500">Creadores en {categoryLabel(category)}.</p>
      ) : null}
      {busy ? <p className="mt-2 text-xs text-zinc-500">Buscando…</p> : null}
      {showEmpty ? (
        <p className="mt-2 text-xs text-zinc-500">
          Sin resultados. Prueba con @usuario. Si no aparece, pídele que complete su perfil en LiveBoom
          (Perfil → Guardar cambios).
        </p>
      ) : null}
      {results.length > 0 ? (
        <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
          {results.map((user) => (
            <li
              key={user.uid || user.username}
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-zinc-950/80 px-3 py-2"
            >
              <Link to={profileHref(user.username, user.uid)} className="flex min-w-0 flex-1 items-center gap-3">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-zinc-800 text-cyan-300">
                    <UserRound size={18} />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {user.displayName && user.displayName !== user.username
                      ? user.displayName
                      : `@${user.username}`}
                  </p>
                  <p className="truncate text-xs text-zinc-400">@{user.username}</p>
                  {user.category ? (
                    <p className="text-[10px] text-cyan-400">{categoryLabel(user.category)}</p>
                  ) : null}
                  {user.bio ? <p className="truncate text-xs text-zinc-500">{user.bio}</p> : null}
                </div>
              </Link>
              <FriendRequestButton
                username={user.username}
                uid={user.uid}
                initialStatus={user.friendshipStatus}
                compact
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
