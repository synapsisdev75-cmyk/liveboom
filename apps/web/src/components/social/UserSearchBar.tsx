import { Search, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { FriendRequestButton } from './FriendRequestButton';

export type SearchUser = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  friendshipStatus: 'none' | 'friends' | 'pending_sent' | 'pending_received' | 'self';
  isFollowing: boolean;
};

export function UserSearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setBusy(true);
      void api<{ users: SearchUser[] }>(`/api/social/search?q=${encodeURIComponent(value)}`)
        .then((data) => setResults(data.users || []))
        .catch(() => setResults([]))
        .finally(() => setBusy(false));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900 p-4">
      <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2">
        <Search size={18} className="shrink-0 text-cyan-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar usuarios por @nombre o bio…"
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
        />
      </label>
      {busy ? <p className="mt-2 text-xs text-zinc-500">Buscando…</p> : null}
      {query.trim().length >= 2 && !busy && results.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-500">Sin resultados.</p>
      ) : null}
      {results.length > 0 ? (
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {results.map((user) => (
            <li
              key={user.username}
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-zinc-950/80 px-3 py-2"
            >
              <Link to={`/u/${encodeURIComponent(user.username)}`} className="flex min-w-0 flex-1 items-center gap-3">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-zinc-800 text-cyan-300">
                    <UserRound size={18} />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">@{user.username}</p>
                  {user.bio ? <p className="truncate text-xs text-zinc-500">{user.bio}</p> : null}
                </div>
              </Link>
              <FriendRequestButton
                username={user.username}
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
