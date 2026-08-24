import { Bell, Compass, Lock, Radio, Shield, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useMatch } from 'react-router-dom';
import { ReelsRow } from '../feed/ReelsRow';
import { ActivityHistory } from '../live/ActivityHistory';
import { playFriendRequestAlert, playPostAlert } from '../../lib/alertSound';
import { api } from '../../lib/api';
import { listenIncomingRequests, listenRecentPosts } from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';

type LiveRecord = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  title: string;
  startedAt: string;
  endedAt?: string;
  viewers: number;
};

type ActiveStream = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  title: string;
  viewers: number;
};

function LiveRail({ host }: { host: string }) {
  return (
    <aside className="hidden w-[20%] min-w-[240px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-800/45 backdrop-blur-xl lg:flex">
      <section className="border-b border-zinc-800 p-5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-fuchsia-500" />
          </span>
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">En vivo</h2>
        </div>
        <p className="mt-3 text-sm font-semibold text-white">@{host}</p>
        <p className="mt-1 text-xs text-zinc-500">Chat y donaciones en el reproductor.</p>
      </section>
      <section className="flex flex-1 flex-col p-5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Top donadores</h2>
        <p className="mt-3 text-sm text-zinc-400">El ranking se actualiza durante el live.</p>
        <h2 className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Chat en vivo</h2>
        <p className="mt-3 text-sm text-zinc-400">Escribe en el panel del stream.</p>
      </section>
    </aside>
  );
}

export function SideRailPanel() {
  const liveMatch = useMatch('/stream/:username');
  if (liveMatch?.params.username) {
    return <LiveRail host={decodeURIComponent(liveMatch.params.username)} />;
  }
  return <DiscoveryRail />;
}

