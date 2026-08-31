import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  MessageCircle,
  Mic2,
  MoreVertical,
  Palette,
  QrCode,
  Search,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { LIVE_CATEGORIES, categoryLabel } from '../lib/categories';
import { api } from '../lib/api';
import { playFriendRequestAlert } from '../lib/alertSound';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  listenIncomingRequests,
  listenOutgoingRequests,
  rejectFriendRequest,
  sendFriendRequest,
  type FriendRequest,
} from '../lib/socialFirestore';
import { profileHref } from '../lib/profileFirestore';
import { ignoreSuggestedCreator, readIgnoredSuggestionUids } from '../lib/ignoredSuggestions';
import { useAuthStore } from '../store/authStore';

type SearchUser = {
  uid?: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  category?: string | null;
  friendshipStatus: 'none' | 'friends' | 'pending_sent' | 'pending_received' | 'blocked' | 'self';
  isFollowing: boolean;
};

const GRADIENT = 'bg-[linear-gradient(90deg,#8B5CF6,#EC4899)]';
const GRADIENT_BTN = `${GRADIENT} text-white shadow-[0_8px_24px_rgba(139,92,246,0.35)]`;

const CAT_ICONS: Record<string, typeof Mic2> = {
  musica: Mic2,
  gaming: Gamepad2,
  charla: MessageCircle,
  deportes: Trophy,
  arte: Palette,
  educacion: BookOpen,
};

function roleBadge(category?: string | null) {
  if (!category) return 'Creador';
  const map: Record<string, string> = {
    musica: 'Músico',
    gaming: 'Gamer',
    charla: 'Streamer',
    deportes: 'Deportes',
    arte: 'Artista',
    educacion: 'Educación',
    humor: 'Humor',
    otro: 'Creador',
  };
  return map[category] || categoryLabel(category);
}

function badgeTone(category?: string | null) {
  const map: Record<string, string> = {
    musica: 'bg-fuchsia-500/20 text-fuchsia-300',
    gaming: 'bg-violet-500/20 text-violet-300',
    charla: 'bg-sky-500/20 text-sky-300',
    deportes: 'bg-emerald-500/20 text-emerald-300',
    arte: 'bg-amber-500/20 text-amber-300',
    educacion: 'bg-cyan-500/20 text-cyan-300',
  };
  return (category && map[category]) || 'bg-violet-500/20 text-violet-300';
}

