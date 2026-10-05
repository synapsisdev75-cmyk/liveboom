import { Search, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserAvatar } from '../components/profile/UserAvatar';
import { FollowButton } from '../components/social/SocialPostCard';
import { useT } from '../i18n';
import { searchFirestoreUsersByName } from '../lib/profileFirestore';
import { listCreatorsPage, listFollowing, type FriendChip } from '../lib/socialFirestore';
import { useAuthStore } from '../store/authStore';

const PAGE_SIZE = 30;

function CreatorRow({
  user,
  following,
  loggedIn,
}: {
  user: FriendChip;
  following: boolean;
  loggedIn: boolean;
}) {
  const t = useT();
  return (
    <li className="flex min-h-[4.25rem] items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#14151c] p-3">
      <Link
        to={`/u/${encodeURIComponent(user.username)}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <UserAvatar
          src={user.avatarUrl}
          username={user.username}
          displayName={user.displayName}
          size={44}
          ringClassName="ring-1 ring-white/10"
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">
            {user.displayName || user.username}
          </span>
          <span className="block truncate text-xs text-zinc-500">@{user.username}</span>
        </span>
      </Link>
      {loggedIn ? (
        <div className="shrink-0">
          <FollowButton
            username={user.username}
            targetUid={user.uid}
            targetHint={user}
            initialFollowing={following}
            isOwnProfile={false}
            variant="default"
            size="sm"
          />
        </div>
      ) : (
        <Link
          to="/login"
          className="grid min-h-9 shrink-0 place-items-center rounded-full bg-fuchsia-500/20 px-3 text-xs font-bold text-fuchsia-200"
        >
          {t('actions.follow')}
        </Link>
      )}
    </li>
  );
}

/** Todos los creadores de LiveBoom (destino de «Ver todos» en Creadores destacados). */
export function CreatorsView() {
  const profile = useAuthStore((state) => state.profile);
  const viewerUid = profile?.firebaseUid ?? null;
  const [creators, setCreators] = useState<FriendChip[]>([]);
  const cursorRef = useRef<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendChip[] | null>(null);
  const [searching, setSearching] = useState(false);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const generationRef = useRef(0);

  const loadMore = useCallback(
    async (reset = false) => {
      if (reset) {
        generationRef.current += 1;
        cursorRef.current = null;
      } else if (loadingRef.current) {
        return;
      }
      const generation = generationRef.current;
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const page = await listCreatorsPage(viewerUid, cursorRef.current, PAGE_SIZE);
        if (generation !== generationRef.current) return;
        setCreators((current) => {
          const base = reset ? [] : current;
          const seen = new Set(base.map((user) => user.uid));
          return [...base, ...page.creators.filter((user) => !seen.has(user.uid))];
        });
        cursorRef.current = page.nextCursor;
        setHasMore(Boolean(page.nextCursor));
      } catch {
        if (generation === generationRef.current) setError('No se pudieron cargar los creadores.');
      } finally {
        if (generation === generationRef.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [viewerUid],
  );

  useEffect(() => {
    void loadMore(true);
  }, [loadMore]);

  useEffect(() => {
    if (!viewerUid) {
      setFollowingIds(new Set());
      return;
    }
    let cancelled = false;
    void listFollowing(viewerUid)
      .then((list) => {
        if (!cancelled) setFollowingIds(new Set(list.map((user) => user.uid)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [viewerUid]);

  useEffect(() => {
    const value = query.trim();
    if (!value) {
      setResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchFirestoreUsersByName(value)
        .then((users) => {
          if (cancelled) return;
          setResults(
            users
              .filter((user) => user.username && user.firebaseUid !== viewerUid)
              .map((user) => ({
                uid: user.firebaseUid,
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
              })),
          );
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, viewerUid]);

  const showingSearch = results !== null || searching;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || showingSearch || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, showingSearch, hasMore]);

  const list = useMemo(() => (showingSearch ? results || [] : creators), [showingSearch, results, creators]);

  return (
    <div className="lb-page mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="rounded-2xl bg-zinc-900 p-4 sm:p-6">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
          <Users size={14} /> Creadores
        </p>
        <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">Todos los creadores</h1>
        <p className="mt-1 text-sm text-zinc-400">Descubre y sigue a los creadores de LiveBoom.</p>
        <label className="mt-4 flex h-12 w-full min-w-0 items-center gap-2.5 rounded-2xl border border-white/10 bg-black/30 px-3.5 focus-within:border-violet-400/60">
          <Search size={18} className="shrink-0 text-zinc-500" />
          <input
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar creador por nombre o @usuario"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
          />
        </label>
      </div>

      {error && !showingSearch ? (
        <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 bg-[#14151c] px-4 py-10 text-center text-sm text-zinc-500">
          {showingSearch
            ? searching
              ? 'Buscando…'
              : 'No encontramos creadores con ese nombre.'
            : loading
              ? 'Cargando creadores…'
              : 'Pronto verás creadores aquí.'}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((user) => (
            <CreatorRow
              key={user.uid || user.username}
              user={user}
              following={followingIds.has(user.uid)}
              loggedIn={Boolean(profile)}
            />
          ))}
        </ul>
      )}

      {!showingSearch && hasMore ? (
        <div ref={sentinelRef} className="flex justify-center pb-4">
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadMore()}
            className="min-h-11 rounded-full border border-white/10 bg-zinc-900 px-5 text-sm font-semibold text-zinc-200 disabled:opacity-60"
          >
            {loading ? 'Cargando…' : 'Cargar más'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
