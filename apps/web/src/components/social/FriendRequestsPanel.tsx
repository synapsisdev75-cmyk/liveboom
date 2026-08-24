import { Bell, Check, Send, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { playFriendRequestAlert } from '../../lib/alertSound';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  listenIncomingRequests,
  listenOutgoingRequests,
  rejectFriendRequest,
  type FriendRequest,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { profileHref } from '../../lib/profileFirestore';

export function FriendRequestsPanel() {
  const profile = useAuthStore((state) => state.profile);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [busy, setBusy] = useState<string | null>(null);
  const knownIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!profile) return;
    const stopIn = listenIncomingRequests(profile.firebaseUid, (list) => {
      if (knownIds.current == null) {
        knownIds.current = new Set(list.map((item) => item.id));
      } else {
        const fresh = list.filter((item) => !knownIds.current!.has(item.id));
        if (fresh.length > 0) {
          playFriendRequestAlert();
          setTab('incoming');
        }
        knownIds.current = new Set(list.map((item) => item.id));
      }
      setIncoming(list);
    });
    const stopOut = listenOutgoingRequests(profile.firebaseUid, setOutgoing);
    return () => {
      stopIn();
      stopOut();
    };
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

  async function cancel(username: string) {
    setBusy(username);
    try {
      await cancelFriendRequest(profile!.firebaseUid, username);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-bold text-white">
            <Bell size={16} className="text-cyan-300" />
            Solicitudes de amistad
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">Se actualizan al instante.</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-zinc-950/70 p-1">
        <button
          type="button"
          onClick={() => setTab('incoming')}
          className={`rounded-lg px-3 py-2 text-xs font-semibold ${
            tab === 'incoming' ? 'bg-cyan-500/20 text-cyan-200' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Recibidas
          {incoming.length > 0 ? (
            <span className="ml-1 rounded-full bg-fuchsia-500 px-1.5 py-0.5 text-[10px] text-white">
              {incoming.length}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => setTab('outgoing')}
          className={`rounded-lg px-3 py-2 text-xs font-semibold ${
            tab === 'outgoing' ? 'bg-cyan-500/20 text-cyan-200' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Enviadas
          {outgoing.length > 0 ? (
            <span className="ml-1 rounded-full bg-zinc-700 px-1.5 py-0.5 text-[10px] text-white">
              {outgoing.length}
            </span>
          ) : null}
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {tab === 'incoming' ? (
          incoming.length === 0 ? (
            <li className="rounded-xl border border-dashed border-white/10 bg-zinc-950/60 px-3 py-4 text-center text-xs text-zinc-500">
              Nadie te ha enviado solicitud todavía.
            </li>
          ) : (
            incoming.map((user) => (
              <RequestRow key={user.id} user={user}>
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
              </RequestRow>
            ))
          )
        ) : outgoing.length === 0 ? (
          <li className="rounded-xl border border-dashed border-white/10 bg-zinc-950/60 px-3 py-4 text-center text-xs text-zinc-500">
            No has enviado solicitudes pendientes.
          </li>
        ) : (
          outgoing.map((user) => (
            <RequestRow key={user.id} user={user}>
              <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                <Send size={12} />
                Pendiente
              </span>
              <button
                type="button"
                disabled={busy === user.username}
                onClick={() => void cancel(user.username)}
                className="inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 disabled:opacity-50"
              >
                <X size={14} />
                Cancelar
              </button>
            </RequestRow>
          ))
        )}
      </ul>
    </section>
  );
}

function RequestRow({
  user,
  children,
}: {
  user: FriendRequest;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2">
      <Link to={profileHref(user.username, user.uid)} className="flex min-w-0 flex-1 items-center gap-2">
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
      {children}
    </li>
  );
}