function DiscoveryRail() {
  const profile = useAuthStore((state) => state.profile);
  const [friendsLives, setFriendsLives] = useState<LiveRecord[]>([]);
  const [friendsOnline, setFriendsOnline] = useState<ActiveStream[]>([]);
  const [notifications, setNotifications] = useState<string[]>([]);
  const knownRequestIds = useRef<Set<string> | null>(null);
  const knownPostIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!profile?.handle) return;
    let cancelled = false;

    async function load() {
      try {
        const [friendsHistRes, onlineRes] = await Promise.all([
          api<{ lives: LiveRecord[] }>('/api/stream/friends-history').catch(() => ({ lives: [] })),
          api<{ streams: ActiveStream[] }>('/api/stream/friends-live').catch(() => ({ streams: [] })),
        ]);
        if (cancelled) return;
        setFriendsLives(friendsHistRes.lives || []);
        setFriendsOnline(onlineRes.streams || []);
      } catch {
        if (!cancelled) {
          setFriendsLives([]);
          setFriendsOnline([]);
        }
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [profile?.handle]);

  useEffect(() => {
    if (!profile) return;

    const unsubRequests = listenIncomingRequests(profile.firebaseUid, (list) => {
      if (knownRequestIds.current == null) {
        knownRequestIds.current = new Set(list.map((item) => item.id));
      } else {
        const fresh = list.filter((item) => !knownRequestIds.current!.has(item.id));
        if (fresh.length > 0) playFriendRequestAlert();
        knownRequestIds.current = new Set(list.map((item) => item.id));
      }
      setNotifications((current) => {
        const liveNotes = friendsOnline.map(
          (stream) => `${stream.displayName || stream.username} está en vivo`,
        );
        const requestNotes = list.map((item) => `@${item.username} te envió solicitud de amistad`);
        const postNotes = current.filter((note) => note.includes('publicó'));
        return [...requestNotes, ...liveNotes, ...postNotes].slice(0, 12);
      });
    });

    const unsubPosts = listenRecentPosts((list) => {
      if (knownPostIds.current == null) {
        knownPostIds.current = new Set(list.map((item) => item.id));
        return;
      }
      const fresh = list.filter(
        (item) => !knownPostIds.current!.has(item.id) && item.authorUid !== profile.firebaseUid,
      );
      if (fresh.length > 0) {
        playPostAlert();
        setNotifications((current) => {
          const notes = fresh.map((item) => `@${item.username} publicó algo nuevo`);
          return [...notes, ...current].slice(0, 12);
        });
      }
      knownPostIds.current = new Set(list.map((item) => item.id));
    });

    return () => {
      unsubRequests();
      unsubPosts();
    };
  }, [profile?.firebaseUid, friendsOnline]);

  const onlineCount = friendsOnline.length;
  const alertCount = notifications.length;

  return (
    <aside className="hidden w-[20%] min-w-[240px] shrink-0 flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-800/45 backdrop-blur-xl lg:flex">
      <section className="border-b border-zinc-800 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            <Bell size={14} />
            Notificaciones
          </h2>
          {alertCount > 0 ? (
            <span className="rounded-full bg-fuchsia-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {alertCount}
            </span>
          ) : onlineCount > 0 ? (
            <span className="rounded-full bg-fuchsia-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {onlineCount}
            </span>
          ) : null}
        </div>
        {notifications.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">Sin alertas nuevas.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {notifications.map((note) => (
              <li key={note} className="rounded-lg bg-zinc-900/80 px-3 py-2 text-xs text-zinc-300">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-cyan-400" />
                {note}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-b border-zinc-800 p-5">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
          <Shield size={14} />
          Seguridad
        </h2>
        <Link
          to="/perfil/editar"
          className="mt-3 flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/60 px-3 py-2.5 text-sm text-zinc-300 transition hover:border-cyan-500/40 hover:text-white"
        >
          <Lock size={14} className="text-cyan-400" />
          Cuenta y privacidad
        </Link>
      </section>

      <section className="border-b border-zinc-800 p-5">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
          <Radio size={14} />
          Tus últimos lives
        </h2>
        {profile ? (
          <>
            <ActivityHistory username={profile.handle} compact limit={5} />
            <Link to="/actividad" className="mt-2 inline-block text-[11px] text-cyan-400 hover:underline">
              Ver historial completo
            </Link>
          </>
        ) : (
          <p className="mt-3 text-sm text-zinc-400">Aún no has transmitido.</p>
        )}
      </section>

      <section className="border-b border-zinc-800 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Lives de amigos
        </h2>
        {friendsOnline.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {friendsOnline.map((stream) => (
              <li key={stream.username}>
                <Link
                  to={`/stream/${encodeURIComponent(stream.username)}`}
                  className="flex items-center gap-2 rounded-lg bg-fuchsia-500/10 px-2 py-1.5 text-xs text-fuchsia-200 hover:bg-fuchsia-500/20"
                >
                  {stream.avatarUrl ? (
                    <img src={stream.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-zinc-800 text-[10px]">@</span>
                  )}
                  <span className="min-w-0 truncate font-semibold">
                    {stream.displayName || stream.username} · EN VIVO
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {friendsLives.length === 0 && friendsOnline.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">Sin lives recientes de amigos.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {friendsLives.slice(0, 4).map((live) => (
              <li key={`${live.username}-${live.startedAt}`}>
                <Link
                  to={`/u/${encodeURIComponent(live.username)}`}
                  className="block text-xs text-zinc-400 hover:text-cyan-400"
                >
                  <span className="font-semibold text-zinc-200">@{live.username}</span> · {live.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-1 flex-col gap-4 p-5">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
          <Compass size={14} />
          Explorar
        </h2>
        <ReelsRow title="Reels" />
        <Link
          to="/"
          className="flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-cyan-500/40 hover:text-white"
        >
          <Sparkles size={14} className="text-cyan-400" />
          Ver lives y publicaciones
        </Link>
      </section>
    </aside>
  );
}

export function NotificationBell() {
  const profile = useAuthStore((state) => state.profile);
  const [count, setCount] = useState(0);
  const knownIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!profile) {
      setCount(0);
      return;
    }
    return listenIncomingRequests(profile.firebaseUid, (list) => {
      if (knownIds.current == null) {
        knownIds.current = new Set(list.map((item) => item.id));
      } else {
        const fresh = list.filter((item) => !knownIds.current!.has(item.id));
        if (fresh.length > 0) playFriendRequestAlert();
        knownIds.current = new Set(list.map((item) => item.id));
      }
      setCount(list.length);
    });
  }, [profile?.firebaseUid]);

  if (!profile || count === 0) {
    return (
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-zinc-900 text-zinc-500">
        <Bell size={16} />
      </span>
    );
  }

  return (
    <Link
      to="/buscar"
      className="relative grid h-9 w-9 place-items-center rounded-xl bg-zinc-900 text-cyan-400 ring-1 ring-cyan-500/30"
      aria-label={`${count} solicitudes`}
    >
      <Bell size={16} />
      <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-fuchsia-500 px-1 text-[9px] font-bold text-white">
        {count > 9 ? '9+' : count}
      </span>
    </Link>
  );
}
