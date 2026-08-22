import { Bell, Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';

type RequestUser = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export function FriendRequestsPanel() {
  const [requests, setRequests] = useState<RequestUser[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void api<{ requests: RequestUser[] }>('/api/social/friends/requests')
      .then((data) => setRequests(data.requests || []))
      .catch(() => undefined);
  }, []);

  async function accept(username: string) {
    await api(`/api/social/friends/accept/${encodeURIComponent(username)}`, { method: 'POST' });
    setRequests((current) => current.filter((user) => user.username !== username));
  }

  async function reject(username: string) {
    await api(`/api/social/friends/reject/${encodeURIComponent(username)}`, { method: 'POST' });
    setRequests((current) => current.filter((user) => user.username !== username));
  }

  if (requests.length === 0 && !open) return null;

  return (
    <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-bold text-white">
          <Bell size={16} className="text-cyan-300" />
          Solicitudes de amistad
          {requests.length > 0 ? (
            <span className="rounded-full bg-fuchsia-500 px-2 py-0.5 text-[10px] text-white">
              {requests.length}
            </span>
          ) : null}
        </span>
        <span className="text-xs text-zinc-500">{open ? 'Ocultar' : 'Ver'}</span>
      </button>
      {open ? (
        <ul className="mt-3 space-y-2">
          {requests.length === 0 ? (
            <li className="text-xs text-zinc-500">No tienes solicitudes pendientes.</li>
          ) : (
            requests.map((user) => (
              <li
                key={user.username}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2"
              >
                <Link to={`/u/${encodeURIComponent(user.username)}`} className="flex min-w-0 flex-1 items-center gap-2">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-zinc-800 text-xs font-bold text-cyan-300">
                      {user.username.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span className="truncate text-sm font-semibold text-white">@{user.username}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => void accept(user.username)}
                  className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/20 text-emerald-300"
                  aria-label="Aceptar"
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => void reject(user.username)}
                  className="grid h-8 w-8 place-items-center rounded-lg bg-fuchsia-500/20 text-fuchsia-300"
                  aria-label="Rechazar"
                >
                  <X size={16} />
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </section>
  );
}
