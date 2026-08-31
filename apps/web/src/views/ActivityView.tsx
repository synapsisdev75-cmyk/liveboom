import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  ChevronDown,
  Clock3,
  Filter,
  Gift,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Radio,
  UserPlus,
  Users,
  Coins,
} from 'lucide-react';
import {
  listenIncomingRequests,
  listenRecentPosts,
  type FriendRequest,
  type FsPost,
} from '../lib/socialFirestore';
import { listenLiveActivity, listenLiveAlerts, type LiveActivityEntry } from '../lib/liveGiftsFirestore';
import { listenMyGroups, type LiveGroup } from '../lib/groupsFirestore';
import { profileHref } from '../lib/profileFirestore';
import { useAuthStore } from '../store/authStore';

type TabId = 'todo' | 'interacciones' | 'amigos' | 'grupos' | 'live' | 'regalos' | 'sistema';

type FeedKind = 'like' | 'comment' | 'gift' | 'follow' | 'live' | 'group' | 'system';

type FeedItem = {
  id: string;
  kind: FeedKind;
  name: string;
  username: string;
  uid?: string;
  avatarUrl: string | null;
  verified?: boolean;
  action: string;
  at: number;
  thumbUrl?: string | null;
  followCta?: boolean;
};

const TABS: { id: TabId; label: string; badge?: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'interacciones', label: 'Interacciones' },
  { id: 'amigos', label: 'Amigos' },
  { id: 'grupos', label: 'Grupos' },
  { id: 'live', label: 'LIVE' },
  { id: 'regalos', label: 'Regalos' },
  { id: 'sistema', label: 'Sistema', badge: 'NUEVO' },
];

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return n.toLocaleString('es-CO');
}