function Avatar({
  url,
  name,
  size = 48,
  ring,
}: {
  url: string | null;
  name: string;
  size?: number;
  ring?: string;
}) {
  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-full bg-zinc-800 ${ring || ''}`}
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
        <span className="grid h-full w-full place-items-center text-sm font-bold text-violet-200">
          {(name || '?').slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}

export function SearchView() {
  const profile = useAuthStore((state) => state.profile);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [showMoreCats, setShowMoreCats] = useState(false);
  const [results, setResults] = useState<SearchUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [reqTab, setReqTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [reqBusy, setReqBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const [reqPage, setReqPage] = useState(0);
  const [qrNote, setQrNote] = useState<string | null>(null);
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
          setReqTab('incoming');
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

  useEffect(() => {
    if (!profile?.firebaseUid) {
      setDismissed(new Set());
      return;
    }
    setDismissed(new Set(readIgnoredSuggestionUids(profile.firebaseUid)));
  }, [profile?.firebaseUid]);

  useEffect(() => {
    if (!profile) {
      setResults([]);
      return;
    }
    const value = query.trim();
    const timer = window.setTimeout(() => {
      setBusy(true);
      void (async () => {
        try {
          if (value.length >= 1) {
            const { searchFirestoreUsers } = await import('../lib/profileFirestore');
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
  }, [query, category, profile?.firebaseUid]);

  const primaryCats = LIVE_CATEGORIES.filter((c) =>
    ['musica', 'gaming', 'charla', 'deportes', 'arte', 'educacion'].includes(c.id),
  );
  const extraCats = LIVE_CATEGORIES.filter((c) => !primaryCats.some((p) => p.id === c.id));

  const requestList = reqTab === 'incoming' ? incoming : outgoing;
  const perPage = 2;
  const maxPage = Math.max(0, Math.ceil(requestList.length / perPage) - 1);
  const pageItems = requestList.slice(reqPage * perPage, reqPage * perPage + perPage);

  useEffect(() => {
    setReqPage(0);
  }, [reqTab, incoming.length, outgoing.length]);

  const suggestions = useMemo(
    () =>
      results
        .filter((u) => u.username !== profile?.handle)
        .filter((u) => !dismissed.has(u.uid || u.username))
        .filter((u) => u.friendshipStatus === 'none' || !u.friendshipStatus)
        .slice(0, 5),
    [results, dismissed, profile?.handle],
  );

  const searching = query.trim().length >= 1;

  async function accept(user: FriendRequest) {
    if (!profile) return;
    setReqBusy(user.id);
    setActionError(null);
    try {
      await acceptFriendRequest(profile.firebaseUid, user.uid || user.username);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo aceptar');
    } finally {
      setReqBusy(null);
    }
  }

  async function reject(user: FriendRequest) {
    if (!profile) return;
    setReqBusy(user.id);
    setActionError(null);
    try {
      await rejectFriendRequest(profile.firebaseUid, user.uid || user.username);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo rechazar');
    } finally {
      setReqBusy(null);
    }
  }

  async function cancel(user: FriendRequest) {
    if (!profile) return;
    setReqBusy(user.id);
    setActionError(null);
    try {
      await cancelFriendRequest(profile.firebaseUid, user.uid || user.username);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo cancelar');
    } finally {
      setReqBusy(null);
    }
  }

  function dismissSuggestion(user: SearchUser) {
    const key = user.uid || user.username;
    if (profile?.firebaseUid && user.uid) {
      ignoreSuggestedCreator(profile.firebaseUid, user.uid);
    }
    setDismissed((prev) => new Set(prev).add(key));
  }

  async function followSuggestion(user: SearchUser) {
    if (!profile) return;
    const key = user.uid || user.username;
    setFollowBusy(key);
    try {
      await sendFriendRequest(profile, user.username, user.uid);
      setResults((list) =>
        list.map((u) =>
          (u.uid || u.username) === key ? { ...u, friendshipStatus: 'pending_sent' } : u,
        ),
      );
    } catch {
      // ignore
    } finally {
      setFollowBusy(null);
    }
  }

  if (!profile) {
    return (
      <div className="lb-page mx-auto w-full max-w-3xl">
        <div className="rounded-2xl border border-white/[0.06] bg-[#14151c] p-6 text-center text-sm text-zinc-400">
          <Link to="/login" className="text-violet-400 underline">
            Inicia sesión
          </Link>{' '}
          o{' '}
          <Link to="/registro" className="text-violet-400 underline">
            crea una cuenta
          </Link>{' '}
          para buscar amigos.
        </div>
      </div>
    );
  }

  return (
    <div className="lb-page mx-auto flex w-full max-w-3xl flex-col gap-4 pb-2 sm:gap-5">
      {/* Header */}
      <header className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#14151c] p-4 sm:rounded-3xl sm:p-6">
        <div className="pointer-events-none absolute -right-6 -top-10 h-44 w-44 rounded-full bg-violet-600/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-16 h-28 w-28 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-xl">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-violet-400">
              <Users size={12} />
              Comunidad
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Buscar amigos
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              Encuentra creadores por @usuario, nombre, biografía o categoría. Abajo ves las
              solicitudes recibidas y las que tú enviaste, en tiempo real.
            </p>
          </div>
          <div className="relative hidden h-24 w-36 shrink-0 md:block">
            <span className="absolute left-2 top-2 h-14 w-14 overflow-hidden rounded-full ring-2 ring-violet-400/50">
              <span className="grid h-full w-full place-items-center bg-gradient-to-br from-violet-600 to-fuchsia-500 text-lg font-black text-white">
                LB
              </span>
            </span>
            <span className="absolute right-1 top-0 h-12 w-12 overflow-hidden rounded-full ring-2 ring-cyan-400/40">
              <span className="grid h-full w-full place-items-center bg-gradient-to-br from-cyan-500 to-violet-600 text-sm font-black text-white">
                ★
              </span>
            </span>
            <span className="absolute bottom-0 left-10 h-11 w-11 overflow-hidden rounded-full ring-2 ring-fuchsia-400/40">
              <span className="grid h-full w-full place-items-center bg-gradient-to-br from-fuchsia-500 to-amber-400 text-sm font-black text-white">
                ♥
              </span>
            </span>
          </div>
        </div>
      </header>

      {/* Search + QR */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <label className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-[#14151c] px-3.5">
          <Search size={18} className="shrink-0 text-violet-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por @usuario, nombre o bio..."
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
          />
          {busy ? <span className="text-[10px] text-zinc-600">…</span> : null}
        </label>
        <button
          type="button"
          onClick={() => {
            setQrNote('El escáner QR llegará pronto. Mientras tanto busca por @usuario.');
            window.setTimeout(() => setQrNote(null), 3500);
          }}
          className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-[#14151c] px-4 text-sm font-semibold text-zinc-200 hover:border-white/20 sm:w-auto"
        >
          <QrCode size={18} className="text-violet-300" />
          Escanear QR
        </button>
      </div>
      {qrNote ? <p className="text-xs text-violet-300">{qrNote}</p> : null}

      {/* Category chips */}
      <div className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setCategory('')}
          className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
            !category
              ? 'bg-violet-600/20 text-violet-200 ring-1 ring-violet-400/60'
              : 'text-zinc-400 ring-1 ring-white/10 hover:text-white'
          }`}
        >
          Todas
        </button>
        {primaryCats.map((item) => {
          const Icon = CAT_ICONS[item.id] || Sparkles;
          const active = category === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setCategory(active ? '' : item.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                active
                  ? 'bg-violet-600/20 text-violet-200 ring-1 ring-violet-400/60'
                  : 'text-zinc-400 ring-1 ring-white/10 hover:text-white'
              }`}
            >
              <img
                src={item.icon}
                alt=""
                className="h-4 w-4 object-contain [mix-blend-mode:screen]"
                draggable={false}
              />
              <span className="sr-only">
                <Icon size={12} />
              </span>
              {item.label === 'Charla' ? 'Charlas' : item.label}
            </button>
          );
        })}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowMoreCats((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-xs font-semibold text-zinc-400 ring-1 ring-white/10 hover:text-white"
          >
            Más
            <ChevronDown size={14} />
          </button>
          {showMoreCats ? (
            <div className="absolute right-0 z-20 mt-1 min-w-[9rem] overflow-hidden rounded-xl border border-white/10 bg-zinc-950 py-1 shadow-xl">
              {extraCats.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setCategory(item.id);
                    setShowMoreCats(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/5"
                >
                  <img src={item.icon} alt="" className="h-4 w-4 object-contain" />
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Search results when typing */}
      {searching ? (
        <section className="rounded-2xl border border-white/[0.06] bg-[#14151c] p-4">
          <h2 className="text-sm font-bold text-white">Resultados</h2>
          {busy ? <p className="mt-2 text-xs text-zinc-500">Buscando…</p> : null}
          {!busy && results.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-500">
              Sin resultados. Prueba con @usuario o cambia de categoría.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {results.map((user) => (
                <li
                  key={user.uid || user.username}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-zinc-950/50 px-3 py-2.5"
                >
                  <Link
                    to={profileHref(user.username, user.uid)}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <Avatar url={user.avatarUrl} name={user.username} size={44} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">
                        {user.displayName || user.username}
                      </span>
                      <span className="block truncate text-xs text-zinc-500">@{user.username}</span>
                      {user.category ? (
                        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeTone(user.category)}`}>
                          {roleBadge(user.category)}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                  <button
                    type="button"
                    disabled={followBusy === (user.uid || user.username) || user.friendshipStatus === 'pending_sent' || user.friendshipStatus === 'friends'}
                    onClick={() => void followSuggestion(user)}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-bold disabled:opacity-60 ${
                      user.friendshipStatus === 'friends'
                        ? 'border border-white/15 text-zinc-400'
                        : user.friendshipStatus === 'pending_sent'
                          ? 'border border-white/15 text-zinc-400'
                          : GRADIENT_BTN
                    }`}
                  >
                    {user.friendshipStatus === 'friends'
                      ? 'Amigos'
                      : user.friendshipStatus === 'pending_sent'
                        ? 'Pendiente'
                        : 'Seguir'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* Friend requests */}
      <section className="rounded-2xl border border-white/[0.06] bg-[#14151c] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-violet-400" />
            <h2 className="text-sm font-bold text-white">Solicitudes de amistad</h2>
            {incoming.length > 0 ? (
              <span className="rounded-full bg-fuchsia-500/90 px-2 py-0.5 text-[10px] font-black text-white">
                {incoming.length} nueva{incoming.length === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={reqPage <= 0}
              onClick={() => setReqPage((p) => Math.max(0, p - 1))}
              className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-white/5 disabled:opacity-30"
              aria-label="Anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              disabled={reqPage >= maxPage}
              onClick={() => setReqPage((p) => Math.min(maxPage, p + 1))}
              className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-white/5 disabled:opacity-30"
              aria-label="Siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setReqTab('incoming')}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
              reqTab === 'incoming'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Recibidas ({incoming.length})
          </button>
          <button
            type="button"
            onClick={() => setReqTab('outgoing')}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
              reqTab === 'outgoing'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Enviadas ({outgoing.length})
          </button>
        </div>

        {actionError ? (
          <p className="mt-2 text-xs text-fuchsia-300">{actionError}</p>
        ) : null}

        {pageItems.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-xs text-zinc-500">
            {reqTab === 'incoming'
              ? 'Nadie te ha enviado solicitud todavía.'
              : 'No has enviado solicitudes pendientes.'}
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {pageItems.map((user) => (
              <li
                key={user.id}
                className="relative rounded-2xl border border-white/[0.06] bg-zinc-950/60 p-3.5"
              >
                <button
                  type="button"
                  className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-zinc-600 hover:bg-white/5 hover:text-zinc-300"
                  aria-label="Más"
                >
                  <MoreVertical size={14} />
                </button>
                <Link
                  to={profileHref(user.username, user.uid)}
                  className="flex items-start gap-3 pr-6"
                >
                  <Avatar
                    url={user.avatarUrl}
                    name={user.username}
                    size={56}
                    ring="ring-2 ring-fuchsia-400/50"
                  />
                  <span className="min-w-0 pt-0.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-white">
                        {user.displayName || user.username}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeTone(null)}`}>
                        Creador
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-zinc-500">
                      @{user.username}
                    </span>
                    <span className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-500">
                      <span className="flex -space-x-1.5">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="h-5 w-5 rounded-full bg-zinc-700 ring-2 ring-[#0a0a0b]"
                          />
                        ))}
                      </span>
                      Amigos en común
                    </span>
                  </span>
                </Link>
                <div className="mt-3 flex gap-2">
                  {reqTab === 'incoming' ? (
                    <>
                      <button
                        type="button"
                        disabled={reqBusy === user.id}
                        onClick={() => void accept(user)}
                        className={`h-9 flex-1 rounded-full text-xs font-bold disabled:opacity-60 ${GRADIENT_BTN}`}
                      >
                        Aceptar
                      </button>
                      <button
                        type="button"
                        disabled={reqBusy === user.id}
                        onClick={() => void reject(user)}
                        className="h-9 flex-1 rounded-full border border-white/10 bg-zinc-900 text-xs font-bold text-zinc-300 disabled:opacity-60"
                      >
                        Rechazar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={reqBusy === user.id}
                      onClick={() => void cancel(user)}
                      className="h-9 w-full rounded-full border border-white/10 bg-zinc-900 text-xs font-bold text-zinc-300 disabled:opacity-60"
                    >
                      Cancelar solicitud
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Suggestions */}
      {!searching ? (
        <section>
          <div className="mb-1 flex items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-white">Personas que podrían gustarte</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Sugerencias basadas en tus intereses, grupos y actividad.
              </p>
            </div>
            <Link to="/explorar" className="shrink-0 text-[11px] font-semibold text-violet-400 hover:underline">
              Ver todas
            </Link>
          </div>
          {suggestions.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-white/10 bg-[#14151c] px-4 py-8 text-center text-xs text-zinc-500">
              {busy ? 'Cargando sugerencias…' : 'Aún no hay sugerencias. Prueba buscar por @usuario.'}
            </p>
          ) : (
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {suggestions.map((user) => {
                const key = user.uid || user.username;
                return (
                  <article
                    key={key}
                    className="relative flex w-[9.5rem] shrink-0 flex-col items-center rounded-2xl border border-white/[0.06] bg-[#14151c] p-3.5"
                  >
                    <button
                      type="button"
                      onClick={() => dismissSuggestion(user)}
                      className="absolute right-2 top-2 rounded-full border border-rose-500/70 bg-rose-600/25 px-2 py-1 text-[10px] font-bold text-rose-300 transition hover:bg-rose-600/40 hover:text-white"
                      aria-label="Ignorar sugerencia"
                    >
                      Ignorar
                    </button>
                    <Link to={profileHref(user.username, user.uid)} className="flex flex-col items-center">
                      <Avatar
                        url={user.avatarUrl}
                        name={user.username}
                        size={64}
                        ring="ring-2 ring-violet-400/40"
                      />
                      <p className="mt-2.5 w-full truncate text-center text-xs font-bold text-white">
                        {user.displayName || user.username}
                      </p>
                      <p className="w-full truncate text-center text-[11px] text-zinc-500">
                        @{user.username}
                      </p>
                      <span
                        className={`mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeTone(user.category)}`}
                      >
                        {roleBadge(user.category)}
                      </span>
                    </Link>
                    <p className="mt-2 flex items-center gap-1 text-[10px] text-zinc-600">
                      <span className="flex -space-x-1">
                        <span className="h-4 w-4 rounded-full bg-zinc-700 ring-1 ring-[#14151c]" />
                        <span className="h-4 w-4 rounded-full bg-zinc-600 ring-1 ring-[#14151c]" />
                      </span>
                      en común
                    </p>
                    <button
                      type="button"
                      disabled={followBusy === key || user.friendshipStatus === 'pending_sent'}
                      onClick={() => void followSuggestion(user)}
                      className={`mt-3 flex h-9 w-full items-center justify-center rounded-full text-[11px] font-bold disabled:opacity-60 ${GRADIENT_BTN}`}
                    >
                      {user.friendshipStatus === 'pending_sent' ? 'Pendiente' : 'Seguir'}
                    </button>
                  </article>
                );
              })}
              <Link
                to="/grupos"
                className="relative flex w-[9.5rem] shrink-0 flex-col items-center justify-center rounded-2xl border border-dashed border-violet-500/30 bg-violet-500/5 p-3.5 text-center"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-violet-500/20 text-violet-300">
                  <Mic2 size={22} />
                </span>
                <p className="mt-2 text-xs font-bold text-white">Comunidades</p>
                <p className="mt-1 text-[10px] text-zinc-500">Explora grupos por tu rol</p>
                <span className="mt-3 text-[11px] font-semibold text-violet-300">Ver grupos →</span>
              </Link>
            </div>
          )}
        </section>
      ) : null}

      {/* Bottom CTA */}
      <section className="flex flex-col items-start gap-3 rounded-2xl border border-white/[0.06] bg-[#14151c] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-300">
            <Zap size={18} />
          </span>
          <div>
            <p className="text-sm font-bold text-white">Conéctate con más personas</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Explora comunidades, asiste a LIVE y participa en chats para ampliar tu red.
            </p>
          </div>
        </div>
        <Link
          to="/grupos"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(90deg,#06B6D4,#8B5CF6)] px-4 text-xs font-bold text-white"
        >
          Explorar comunidades
        </Link>
      </section>
    </div>
  );
}
