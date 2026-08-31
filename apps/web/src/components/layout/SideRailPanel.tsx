import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Eye,
  Gift,
  Hash,
  HelpCircle,
  Laptop,
  Link2,
  MapPin,
  Megaphone,
  MessageCircle,
  Plus,
  Radio,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  UserPlus,
  Users,
  Wifi,
} from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { Link, useLocation, useMatch } from 'react-router-dom';
import { PromoteAdsModal } from '../ads/PromoteAdsModal';
import { FollowButton } from '../social/SocialPostCard';
import {
  joinGroup,
  listenMyGroups,
  listenPublicGroups,
  requestJoinGroup,
  type LiveGroup,
} from '../../lib/groupsFirestore';
import { listenLiveActivity, listenLiveAlerts, type LiveActivityEntry } from '../../lib/liveGiftsFirestore';
import { fetchLevelXp } from '../../lib/profileFirestore';
import { listenActivePromotions, type PromotionAd } from '../../lib/promotionsFirestore';
import {
  browseSuggestedCreators,
  listenIncomingRequests,
  type FriendRequest,
} from '../../lib/socialFirestore';
import { listenTopTrends, type TrendTag } from '../../lib/trendsFirestore';
import { levelFromXp, xpNeededForNext, xpToNextLevel } from '../../lib/userLevels';
import {
  dismissLocationPrompt,
  fetchPrivateLocation,
  locationPromptDismissed,
  requestBrowserLocation,
  savePrivateLocation,
  type PrivateUserLocation,
} from '../../lib/userLocation';
import {
  ignoreSuggestedCreator,
  readIgnoredSuggestionUids,
} from '../../lib/ignoredSuggestions';
import { useAuthStore } from '../../store/authStore';

type SuggestedUser = {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isFollowing?: boolean;
};

const JOIN_BTN =
  'bg-[linear-gradient(to_right,#06B6D4,#8B5CF6)] text-white shadow-[0_4px_16px_rgba(6,182,212,0.25)]';

function useSuggestedCreators(limit: number) {
  const profile = useAuthStore((state) => state.profile);
  const [suggested, setSuggested] = useState<SuggestedUser[]>([]);

  const pullReplacement = useCallback(
    (excludeUids: string[]) => {
      void browseSuggestedCreators(profile?.firebaseUid, profile?.handle, {
        limit: 1,
        excludeUids,
      }).then((replacements) => {
        const replacement = replacements[0];
        if (!replacement) return;
        setSuggested((list) => {
          if (list.some((user) => user.uid === replacement.uid)) return list;
          return [...list, replacement].slice(0, limit);
        });
      });
    },
    [profile?.firebaseUid, profile?.handle, limit],
  );

  useEffect(() => {
    let cancelled = false;
    void browseSuggestedCreators(profile?.firebaseUid, profile?.handle, {
      limit,
      excludeUids: readIgnoredSuggestionUids(profile?.firebaseUid),
    })
      .then((users) => {
        if (!cancelled) setSuggested(users);
      })
      .catch(() => {
        if (!cancelled) setSuggested([]);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.handle, profile?.firebaseUid, limit]);

  const onSuggestedFollow = useCallback(
    (followedUid: string, following: boolean) => {
      if (!following) return;
      setSuggested((current) => {
        const next = current.filter((user) => user.uid !== followedUid);
        pullReplacement([...next.map((user) => user.uid), followedUid]);
        return next;
      });
    },
    [pullReplacement],
  );

  const onSuggestedIgnore = useCallback(
    (ignoredUid: string) => {
      if (!profile?.firebaseUid) return;
      ignoreSuggestedCreator(profile.firebaseUid, ignoredUid);
      setSuggested((current) => {
        const next = current.filter((user) => user.uid !== ignoredUid);
        pullReplacement([...next.map((user) => user.uid), ignoredUid]);
        return next;
      });
    },
    [profile?.firebaseUid, pullReplacement],
  );

  return { suggested, onSuggestedFollow, onSuggestedIgnore };
}

function SuggestedCreatorActions({
  user,
  profile,
  onFollow,
  onIgnore,
  variant = 'outline',
  loginClassName = 'shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-bold text-white',
}: {
  user: SuggestedUser;
  profile: ReturnType<typeof useAuthStore.getState>['profile'];
  onFollow: (uid: string, following: boolean) => void;
  onIgnore: (uid: string) => void;
  variant?: 'outline' | 'default';
  loginClassName?: string;
}) {
  if (!profile) {
    return (
      <Link to="/login" className={loginClassName}>
        Seguir
      </Link>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <FollowButton
        username={user.username}
        targetUid={user.uid}
        targetHint={user}
        initialFollowing={false}
        isOwnProfile={false}
        variant={variant}
        size="sm"
        onChange={(following) => onFollow(user.uid, following)}
      />
      <button
        type="button"
        onClick={() => onIgnore(user.uid)}
        className="min-h-8 rounded-full border border-rose-500/70 bg-rose-600/25 px-2.5 text-[10px] font-bold text-rose-300 transition hover:bg-rose-600/40 hover:text-white"
      >
        Ignorar
      </button>
    </div>
  );
}

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(n);
}

function GroupRailAvatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/15"
      />
    );
  }
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500/40 to-cyan-500/30 text-[10px] font-black text-white ring-1 ring-white/15">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function LiveRail({ host }: { host: string }) {
  return (
    <aside className="hidden w-[min(22%,18rem)] min-w-[220px] shrink-0 flex-col border-l border-white/5 bg-zinc-950/80 backdrop-blur-xl md:flex lg:min-w-[240px]">
      <section className="border-b border-white/5 p-4 lg:p-5">
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
    </aside>
  );
}

export function SideRailPanel() {
  const liveMatch = useMatch('/stream/:username');
  const locationPath = useLocation().pathname;
  if (liveMatch?.params.username) {
    return <LiveRail host={decodeURIComponent(liveMatch.params.username)} />;
  }
  if (locationPath.startsWith('/mensajes')) {
    return <MessagesRail />;
  }
  if (locationPath.startsWith('/actividad')) {
    return <ActivityRail />;
  }
  if (locationPath.startsWith('/buscar')) {
    return <SearchFriendsRail />;
  }
  if (locationPath.startsWith('/perfil/editar')) {
    return <SettingsRail />;
  }
  if (locationPath.startsWith('/transmitir')) {
    return <TransmitRail />;
  }
  return <DiscoveryRail />;
}

function formatViewers(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(n);
}

function formatLiveWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startToday - startMsg) / 86_400_000);
  const time = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  if (diff === 0) return `Hoy, ${time}`;
  if (diff === 1) return `Ayer, ${time}`;
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

/** Rail exclusivo de /buscar (mockup): invita, contactos, destacados, actividad. */
function SearchFriendsRail() {
  const profile = useAuthStore((state) => state.profile);
  const { suggested, onSuggestedFollow, onSuggestedIgnore } = useSuggestedCreators(5);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [alerts, setAlerts] = useState<Array<{ id: string; text: string; href: string; at: number }>>(
    [],
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!profile?.firebaseUid) return;
    return listenIncomingRequests(profile.firebaseUid, setRequests);
  }, [profile?.firebaseUid]);
  useEffect(() => {
    if (!profile?.firebaseUid) return;
    return listenLiveAlerts(profile.firebaseUid, setAlerts);
  }, [profile?.firebaseUid]);

  const inviteUrl = profile?.handle
    ? `https://liveboomapp.com/registro?ref=${encodeURIComponent(profile.handle)}`
    : 'https://liveboomapp.com/registro';

  function copyInvite() {
    void navigator.clipboard?.writeText(inviteUrl).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function inviteFriends() {
    copyInvite();
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`Únete a LiveBoom y gana coins: ${inviteUrl}`)}`,
      '_blank',
      'noopener',
    );
  }

  type ActivityItem = {
    id: string;
    text: string;
    href: string;
    at: number;
    kind: 'gift' | 'follow' | 'live';
    name: string;
    avatarUrl: string | null;
  };

  const activity: ActivityItem[] = [
    ...alerts.slice(0, 3).map((a) => ({
      id: `alert-${a.id}`,
      text: a.text,
      href: a.href,
      at: a.at,
      kind: /regal|gift|coin/i.test(a.text) ? ('gift' as const) : ('live' as const),
      name: a.text.match(/@([\w.]+)/)?.[1] || 'LiveBoom',
      avatarUrl: null as string | null,
    })),
    ...requests.slice(0, 3).map((r) => ({
      id: `req-${r.id}`,
      text: `${r.displayName || r.username} te envió solicitud`,
      href: `/u/${encodeURIComponent(r.username)}`,
      at: new Date(r.createdAt).getTime() || Date.now(),
      kind: 'follow' as const,
      name: r.displayName || r.username,
      avatarUrl: r.avatarUrl,
    })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 4);

  function relTime(at: number) {
    const m = Math.floor((Date.now() - at) / 60_000);
    if (m < 1) return 'Ahora';
    if (m < 60) return `Hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `Hace ${h} h`;
    return `Hace ${Math.floor(h / 24)} d`;
  }

  return (
    <aside className="chat-scroll hidden w-[min(24%,19rem)] min-w-[230px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/5 bg-zinc-950/70 p-3 backdrop-blur-xl md:flex lg:min-w-[250px] lg:p-4">
      <section className="overflow-hidden rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-700/40 via-[#1a1228] to-[#14151c] p-3.5">
        <div className="flex items-start gap-3">
          <img
            src="/blast/pack-basico.png"
            alt=""
            className="h-14 w-14 shrink-0 object-contain drop-shadow-[0_4px_12px_rgba(236,72,153,0.4)]"
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">Invita y gana Blast</p>
            <p className="mt-1 text-[11px] leading-snug text-violet-100/80">
              Gana hasta{' '}
              <span className="font-bold text-amber-300">100 blast</span> por cada amigo que se
              registre con tu enlace.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={inviteFriends}
          className="mt-3 flex h-10 w-full items-center justify-center rounded-xl bg-[linear-gradient(90deg,#8B5CF6,#EC4899)] text-xs font-bold text-white"
        >
          Invitar amigos
        </button>
        <button
          type="button"
          onClick={copyInvite}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 text-[11px] font-semibold text-cyan-300 hover:underline"
        >
          <Link2 size={13} />
          {copied ? '¡Enlace copiado!' : 'Copiar enlace'}
        </button>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-white">Contactos sincronizados</p>
          <span className="text-[11px] font-semibold text-violet-400">Ver todos</span>
        </div>
        <p className="text-[11px] text-zinc-500">Encuentra amigos que ya usan LiveBoom.</p>
        <div className="mt-3 flex gap-2">
          {(
            [
              { label: 'WA', tone: 'bg-emerald-500/20 text-emerald-300' },
              { label: 'IG', tone: 'bg-fuchsia-500/20 text-fuchsia-300' },
              { label: 'GM', tone: 'bg-amber-500/20 text-amber-300' },
              { label: '…', tone: 'bg-zinc-700/50 text-zinc-300' },
            ] as const
          ).map((item) => (
            <button
              key={item.label}
              type="button"
              className={`grid h-11 w-11 place-items-center rounded-xl text-[11px] font-black ${item.tone}`}
              title="Próximamente"
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-3.5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-white">Creadores destacados</p>
          <Link to="/explorar" className="text-[11px] font-semibold text-violet-400 hover:underline">
            Ver todos
          </Link>
        </div>
        {suggested.length === 0 ? (
          <p className="text-xs text-zinc-500">Pronto verás creadores aquí.</p>
        ) : (
          <ul className="space-y-3">
            {suggested.map((user, index) => (
              <li key={user.uid || user.username} className="flex items-center gap-2.5">
                <Link
                  to={`/u/${encodeURIComponent(user.username)}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5"
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                    />
                  ) : (
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-800 text-xs font-bold text-violet-200">
                      {user.username.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 truncate text-xs font-semibold text-white">
                      {user.displayName || user.username}
                      <CheckCircle2 size={12} className="shrink-0 text-sky-400" />
                      {index < 2 ? (
                        <span className="ml-0.5 rounded bg-fuchsia-500/90 px-1 py-px text-[8px] font-black uppercase text-white">
                          LIVE
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-[11px] text-zinc-500">@{user.username}</span>
                  </span>
                </Link>
                <SuggestedCreatorActions
                  user={user}
                  profile={profile}
                  onFollow={onSuggestedFollow}
                  onIgnore={onSuggestedIgnore}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-3.5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-white">Actividad reciente</p>
          <Link to="/actividad" className="text-[11px] font-semibold text-violet-400 hover:underline">
            Ver todos
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="text-xs text-zinc-500">Cuando haya actividad, la verás aquí.</p>
        ) : (
          <ul className="space-y-3">
            {activity.map((item) => (
              <li key={item.id}>
                <Link to={item.href} className="flex items-start gap-2.5">
                  {item.avatarUrl ? (
                    <img
                      src={item.avatarUrl}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-800 text-[10px] font-bold text-violet-200">
                      {item.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] leading-snug text-zinc-300">{item.text}</span>
                    <span className="text-[10px] text-zinc-600">{relTime(item.at)}</span>
                  </span>
                  <span
                    className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                      item.kind === 'gift'
                        ? 'bg-fuchsia-500/15 text-fuchsia-300'
                        : item.kind === 'follow'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-violet-500/15 text-violet-300'
                    }`}
                  >
                    {item.kind === 'gift' ? (
                      <Gift size={14} />
                    ) : item.kind === 'follow' ? (
                      <UserPlus size={14} />
                    ) : (
                      <Radio size={14} />
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="px-1 pb-2 text-center text-[9px] text-zinc-600">
        © {new Date().getFullYear()} LiveBoom. Todos los derechos reservados.
      </p>
    </aside>
  );
}

/** Rail exclusivo de /actividad (mockup): rendimiento, personas, grupos. */
function ActivityRail() {
  const profile = useAuthStore((state) => state.profile);
  const [lives, setLives] = useState<LiveActivityEntry[]>([]);
  const { suggested, onSuggestedFollow, onSuggestedIgnore } = useSuggestedCreators(4);
  const [publicGroups, setPublicGroups] = useState<LiveGroup[]>([]);
  const [myGroups, setMyGroups] = useState<LiveGroup[]>([]);
  const [joinBusy, setJoinBusy] = useState(false);

  useEffect(() => {
    if (!profile?.firebaseUid) return;
    return listenLiveActivity(profile.firebaseUid, (list) => setLives(list.slice(0, 12)));
  }, [profile?.firebaseUid]);

  useEffect(() => listenPublicGroups(setPublicGroups), []);
  useEffect(() => {
    if (!profile?.firebaseUid) return;
    return listenMyGroups(profile.firebaseUid, setMyGroups);
  }, [profile?.firebaseUid]);

  async function onJoinGroup(groupId: string) {
    if (!profile) return;
    setJoinBusy(true);
    try {
      const group = publicGroups.find((g) => g.id === groupId);
      if (group && group.isPublic === false) {
        await requestJoinGroup(groupId, {
          uid: profile.firebaseUid,
          username: profile.handle,
          displayName: profile.displayName || profile.handle,
        });
      } else {
        await joinGroup(groupId, {
          uid: profile.firebaseUid,
          username: profile.handle,
          displayName: profile.displayName || profile.handle,
          avatarUrl: profile.avatarUrl,
        });
      }
    } catch {
      // ignore
    } finally {
      setJoinBusy(false);
    }
  }

  const chartPoints = [...lives].reverse().map((l) => Math.max(0, l.coinsEarned || 0));
  const chartMax = Math.max(1, ...chartPoints);
  const avgCoins =
    chartPoints.length > 0
      ? Math.round(chartPoints.reduce((a, b) => a + b, 0) / chartPoints.length)
      : 0;
  const bestIdx = chartPoints.length
    ? chartPoints.reduce((best, n, i, arr) => (n >= arr[best]! ? i : best), 0)
    : -1;
  const bestLive = bestIdx >= 0 ? [...lives].reverse()[bestIdx] : null;
  const bestLabel = bestLive
    ? new Date(bestLive.endedAt || bestLive.startedAt).toLocaleDateString('es-CO', {
        day: 'numeric',
        month: 'short',
      })
    : '—';

  const w = 260;
  const h = 120;
  const padX = 8;
  const padY = 16;
  const coords = chartPoints.map((v, i) => {
    const x =
      chartPoints.length <= 1
        ? w / 2
        : padX + (i / (chartPoints.length - 1)) * (w - padX * 2);
    const y = h - padY - (v / chartMax) * (h - padY * 2);
    return { x, y, v };
  });
  const pathD =
    coords.length === 0
      ? ''
      : coords
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(' ');
  const peak = coords.reduce(
    (best, p) => (p.v >= best.v ? p : best),
    coords[0] || { x: 0, y: 0, v: 0 },
  );

  const suggestedGroups = publicGroups
    .filter((g) => !myGroups.some((m) => m.id === g.id))
    .slice(0, 4);

  return (
    <aside className="chat-scroll hidden w-[min(24%,19rem)] min-w-[230px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/5 bg-zinc-950/70 p-3 backdrop-blur-xl md:flex lg:min-w-[250px] lg:p-4">
      <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-3.5">
        <p className="text-sm font-bold text-white">Rendimiento de tus LIVE</p>
        <div className="mt-3 overflow-hidden rounded-xl bg-zinc-950/60 p-2">
          {coords.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-zinc-500">
              Cuando transmitas, verás tu curva de coins aquí.
            </p>
          ) : (
            <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full" role="img" aria-label="Coins por LIVE">
              <defs>
                <linearGradient id="actChartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
                </linearGradient>
              </defs>
              {pathD ? (
                <>
                  <path
                    d={`${pathD} L ${coords[coords.length - 1]!.x} ${h - padY} L ${coords[0]!.x} ${h - padY} Z`}
                    fill="url(#actChartFill)"
                  />
                  <path d={pathD} fill="none" stroke="#8B5CF6" strokeWidth="2.5" strokeLinejoin="round" />
                </>
              ) : null}
              {coords.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={p === peak ? 4.5 : 3} fill="#A78BFA" />
              ))}
              {peak.v > 0 ? (
                <g>
                  <rect
                    x={Math.min(Math.max(peak.x - 52, 4), w - 108)}
                    y={Math.max(peak.y - 28, 4)}
                    width="104"
                    height="22"
                    rx="6"
                    fill="#1f1635"
                    stroke="rgba(167,139,250,0.45)"
                  />
                  <text
                    x={Math.min(Math.max(peak.x - 52, 4), w - 108) + 52}
                    y={Math.max(peak.y - 28, 4) + 14}
                    textAnchor="middle"
                    fill="#E9D5FF"
                    fontSize="9"
                    fontWeight="700"
                  >
                    {peak.v.toLocaleString('es-CO')} coins
                  </text>
                </g>
              ) : null}
            </svg>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <p className="text-zinc-500">Promedio por LIVE</p>
            <p className="font-bold text-white">{avgCoins.toLocaleString('es-CO')} coins</p>
          </div>
          <div>
            <p className="text-zinc-500">Mejor día</p>
            <p className="font-bold text-white">{bestLabel}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-3.5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-white">Personas que quizá conozcas</p>
          <Link to="/buscar" className="text-[11px] font-semibold text-violet-400 hover:underline">
            Ver todas
          </Link>
        </div>
        {suggested.length === 0 ? (
          <p className="text-xs text-zinc-500">
            <Link to="/buscar" className="text-violet-400 underline">
              Busca amigos
            </Link>{' '}
            para descubrir personas.
          </p>
        ) : (
          <ul className="space-y-3">
            {suggested.map((user) => (
              <li key={user.uid || user.username} className="flex items-center gap-2.5">
                <Link
                  to={`/u/${encodeURIComponent(user.username)}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5"
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                    />
                  ) : (
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-800 text-xs font-bold text-violet-200">
                      {user.username.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-white">
                      {user.displayName || user.username}
                    </span>
                    <span className="block truncate text-[11px] text-zinc-500">@{user.username}</span>
                    <span className="block text-[10px] text-zinc-600">Sugerido para ti</span>
                  </span>
                </Link>
                <SuggestedCreatorActions
                  user={user}
                  profile={profile}
                  onFollow={onSuggestedFollow}
                  onIgnore={onSuggestedIgnore}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-3.5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-white">Grupos populares</p>
          <Link to="/grupos" className="text-[11px] font-semibold text-violet-400 hover:underline">
            Ver todos
          </Link>
        </div>
        {suggestedGroups.length === 0 ? (
          <p className="text-xs text-zinc-500">Pronto verás grupos sugeridos aquí.</p>
        ) : (
          <ul className="space-y-3">
            {suggestedGroups.map((g) => (
              <li key={g.id} className="flex items-center gap-2.5">
                <Link to="/grupos" className="flex min-w-0 flex-1 items-center gap-2.5">
                  <GroupRailAvatar name={g.name} photoUrl={g.photoUrl} />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-white">{g.name}</span>
                    <span className="text-[10px] text-zinc-500">
                      {formatCount(g.memberCount || 0)} miembros
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  disabled={joinBusy}
                  onClick={() => void onJoinGroup(g.id)}
                  className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                >
                  Unirse
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="px-1 pb-2 text-center text-[9px] text-zinc-600">
        © {new Date().getFullYear()} LiveBoom. Todos los derechos reservados.
      </p>
    </aside>
  );
}

/** Rail exclusivo de /transmitir (mockup). */
function TransmitRail() {
  const profile = useAuthStore((state) => state.profile);
  const [lives, setLives] = useState<LiveActivityEntry[]>([]);

  useEffect(() => {
    if (!profile?.firebaseUid) return;
    return listenLiveActivity(profile.firebaseUid, (list) => setLives(list.slice(0, 3)));
  }, [profile?.firebaseUid]);

  const tips = [
    { Icon: Sun, color: 'text-amber-300', text: 'Usa buena iluminación' },
    { Icon: Wifi, color: 'text-sky-300', text: 'Internet estable' },
    { Icon: MessageCircle, color: 'text-violet-300', text: 'Interactúa con tu audiencia' },
    { Icon: Megaphone, color: 'text-pink-300', text: 'Promociona tu live' },
    { Icon: Calendar, color: 'text-fuchsia-300', text: 'Sé constante' },
  ] as const;

  const inviteUrl = profile?.handle
    ? `https://liveboomapp.com/registro?ref=${encodeURIComponent(profile.handle)}`
    : 'https://liveboomapp.com/registro';

  return (
    <aside className="chat-scroll hidden w-[min(24%,19rem)] min-w-[230px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/5 bg-zinc-950/70 p-3 backdrop-blur-xl md:flex lg:min-w-[250px] lg:p-4">
      <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-3.5">
        <p className="text-sm font-bold text-white">Consejos para un gran live</p>
        <ul className="mt-3 space-y-3">
          {tips.map((t) => (
            <li key={t.text} className="flex items-center gap-2.5 text-xs text-zinc-300">
              <t.Icon size={16} className={`shrink-0 ${t.color}`} />
              {t.text}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-3.5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-white">Tus últimos lives</p>
          <Link to="/actividad" className="text-[11px] font-semibold text-cyan-400 hover:underline">
            Ver todos
          </Link>
        </div>
        {lives.length === 0 ? (
          <p className="text-xs text-zinc-500">Cuando transmitas, verás tu historial aquí.</p>
        ) : (
          <ul className="space-y-3">
            {lives.map((live) => (
              <li key={live.id} className="flex items-center gap-2.5">
                <span className="grid h-11 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-zinc-800 text-[10px] font-bold text-zinc-500">
                  LIVE
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-white">{live.title}</span>
                  <span className="text-[10px] text-zinc-500">
                    {formatLiveWhen(live.endedAt || live.startedAt)}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-zinc-500">
                  <Eye size={12} /> {formatViewers(live.viewers)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-700/45 via-fuchsia-700/25 to-[#14151c] p-3.5">
        <div className="flex items-start gap-2">
          <Gift className="mt-0.5 shrink-0 text-violet-200" size={22} />
          <div>
            <p className="text-sm font-bold text-white">¡Invita y gana más!</p>
            <p className="mt-1 text-[11px] leading-snug text-violet-100/80">
              Invita amigos y recibe recompensas en coins cuando se registren y comiencen a transmitir.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(inviteUrl).catch(() => undefined);
            window.open(
              `https://wa.me/?text=${encodeURIComponent(`Únete a LiveBoom: ${inviteUrl}`)}`,
              '_blank',
              'noopener',
            );
          }}
          className="mt-3 flex h-10 w-full items-center justify-center rounded-xl bg-violet-600 text-xs font-bold text-white"
        >
          Invitar amigos
        </button>
      </section>

      <p className="px-1 pb-2 text-center text-[9px] text-zinc-600">
        © {new Date().getFullYear()} LiveBoom. Todos los derechos reservados.
      </p>
    </aside>
  );
}

function formatRelative(ms: number) {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Hace ${hours} hora${hours === 1 ? '' : 's'}`;
  return `Hace ${Math.round(hours / 24)} d`;
}

/** Rail exclusivo de /mensajes (mockup): personas, grupos, actividad. */
function MessagesRail() {
  const profile = useAuthStore((state) => state.profile);
  const { suggested, onSuggestedFollow, onSuggestedIgnore } = useSuggestedCreators(5);
  const [publicGroups, setPublicGroups] = useState<LiveGroup[]>([]);
  const [myGroups, setMyGroups] = useState<LiveGroup[]>([]);
  const [joinBusy, setJoinBusy] = useState(false);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [alerts, setAlerts] = useState<Array<{ id: string; text: string; href: string; at: number }>>(
    [],
  );

  useEffect(() => listenPublicGroups(setPublicGroups), []);
  useEffect(() => {
    if (!profile?.firebaseUid) return;
    return listenMyGroups(profile.firebaseUid, setMyGroups);
  }, [profile?.firebaseUid]);
  useEffect(() => {
    if (!profile?.firebaseUid) return;
    return listenIncomingRequests(profile.firebaseUid, setRequests);
  }, [profile?.firebaseUid]);
  useEffect(() => {
    if (!profile?.firebaseUid) return;
    return listenLiveAlerts(profile.firebaseUid, setAlerts);
  }, [profile?.firebaseUid]);

  async function onJoinGroup(groupId: string) {
    if (!profile) return;
    setJoinBusy(true);
    try {
      const group = publicGroups.find((g) => g.id === groupId);
      if (group && group.isPublic === false) {
        await requestJoinGroup(groupId, {
          uid: profile.firebaseUid,
          username: profile.handle,
          displayName: profile.displayName || profile.handle,
        });
      } else {
        await joinGroup(groupId, {
          uid: profile.firebaseUid,
          username: profile.handle,
          displayName: profile.displayName || profile.handle,
          avatarUrl: profile.avatarUrl,
        });
      }
    } catch {
      // ignore
    } finally {
      setJoinBusy(false);
    }
  }

  const suggestedGroups = publicGroups
    .filter((g) => !myGroups.some((m) => m.id === g.id))
    .slice(0, 4);

  type ActivityItem = {
    id: string;
    text: string;
    href: string;
    at: number;
    kind: 'gift' | 'follow';
    avatarLetter: string;
  };

  const activity: ActivityItem[] = [
    ...alerts.slice(0, 4).map((a) => ({
      id: `alert-${a.id}`,
      text: a.text,
      href: a.href,
      at: a.at,
      kind: 'gift' as const,
      avatarLetter: (a.text.match(/@(\w+)/)?.[1] || 'L').slice(0, 1).toUpperCase(),
    })),
    ...requests.slice(0, 4).map((r) => ({
      id: `req-${r.id}`,
      text: `${r.displayName || r.username} comenzó a seguirte`,
      href: `/u/${encodeURIComponent(r.username)}`,
      at: new Date(r.createdAt).getTime() || Date.now(),
      kind: 'follow' as const,
      avatarLetter: (r.username || '?').slice(0, 1).toUpperCase(),
    })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 5);

  return (
    <aside className="chat-scroll hidden w-[min(24%,19rem)] min-w-[230px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/5 bg-zinc-950/70 p-3 backdrop-blur-xl md:flex lg:min-w-[250px] lg:p-4">
      <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-3.5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-white">Personas que quizá conozcas</p>
          <Link to="/buscar" className="shrink-0 text-[11px] font-semibold text-cyan-400 hover:underline">
            Ver todas
          </Link>
        </div>
        {suggested.length === 0 ? (
          <p className="text-xs text-zinc-500">
            <Link to="/buscar" className="text-cyan-400 underline">
              Busca amigos
            </Link>{' '}
            para descubrir personas.
          </p>
        ) : (
          <ul className="space-y-3">
            {suggested.map((user) => (
              <li key={user.uid || user.username} className="flex items-center gap-2.5">
                <Link
                  to={`/u/${encodeURIComponent(user.username)}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5"
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                    />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-800 text-xs font-bold text-cyan-200">
                      {user.username.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-white">
                      {user.displayName || user.username}
                    </span>
                    <span className="block truncate text-[11px] text-zinc-500">@{user.username}</span>
                    <span className="block text-[10px] text-zinc-600">Sugerido para ti</span>
                  </span>
                </Link>
                <SuggestedCreatorActions
                  user={user}
                  profile={profile}
                  onFollow={onSuggestedFollow}
                  onIgnore={onSuggestedIgnore}
                  loginClassName="shrink-0 rounded-full border border-cyan-400/70 px-2.5 py-1 text-[10px] font-bold text-cyan-300"
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-3.5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-white">Grupos sugeridos</p>
          <Link to="/grupos" className="shrink-0 text-[11px] font-semibold text-cyan-400 hover:underline">
            Ver todas
          </Link>
        </div>
        {suggestedGroups.length === 0 ? (
          <p className="text-xs text-zinc-500">Sin sugerencias por ahora.</p>
        ) : (
          <ul className="space-y-3">
            {suggestedGroups.map((g) => (
              <li key={g.id} className="flex items-center gap-2.5">
                <GroupRailAvatar name={g.name} photoUrl={g.photoUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-white">{g.name}</span>
                  <span className="text-[11px] text-zinc-500">
                    {formatCount(g.memberCount)} miembros
                  </span>
                </span>
                {profile ? (
                  <button
                    type="button"
                    disabled={joinBusy}
                    onClick={() => void onJoinGroup(g.id)}
                    className="shrink-0 rounded-full border border-cyan-400/70 px-2.5 py-1 text-[10px] font-bold text-cyan-300 hover:bg-cyan-400/10"
                  >
                    Unirse
                  </button>
                ) : (
                  <Link
                    to="/login"
                    className="shrink-0 rounded-full border border-cyan-400/70 px-2.5 py-1 text-[10px] font-bold text-cyan-300"
                  >
                    Unirse
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-3.5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-white">Actividad reciente</p>
          <Link
            to="/actividad"
            className="shrink-0 text-[11px] font-semibold text-cyan-400 hover:underline"
          >
            Ver todas
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="text-xs text-zinc-500">Cuando haya actividad, la verás aquí.</p>
        ) : (
          <ul className="space-y-3">
            {activity.map((item) => (
              <li key={item.id} className="flex items-start gap-2.5">
                <Link to={item.href} className="shrink-0">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-zinc-800 text-[11px] font-bold text-white ring-1 ring-white/10">
                    {item.avatarLetter}
                  </span>
                </Link>
                <span className="min-w-0 flex-1">
                  <Link to={item.href} className="block text-[11px] leading-snug text-zinc-300">
                    {item.text}
                  </Link>
                  <span className="text-[10px] text-zinc-600">{formatRelative(item.at)}</span>
                </span>
                {item.kind === 'gift' ? (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-fuchsia-400/40 text-fuchsia-300">
                    <Gift size={14} />
                  </span>
                ) : (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-cyan-400/40 text-cyan-300">
                    <UserPlus size={14} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="px-1 pb-2 text-center text-[9px] text-zinc-600">
        © {new Date().getFullYear()} LiveBoom. Todos los derechos reservados.
      </p>
    </aside>
  );
}

/** Rail exclusivo de /perfil/editar (mockup Configuración). */
function SettingsRail() {
  const profile = useAuthStore((state) => state.profile);
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const [xp, setXp] = useState(0);

  useEffect(() => {
    if (!profile?.firebaseUid) return;
    void fetchLevelXp(profile.firebaseUid).then(setXp).catch(() => setXp(0));
  }, [profile?.firebaseUid]);

  const levelInfo = levelFromXp(xp);
  const nextAt = xpNeededForNext(xp);
  const remaining = xpToNextLevel(xp);
  const lastLogin = (() => {
    const ms = firebaseUser?.metadata?.lastSignInTime
      ? Date.parse(firebaseUser.metadata.lastSignInTime)
      : NaN;
    if (Number.isNaN(ms)) return 'Hoy';
    const d = new Date(ms);
    const today = new Date();
    const sameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    const time = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
    return sameDay ? `Hoy, ${time}` : d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  })();

  return (
    <aside className="chat-scroll hidden w-[min(24%,19rem)] min-w-[230px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/5 bg-zinc-950/70 p-3 backdrop-blur-xl md:flex lg:min-w-[250px] lg:p-4">
      <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-3.5">
        <p className="text-sm font-bold text-white">Resumen de cuenta</p>
        <ul className="mt-3 space-y-3">
          <li className="flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-500">Mi nivel</span>
            <span className="inline-flex items-center gap-1 text-sm font-bold text-violet-300">
              <ShieldCheck size={14} /> {levelInfo.title} · Nv {levelInfo.level}
            </span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-500">Coins actuales</span>
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-white">
              <span className="text-amber-400">●</span>
              {(profile?.coinsBalance ?? 0).toLocaleString('es-CO')}
            </span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-500">Diamantes</span>
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-white">
              <span className="text-fuchsia-400">◆</span> 0
            </span>
          </li>
          <li>
            <Link
              to={profile ? `/u/${encodeURIComponent(profile.handle)}` : '/perfil'}
              className="flex items-center justify-between gap-2 rounded-lg py-0.5 hover:bg-white/[0.03]"
            >
              <span className="text-xs text-zinc-500">Puntos de experiencia</span>
              <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-300">
                <Star size={13} className="text-orange-400" />
                {xp.toLocaleString('es-CO')} XP
                <ChevronRight size={14} className="text-zinc-600" />
              </span>
            </Link>
            <p className="mt-1 text-[10px] text-zinc-600">
              {remaining > 0
                ? `Faltan ${remaining.toLocaleString('es-CO')} XP para el siguiente (${nextAt.toLocaleString('es-CO')} XP)`
                : 'Nivel PRO — máximo alcanzado'}
            </p>
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-3.5">
        <p className="mb-3 text-sm font-bold text-white">Seguridad rápida</p>
        <ul className="space-y-3">
          <li className="flex items-center gap-2.5">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-white">Verificación en dos pasos</span>
              <span className="text-[11px] font-medium text-emerald-400">
                {firebaseUser?.emailVerified ? 'Activa (correo)' : 'Pendiente'}
              </span>
            </span>
            <ChevronRight size={14} className="text-zinc-600" />
          </li>
          <li className="flex items-center gap-2.5">
            <Laptop size={16} className="shrink-0 text-violet-400" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-white">Sesiones activas</span>
              <span className="text-[11px] text-zinc-500">1 dispositivo</span>
            </span>
            <ChevronRight size={14} className="text-zinc-600" />
          </li>
          <li className="flex items-center gap-2.5">
            <Calendar size={16} className="shrink-0 text-sky-400" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-white">Último inicio de sesión</span>
              <span className="text-[11px] text-zinc-500">{lastLogin}</span>
            </span>
            <ChevronRight size={14} className="text-zinc-600" />
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-3.5">
        <p className="mb-2 text-sm font-bold text-white">Soporte y ayuda</p>
        <ul className="space-y-1">
          {(
            [
              { to: '/legal/terminos', label: 'Centro de ayuda', icon: HelpCircle },
              { to: '/legal/terminos', label: 'Términos y condiciones', icon: HelpCircle },
              { to: '/legal/privacidad', label: 'Política de privacidad', icon: ShieldCheck },
              { to: '/mensajes', label: 'Reportar un problema', icon: HelpCircle },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.label}>
                <Link
                  to={item.to}
                  className="flex items-center gap-2 rounded-lg px-1 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04]"
                >
                  <Icon size={14} className="text-zinc-500" />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  <ChevronRight size={14} className="text-zinc-600" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-700/50 via-fuchsia-700/30 to-[#14151c] p-3.5">
        <div className="flex items-start gap-2">
          <Gift className="mt-0.5 shrink-0 text-violet-200" size={22} />
          <div>
            <p className="text-sm font-bold text-white">¡Gana más coins!</p>
            <p className="mt-1 text-[11px] leading-snug text-violet-100/80">
              Participa en eventos y desafíos especiales dentro de LiveBoom.
            </p>
          </div>
        </div>
        <Link
          to="/explorar"
          className="mt-3 flex h-10 w-full items-center justify-center rounded-xl bg-violet-600 text-xs font-bold text-white"
        >
          Explorar eventos
        </Link>
      </section>

      <p className="px-1 pb-2 text-center text-[9px] text-zinc-600">
        © {new Date().getFullYear()} LiveBoom. Todos los derechos reservados.
      </p>
    </aside>
  );
}

function adHref(ad: PromotionAd) {
  const raw = ad.linkUrl.trim();
  if (!raw) return `/u/${encodeURIComponent(ad.ownerUsername)}`;
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) return raw;
  return `/${raw}`;
}

function DiscoveryRail() {
  const profile = useAuthStore((state) => state.profile);
  const locationPath = useLocation().pathname;
  const onGroups = locationPath.startsWith('/grupos');
  const [location, setLocation] = useState<PrivateUserLocation | null>(null);
  const [ads, setAds] = useState<PromotionAd[]>([]);
  const [trends, setTrends] = useState<TrendTag[]>([]);
  const { suggested, onSuggestedFollow, onSuggestedIgnore } = useSuggestedCreators(5);
  const [publicGroups, setPublicGroups] = useState<LiveGroup[]>([]);
  const [myGroups, setMyGroups] = useState<LiveGroup[]>([]);
  const [joinBusy, setJoinBusy] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(() => !locationPromptDismissed());

  useEffect(() => {
    if (!profile?.firebaseUid) return;
    void fetchPrivateLocation(profile.firebaseUid)
      .then((geo) => {
        setLocation(geo);
        if (geo) setShowPrompt(false);
      })
      .catch(() => undefined);
  }, [profile?.firebaseUid]);

  useEffect(() => listenActivePromotions(location?.regionId || 'nacional', setAds), [location?.regionId]);
  useEffect(() => listenTopTrends(setTrends), []);
  useEffect(() => {
    if (!onGroups) return;
    return listenPublicGroups(setPublicGroups);
  }, [onGroups]);
  useEffect(() => {
    if (!onGroups || !profile?.firebaseUid) return;
    return listenMyGroups(profile.firebaseUid, setMyGroups);
  }, [onGroups, profile?.firebaseUid]);

  async function shareLocation() {
    if (!profile) return;
    setLocBusy(true);
    try {
      const coords = await requestBrowserLocation();
      const saved = await savePrivateLocation(profile.firebaseUid, coords);
      setLocation(saved);
      setShowPrompt(false);
    } catch {
      // ignore
    } finally {
      setLocBusy(false);
    }
  }

  async function onJoinGroup(groupId: string) {
    if (!profile) return;
    setJoinBusy(true);
    try {
      const group = publicGroups.find((g) => g.id === groupId);
      if (group && group.isPublic === false) {
        await requestJoinGroup(groupId, {
          uid: profile.firebaseUid,
          username: profile.handle,
          displayName: profile.displayName || profile.handle,
        });
      } else {
        await joinGroup(groupId, {
          uid: profile.firebaseUid,
          username: profile.handle,
          displayName: profile.displayName || profile.handle,
          avatarUrl: profile.avatarUrl,
        });
      }
    } catch {
      // ignore
    } finally {
      setJoinBusy(false);
    }
  }

  const featuredAd = ads[0];
  const suggestedGroups = publicGroups
    .filter((g) => !myGroups.some((m) => m.id === g.id))
    .slice(0, 5);
  const activityGroups = publicGroups.slice(0, 3);

  return (
    <>
      <aside className="chat-scroll hidden w-[min(24%,19rem)] min-w-[230px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/5 bg-zinc-950/70 p-3 backdrop-blur-xl md:flex lg:min-w-[250px] lg:p-4">
        {/* Arrow 1: Crear tu grupo — arriba de Publicidad */}
        {onGroups ? (
          <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-3.5">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 shrink-0 text-violet-400" size={16} />
              <div>
                <p className="text-sm font-bold text-white">Crear tu grupo</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Reúne a tu comunidad y empieza a crecer hoy.
                </p>
              </div>
            </div>
            <Link
              to="/grupos?tab=crear"
              className={`mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-full text-xs font-bold ${JOIN_BTN}`}
            >
              <Plus size={14} /> Crear grupo
            </Link>
          </section>
        ) : null}

        <section className="lb-card overflow-hidden rounded-2xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-600/40 via-violet-700/30 to-pink-600/20 p-3.5 shadow-[0_0_28px_rgba(168,85,247,0.18)]">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-fuchsia-200">
            <Megaphone size={12} /> Publicidad
          </p>
          {featuredAd ? (
            <Link to={adHref(featuredAd)} className="mt-2 block">
              {featuredAd.mediaUrl && !featuredAd.mediaUrl.match(/\.(mp4|webm)/i) ? (
                <img
                  src={featuredAd.mediaUrl}
                  alt=""
                  className="mb-2 aspect-[16/9] w-full rounded-xl object-cover"
                />
              ) : null}
              <p className="text-sm font-bold text-white">{featuredAd.title}</p>
              <p className="mt-1 text-[11px] text-zinc-300">@{featuredAd.ownerUsername}</p>
            </Link>
          ) : (
            <>
              <p className="mt-2 text-sm font-bold leading-snug text-white">
                Recarga Coins y obtén hasta 20% EXTRA
              </p>
              <p className="mt-1 text-[11px] text-zinc-300">Promociona tu live o marca por región.</p>
            </>
          )}
          <div className="mt-3 flex flex-col gap-2">
            <Link
              to="/billetera"
              className="lb-gradient-btn grid min-h-10 place-items-center rounded-xl px-3 text-xs font-bold text-white"
            >
              Recargar ahora
            </Link>
            {profile ? (
              <button
                type="button"
                onClick={() => setPromoteOpen(true)}
                className="text-center text-[11px] font-semibold text-fuchsia-200 hover:underline"
              >
                Promocionar anuncio
              </button>
            ) : null}
          </div>
        </section>

        {/* Arrow 2: Impulsa — entre Publicidad y Tu zona */}
        {onGroups ? (
          <section className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/15 via-[#14151c] to-violet-600/20 p-3.5">
            <Rocket className="absolute -right-2 top-1 h-14 w-14 rotate-12 text-orange-400/40" />
            <p className="text-sm font-bold text-white">Impulsa tu grupo</p>
            <p className="mt-1 text-[11px] text-zinc-400">Destácalo y llega a más personas.</p>
            <button
              type="button"
              onClick={() => setPromoteOpen(true)}
              className={`mt-3 flex h-9 w-full items-center justify-center rounded-full text-xs font-bold ${JOIN_BTN}`}
            >
              Promocionar
            </button>
          </section>
        ) : null}

        {profile ? (
          <section className="lb-panel rounded-2xl p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              <MapPin size={12} /> Tu zona
            </p>
            {location ? (
              <p className="mt-1.5 text-xs font-semibold text-cyan-200">
                {location.city ? `${location.city} · ` : ''}
                {location.regionLabel}
              </p>
            ) : showPrompt ? (
              <button
                type="button"
                disabled={locBusy}
                onClick={() => void shareLocation()}
                className="mt-2 min-h-9 w-full rounded-lg border border-cyan-400/30 text-[11px] font-semibold text-cyan-200"
              >
                {locBusy ? '…' : 'Compartir ubicación'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowPrompt(true)}
                className="mt-2 text-[11px] text-zinc-500 hover:text-zinc-300"
              >
                Activar ubicación
              </button>
            )}
            {showPrompt && !location ? (
              <button
                type="button"
                onClick={() => {
                  dismissLocationPrompt();
                  setShowPrompt(false);
                }}
                className="mt-1 text-[10px] text-zinc-600"
              >
                Ahora no
              </button>
            ) : null}
          </section>
        ) : null}

        <section className="lb-panel rounded-2xl p-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              <Hash size={12} className="text-fuchsia-300" /> Tendencias
            </p>
            <Link to="/tendencias" className="text-[10px] font-semibold text-cyan-400 hover:underline">
              Ver más
            </Link>
          </div>
          {trends.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-500">Publica con #hashtags para crear tendencias.</p>
          ) : (
            <ol className="mt-2 space-y-1.5">
              {trends.slice(0, 5).map((t, i) => (
                <li key={t.tag}>
                  <Link
                    to={`/tendencias?tag=${encodeURIComponent(t.tag)}`}
                    className="lb-card flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-white/5"
                  >
                    <span className="w-4 text-[11px] font-bold text-zinc-600">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">#{t.tag}</span>
                    <span className="text-[10px] text-zinc-500">{t.count} pub.</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Arrow 3: Grupos sugeridos + Actividad — entre Tendencias y Creadores */}
        {onGroups ? (
          <>
            <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                  Grupos sugeridos
                </p>
                <Link to="/grupos" className="text-[10px] font-semibold text-cyan-400">
                  Ver todos
                </Link>
              </div>
              {suggestedGroups.length === 0 ? (
                <p className="text-xs text-zinc-500">Sin sugerencias por ahora.</p>
              ) : (
                <ul className="space-y-2.5">
                  {suggestedGroups.map((g) => (
                    <li key={g.id} className="flex items-center gap-2">
                      <GroupRailAvatar name={g.name} photoUrl={g.photoUrl} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-white">{g.name}</span>
                        <span className="text-[10px] text-zinc-500">
                          {formatCount(g.memberCount)} miembros
                        </span>
                      </span>
                      {profile ? (
                        <button
                          type="button"
                          disabled={joinBusy}
                          onClick={() => void onJoinGroup(g.id)}
                          className="shrink-0 rounded-full border border-cyan-400/50 px-2.5 py-1 text-[10px] font-bold text-cyan-300"
                        >
                          Unirse
                        </button>
                      ) : (
                        <Link
                          to="/login"
                          className="shrink-0 rounded-full border border-cyan-400/50 px-2.5 py-1 text-[10px] font-bold text-cyan-300"
                        >
                          Unirse
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#14151c] p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                Actividad reciente
              </p>
              {activityGroups.length === 0 ? (
                <p className="text-xs text-zinc-500">Cuando haya actividad en grupos, la verás aquí.</p>
              ) : (
                <ul className="space-y-2.5">
                  {activityGroups.map((g, i) => (
                    <li key={`act-${g.id}`} className="flex items-start gap-2">
                      <span className="relative shrink-0">
                        <GroupRailAvatar name={g.ownerUsername || g.name} />
                        <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-[#14151c] bg-emerald-400" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] leading-snug text-zinc-300">
                          <span className="font-semibold text-white">
                            @{g.ownerUsername || 'boomer'}
                          </span>{' '}
                          {i % 2 === 0 ? 'creó' : 'impulsó'}{' '}
                          <span className="font-semibold text-cyan-300">{g.name}</span>
                        </span>
                        <span className="text-[10px] text-zinc-600">Hace {i + 2} min</span>
                      </span>
                      <Users size={14} className="mt-0.5 shrink-0 text-zinc-600" />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}

        <section className="lb-panel rounded-2xl p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            <UserPlus size={12} className="text-cyan-300" /> Creadores sugeridos
          </p>
          {suggested.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-500">
              <Link to="/buscar" className="text-cyan-400 underline">
                Busca amigos
              </Link>{' '}
              para descubrir creadores.
            </p>
          ) : (
            <ul className="mt-2 space-y-2.5">
              {suggested.map((user) => (
                <li key={user.uid || user.username} className="flex items-center gap-2">
                  <Link
                    to={`/u/${encodeURIComponent(user.username)}`}
                    className="flex min-w-0 flex-1 items-center gap-2"
                  >
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                      />
                    ) : (
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-800 text-xs font-bold text-cyan-200">
                        {user.username.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-white">
                        {user.displayName || user.username}
                      </span>
                      <span className="block truncate text-[10px] text-zinc-500">@{user.username}</span>
                    </span>
                  </Link>
                  <SuggestedCreatorActions
                    user={user}
                    profile={profile}
                    onFollow={onSuggestedFollow}
                    onIgnore={onSuggestedIgnore}
                    variant="default"
                    loginClassName="shrink-0 rounded-full bg-fuchsia-500/20 px-2.5 py-1 text-[10px] font-bold text-fuchsia-200"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lb-card rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-cyan-500/20 via-violet-600/15 to-fuchsia-500/10 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-bold text-white">
            <Sparkles size={14} className="text-cyan-300" /> Gana premios en cada LIVE
          </p>
          <p className="mt-1 text-[11px] text-zinc-400">Envía regalos y súbete al top de la sala.</p>
          <Link
            to="/explorar"
            className="mt-3 inline-flex min-h-9 items-center rounded-lg bg-white/10 px-3 text-[11px] font-bold text-cyan-200"
          >
            Conoce más
          </Link>
        </section>

        <p className="px-1 pb-2 text-center text-[9px] text-zinc-600">
          © {new Date().getFullYear()} LiveBoom. Todos los derechos reservados.
        </p>
      </aside>

      <div className="fixed inset-x-0 bottom-[calc(var(--lb-bottom-nav-h)+var(--lb-safe-bottom))] z-30 pl-[max(0.75rem,var(--lb-safe-left))] pr-[max(0.75rem,var(--lb-safe-right))] md:hidden">
        <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-2 shadow-xl backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {profile ? (
            <button
              type="button"
              onClick={() => setPromoteOpen(true)}
              className="min-h-10 shrink-0 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-3 py-2 text-[11px] font-bold text-zinc-950"
            >
              Promocionar
            </button>
          ) : null}
          <Link
            to="/tendencias"
            className="min-h-10 shrink-0 rounded-xl bg-zinc-900 px-3 py-2 text-[11px] font-semibold text-fuchsia-200"
          >
            # Tendencias
          </Link>
          <Link
            to="/grupos"
            className="min-h-10 shrink-0 rounded-xl bg-zinc-900 px-3 py-2 text-[11px] font-semibold text-cyan-200"
          >
            Grupos
          </Link>
        </div>
      </div>

      {promoteOpen ? (
        <PromoteAdsModal
          defaultRegionId={location?.regionId || 'nacional'}
          onClose={() => setPromoteOpen(false)}
        />
      ) : null}
    </>
  );
}

/** @deprecated */
export { NotificationBell } from '../social/NotificationBell';
