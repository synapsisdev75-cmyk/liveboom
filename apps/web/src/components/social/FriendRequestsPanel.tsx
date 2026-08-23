import { Bell, Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { playFriendRequestAlert } from '../../lib/alertSound';
import {
  acceptFriendRequest,
  listenIncomingRequests,
  rejectFriendRequest,
  type FriendRequest,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';

export function FriendRequestsPanel() {
  const profile = useAuthStore((state) => state.profile);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const knownIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!profile) return;
    return listenIncomingRequests(profile.firebaseUid, (list) => {
      if (knownIds.current == null) {
        knownIds.current = new Set(list.map((item) => item.id));
      } else {
        const fresh = list.filter((item) => !knownIds.current!.has(item.id));
        if (fresh.length > 0) {
          playFriendRequestAlert();
          setOpen(true);
        }
        knownIds.current = new Set(list.map((item) => item.id));
      }
      setRequests(list);
    });
  }, [profile?.firebaseUid]);

  if (!profile) return null;

  async function accept(username: string) {
    setBusy(username);
    try {
      await acceptFriendRequest(profile!.firebaseUid, username);
    } finally {
      setBusy(null);
    }
  }

  async function reject(username: string) {
    setBusy(username);
    try {
      await rejectFriendRequest(profile!.firebaseUid, username);
    } finally {
      setBusy(null);
    }
  }

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
            <li className="rounded-xl border border-dashed border-white/10 bg-zinc-950/60 px-3 py-4 text-center text-xs text-zinc-500">
              No tienes solicitudes pendientes. Llegan aquí al instante, con sonido.
            </li>
          ) : (
            requests.map((user) => (
              <li
                key={user.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2"
              >
                <Link to={`/u/${encodeURIComponent(user.username)}`} className="flex min-w-0 flex-1 items-center gap-2">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-zinc-800 text-xs font-bold text-cyan-300">
                      {user.username.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {user.displayName && user.displayName !== user.username
                        ? user.displayName
                        : `@${user.username}`}
                    </p>
                    <p className="truncate text-xs text-zinc-400">@{user.username}</p>
                  </div>
                </Link>
                <button
                  type="button"
                  disabled={busy === user.username}
                  onClick={() => void accept(user.username)}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 disabled:opacity-50"
                >
                  <Check size={14} />
                  Aceptar
                </button>
                <button
                  type="button"
                  disabled={busy === user.username}
                  onClick={() => void reject(user.username)}
                  className="inline-flex items-center gap-1 rounded-lg bg-fuchsia-500/20 px-3 py-1.5 text-xs font-semibold text-fuchsia-300 disabled:opacity-50"
                >
                  <X size={14} />
                  Rechazar
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </section>
  );
}