function formatDuration(ms?: number) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDurationShort(ms?: number) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${total}s`;
}

function formatRelative(at: number) {
  const diff = Math.max(0, Date.now() - at);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'Ahora';
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Ayer';
  return `Hace ${d} días`;
}

function formatLiveWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startToday - startMsg) / 86_400_000);
  const time = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  if (dayDiff === 0) return `Hoy, ${time}`;
  if (dayDiff === 1) return `Ayer, ${time}`;
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function monthKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function KindIcon({ kind }: { kind: FeedKind }) {
  const wrap =
    'grid h-8 w-8 shrink-0 place-items-center rounded-full ring-2 ring-[#0a0a0b]';
  if (kind === 'like') {
    return (
      <span className={`${wrap} bg-rose-500/20 text-rose-400`}>
        <Heart size={14} fill="currentColor" />
      </span>
    );
  }
  if (kind === 'comment') {
    return (
      <span className={`${wrap} bg-violet-500/20 text-violet-300`}>
        <MessageCircle size={14} />
      </span>
    );
  }
  if (kind === 'gift') {
    return (
      <span className={`${wrap} bg-amber-500/20 text-amber-300`}>
        <Gift size={14} />
      </span>
    );
  }
  if (kind === 'follow') {
    return (
      <span className={`${wrap} bg-sky-500/20 text-sky-300`}>
        <UserPlus size={14} />
      </span>
    );
  }
  if (kind === 'live') {
    return (
      <span className={`${wrap} bg-fuchsia-500/20 text-fuchsia-300`}>
        <Radio size={14} />
      </span>
    );
  }
  if (kind === 'group') {
    return (
      <span className={`${wrap} bg-emerald-500/20 text-emerald-300`}>
        <Users size={14} />
      </span>
    );
  }
  return (
    <span className={`${wrap} bg-zinc-700/50 text-zinc-300`}>
      <Radio size={14} />
    </span>
  );
}

function Avatar({
  url,
  name,
  size = 44,
}: {
  url: string | null;
  name: string;
  size?: number;
}) {
  const letter = (name || '?').slice(0, 1).toUpperCase();
  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-full bg-zinc-800"
      style={{ width: size, height: size, minWidth: size, maxWidth: size }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          className="block h-full w-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <span className="grid h-full w-full place-items-center text-xs font-bold text-violet-200">
          {letter}
        </span>
      )}
    </span>
  );
}

function tabMatches(tab: TabId, kind: FeedKind) {
  if (tab === 'todo') return true;
  if (tab === 'interacciones') return kind === 'like' || kind === 'comment';
  if (tab === 'amigos') return kind === 'follow';
  if (tab === 'grupos') return kind === 'group';
  if (tab === 'live') return kind === 'live';
  if (tab === 'regalos') return kind === 'gift';
  if (tab === 'sistema') return kind === 'system';
  return true;
}

export function ActivityView() {
  const profile = useAuthStore((state) => state.profile);
  const ready = useAuthStore((state) => state.ready);
  const [tab, setTab] = useState<TabId>('todo');
  const [lives, setLives] = useState<LiveActivityEntry[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [alerts, setAlerts] = useState<Array<{ id: string; text: string; href: string; at: number }>>(
    [],
  );
  const [posts, setPosts] = useState<FsPost[]>([]);
  const [myGroups, setMyGroups] = useState<LiveGroup[]>([]);
  const [visible, setVisible] = useState(8);

  useEffect(() => {
    if (!profile?.firebaseUid) return;
    return listenLiveActivity(profile.firebaseUid, setLives);
  }, [profile?.firebaseUid]);

  useEffect(() => {
    if (!profile?.firebaseUid) return;
    return listenIncomingRequests(profile.firebaseUid, setRequests);
  }, [profile?.firebaseUid]);

  useEffect(() => {
    if (!profile?.firebaseUid) return;
    return listenLiveAlerts(profile.firebaseUid, setAlerts);
  }, [profile?.firebaseUid]);

  useEffect(() => {
    if (!profile?.firebaseUid) return;
    return listenMyGroups(profile.firebaseUid, setMyGroups);
  }, [profile?.firebaseUid]);

  useEffect(() => listenRecentPosts(setPosts), []);

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${now.getMonth()}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prev.getFullYear()}-${prev.getMonth()}`;

  const monthLives = lives.filter((l) => monthKey(l.endedAt || l.startedAt) === thisMonth);
  const prevLives = lives.filter((l) => monthKey(l.endedAt || l.startedAt) === prevMonth);

  const streamsThisMonth = monthLives.length;
  const streamsDelta = streamsThisMonth - prevLives.length;
  const timeMs = monthLives.reduce((sum, l) => sum + (l.durationMs || 0), 0);
  const prevTimeMs = prevLives.reduce((sum, l) => sum + (l.durationMs || 0), 0);
  const coinsMonth = monthLives.reduce((sum, l) => sum + (l.coinsEarned || 0), 0);
  const coinsPrev = prevLives.reduce((sum, l) => sum + (l.coinsEarned || 0), 0);
  const giftsMonth = monthLives.reduce((sum, l) => sum + (l.topGifters?.length || 0), 0);
  const giftsPrev = prevLives.reduce((sum, l) => sum + (l.topGifters?.length || 0), 0);

  const lastLive = lives[0] || null;

  const feed = useMemo(() => {
    const items: FeedItem[] = [];

    for (const r of requests) {
      items.push({
        id: `req-${r.id}`,
        kind: 'follow',
        name: r.displayName || r.username,
        username: r.username,
        uid: r.uid,
        avatarUrl: r.avatarUrl,
        action: 'comenzó a seguirte',
        at: new Date(r.createdAt).getTime() || Date.now(),
        followCta: true,
      });
    }

    for (const a of alerts) {
      const handle = a.text.match(/@([\w.]+)/)?.[1] || 'alguien';
      const isGift = /regal|coin|gift/i.test(a.text);
      items.push({
        id: `alert-${a.id}`,
        kind: isGift ? 'gift' : 'live',
        name: handle,
        username: handle,
        avatarUrl: null,
        action: isGift
          ? a.text.replace(/^@[\w.]+\s*/i, '').trim() || 'te envió un regalo'
          : a.text.replace(/^@[\w.]+\s*/i, '').trim() || 'actividad en vivo',
        at: a.at || Date.now(),
      });
    }

    for (const p of posts.slice(0, 20)) {
      if (profile && p.authorUid === profile.firebaseUid) continue;
      items.push({
        id: `post-${p.id}`,
        kind: p.mediaUrl ? 'like' : 'comment',
        name: p.username,
        username: p.username,
        uid: p.authorUid,
        avatarUrl: null,
        action: p.mediaUrl ? 'publicó contenido nuevo' : 'compartió una actualización',
        at: new Date(p.createdAt).getTime() || Date.now(),
        thumbUrl: p.mediaUrl || null,
      });
    }

    for (const live of lives.slice(0, 8)) {
      items.push({
        id: `live-${live.id}`,
        kind: 'live',
        name: live.displayName || live.username || profile?.displayName || 'Tú',
        username: live.username || profile?.handle || '',
        avatarUrl: profile?.avatarUrl ?? null,
        action: `finalizó «${live.title}» · ${(live.coinsEarned || 0).toLocaleString('es-CO')} coins`,
        at: new Date(live.endedAt || live.startedAt).getTime() || Date.now(),
      });
    }

    for (const g of myGroups.slice(0, 4)) {
      items.push({
        id: `group-${g.id}`,
        kind: 'group',
        name: g.name,
        username: g.name,
        avatarUrl: g.photoUrl || null,
        action: 'actividad en tu grupo',
        at: Date.now() - 3_600_000,
      });
    }

    if (profile) {
      items.push({
        id: 'sys-welcome',
        kind: 'system',
        name: 'LiveBoom',
        username: 'liveboom',
        avatarUrl: '/brand/logo.png',
        action: 'Bienvenido a tu centro de actividad',
        at: Date.now() - 86_400_000,
      });
    }

    return items.sort((a, b) => b.at - a.at);
  }, [requests, alerts, posts, lives, myGroups, profile]);

  const filtered = feed.filter((item) => tabMatches(tab, item.kind));
  const shown = filtered.slice(0, visible);

  if (!ready) {
    return <div className="p-6 text-sm text-zinc-400">Cargando actividad…</div>;
  }

  if (!profile) {
    return (
      <div className="lb-panel rounded-2xl p-6 text-center text-sm text-zinc-400">
        <Link to="/login" className="text-violet-400 underline">
          Inicia sesión
        </Link>{' '}
        para ver tu actividad.
      </div>
    );
  }

  return (
    <div className="lb-page mx-auto flex w-full max-w-3xl flex-col gap-4 pb-2 sm:gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Actividad</h1>
          <p className="mt-1 text-sm text-zinc-500">Todo lo que pasa en LiveBoom y lo que te interesa.</p>
        </div>
        <button
          type="button"
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-[#14151c] px-3.5 text-xs font-semibold text-zinc-200 hover:border-white/20"
        >
          <Filter size={14} />
          Filtrar
        </button>
      </header>

      <div className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setVisible(8);
              }}
              className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition ${
                active
                  ? 'bg-violet-600 text-white shadow-[0_0_20px_rgba(139,92,246,0.35)]'
                  : 'bg-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
              }`}
            >
              {t.label}
              {t.badge ? (
                <span className="rounded-full bg-violet-400 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-violet-950">
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <section>
        <h2 className="mb-3 text-sm font-bold text-white">Resumen de tus transmisiones</h2>
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5 md:grid-cols-4">
          {(
            [
              {
                label: 'Transmisiones este mes',
                value: String(streamsThisMonth),
                delta: `${streamsDelta >= 0 ? '+' : ''}${streamsDelta} vs mes anterior`,
                Icon: Radio,
                tone: 'bg-violet-500/15 text-violet-300',
                deltaClass: streamsDelta >= 0 ? 'text-emerald-400' : 'text-zinc-500',
              },
              {
                label: 'Tiempo en vivo',
                value: formatDurationShort(timeMs) || '0m',
                delta: `${timeMs >= prevTimeMs ? '+' : ''}${formatDurationShort(Math.abs(timeMs - prevTimeMs))} vs mes anterior`,
                Icon: Clock3,
                tone: 'bg-emerald-500/15 text-emerald-300',
                deltaClass: timeMs >= prevTimeMs ? 'text-emerald-400' : 'text-zinc-500',
              },
              {
                label: 'Coins generados',
                value: coinsMonth.toLocaleString('es-CO'),
                delta: `${coinsMonth >= coinsPrev ? '+' : ''}${Math.abs(coinsMonth - coinsPrev).toLocaleString('es-CO')} vs mes anterior`,
                Icon: Coins,
                tone: 'bg-amber-500/15 text-amber-300',
                deltaClass: coinsMonth >= coinsPrev ? 'text-emerald-400' : 'text-zinc-500',
              },
              {
                label: 'Regalos recibidos',
                value: giftsMonth.toLocaleString('es-CO'),
                delta: `${giftsMonth >= giftsPrev ? '+' : ''}${Math.abs(giftsMonth - giftsPrev)} vs mes anterior`,
                Icon: Gift,
                tone: 'bg-fuchsia-500/15 text-fuchsia-300',
                deltaClass: giftsMonth >= giftsPrev ? 'text-cyan-400' : 'text-zinc-500',
              },
            ] as const
          ).map((card) => (
            <article
              key={card.label}
              className="min-w-0 rounded-2xl border border-white/[0.06] bg-[#14151c] p-3 sm:p-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-[11px] leading-snug text-zinc-500">{card.label}</p>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${card.tone}`}>
                  <card.Icon size={15} />
                </span>
              </div>
              <p className="mt-2 break-all text-xl font-black tracking-tight text-white sm:text-2xl">
                {card.value}
              </p>
              <p className={`mt-1 text-[10px] font-medium leading-snug sm:text-[11px] ${card.deltaClass}`}>
                {card.delta}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.06] bg-[#14151c] p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-white">Tu último LIVE</h2>
          {lastLive ? (
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-full border border-violet-500/50 px-3 text-[11px] font-semibold text-violet-300 hover:bg-violet-500/10"
            >
              Ver detalles
            </button>
          ) : null}
        </div>
        {!lastLive ? (
          <p className="text-sm text-zinc-500">
            Aún no has transmitido.{' '}
            <Link to="/transmitir" className="text-violet-400 underline">
              Inicia tu primer LIVE
            </Link>
          </p>
        ) : (
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative h-28 w-full shrink-0 overflow-hidden rounded-xl bg-zinc-900 sm:h-24 md:h-[4.75rem] md:w-32">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-700/40 via-fuchsia-800/20 to-zinc-900" />
              <span className="absolute inset-0 grid place-items-center text-xs font-bold text-white/70">
                LIVE
              </span>
              <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {formatDuration(lastLive.durationMs)}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{lastLive.title}</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {formatLiveWhen(lastLive.endedAt || lastLive.startedAt)}
                {lastLive.goalLabel ? ` • ${lastLive.goalLabel}` : ''}
              </p>
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Transmisión finalizada
              </p>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4 sm:gap-3 md:min-w-[14rem]">
              {(
                [
                  {
                    label: 'Coins',
                    value: formatCompact(lastLive.coinsEarned || 0),
                    Icon: Coins,
                    tone: 'text-amber-300',
                  },
                  {
                    label: 'Máx. espectadores',
                    value: formatCompact(lastLive.viewers || 0),
                    Icon: Users,
                    tone: 'text-violet-300',
                  },
                  {
                    label: 'Regalos',
                    value: formatCompact(lastLive.topGifters?.length || 0),
                    Icon: Gift,
                    tone: 'text-fuchsia-300',
                  },
                  {
                    label: 'Duración',
                    value: formatDurationShort(lastLive.durationMs),
                    Icon: MessageCircle,
                    tone: 'text-violet-300',
                  },
                ] as const
              ).map((s) => (
                <div key={s.label} className="min-w-[4.5rem]">
                  <p className={`inline-flex items-center gap-1 text-[10px] font-semibold ${s.tone}`}>
                    <s.Icon size={12} />
                    {s.label}
                  </p>
                  <p className="text-sm font-bold text-white">{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold text-white">Hoy</h2>
        {shown.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-[#14151c] p-6 text-center text-sm text-zinc-500">
            Todavía no hay actividad en esta categoría.
          </div>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#14151c]">
            {shown.map((item, index) => (
              <li
                key={item.id}
                className={`flex items-center gap-2.5 px-3 py-3 sm:gap-3 sm:px-4 ${
                  index > 0 ? 'border-t border-white/[0.05]' : ''
                }`}
              >
                <div className="relative flex shrink-0 items-center">
                  <span className="-mr-2 z-[1]">
                    <KindIcon kind={item.kind} />
                  </span>
                  <Avatar url={item.avatarUrl} name={item.name} size={44} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-zinc-300">
                    <Link
                      to={profileHref(item.username, item.uid)}
                      className="inline-flex items-center gap-1 font-bold text-white hover:underline"
                    >
                      {item.name}
                      {item.verified ? (
                        <BadgeCheck size={14} className="text-violet-400" fill="currentColor" />
                      ) : null}
                    </Link>{' '}
                    <span className="text-zinc-400">{item.action}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-600">{formatRelative(item.at)}</p>
                </div>
                {item.followCta ? (
                  <Link
                    to={profileHref(item.username, item.uid)}
                    className="shrink-0 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-3 py-1.5 text-[11px] font-bold text-white"
                  >
                    Seguir también
                  </Link>
                ) : item.thumbUrl ? (
                  <img
                    src={item.thumbUrl}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <button
                    type="button"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-zinc-600 hover:bg-white/5 hover:text-zinc-300"
                    aria-label="Más opciones"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {filtered.length > visible ? (
          <button
            type="button"
            onClick={() => setVisible((v) => v + 8)}
            className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#14151c] text-sm font-semibold text-zinc-300 hover:border-white/15"
          >
            Cargar más
            <ChevronDown size={16} />
          </button>
        ) : null}
      </section>
    </div>
  );
}
