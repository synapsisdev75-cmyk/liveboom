import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Eye,
  Gift,
  MapPin,
  MessageCircle,
  Play,
  Search,
  Trophy,
  Users,
} from 'lucide-react';
import { LiveAvatarRow } from '../components/feed/LiveAvatarRow';
import { FlashBoomRow } from '../components/feed/FlashBoomRow';
import { ReelFeedViewer } from '../components/feed/ReelFeedViewer';
import { ReelsRow } from '../components/feed/ReelsRow';
import { CategoryChips } from '../components/search/CategoryChips';
import { BoomLikeButton } from '../components/social/BoomButtons';
import { NotificationBell } from '../components/social/NotificationBell';
import { ReactionList } from '../components/social/PostReactionButtons';
import { PostComments, PostVideoPlayer } from '../components/social/PostVideoPlayer';
import { ShareContentButton } from '../components/social/ShareContentButton';
import { buildPostShareUrl } from '../lib/shareContent';
import { PostPhotoViewer } from '../components/social/PostPhotoViewer';
import { POST_EMOJI_SIZE } from '../lib/liveboomEmojis';
import { EmojiText } from '../components/social/EmojiText';
import { type SocialPost } from '../components/social/SocialPostCard';
import { apiPublic } from '../lib/api';
import { categoryLabel } from '../lib/categories';
import { listenPublicGroups, type LiveGroup } from '../lib/groupsFirestore';
import {
  listenActiveLiveRooms,
  reconcileLiveFeedWithApi,
  type ActiveLiveFeedItem,
} from '../lib/liveGiftsFirestore';
import {
  listenPostComments,
  listenPostReactions,
  listenHomeFeed,
  listenRecentPosts,
  listenActiveStories,
  getPostById,
  setPostReaction,
  type FsPost,
  type PostReactionUser,
} from '../lib/socialFirestore';
import { fetchPrivateLocation } from '../lib/userLocation';
import { isStoryActive, isStoryPost } from '../lib/storyLifecycle';
import { useAuthStore } from '../store/authStore';

type FeedTab = 'para_ti' | 'siguiendo' | 'cerca';

function toSocial(post: FsPost): SocialPost {
  return {
    id: post.id,
    authorUid: post.authorUid,
    authorUsername: post.username,
    type: post.type,
    caption: post.caption,
    mediaUrl: post.mediaUrl,
    visibility: post.visibility,
    createdAt: post.createdAt,
    likes: post.likes,
    dislikes: 0,
    viewerReaction: null,
  };
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(n);
}

/** Post destacado: video con autoplay + comentarios directos. */
function FeaturedFeedCard({
  post,
  live,
}: {
  post: SocialPost;
  live: ActiveLiveFeedItem | null;
}) {
  const profile = useAuthStore((state) => state.profile);
  const href = live
    ? `/stream/${encodeURIComponent(live.username)}`
    : `/u/${encodeURIComponent(post.authorUsername)}`;
  const [likes, setLikes] = useState(post.likes || 0);
  const [dislikes, setDislikes] = useState(0);
  const [viewerReaction, setViewerReaction] = useState<'like' | 'dislike' | null>(null);
  const [likers, setLikers] = useState<PostReactionUser[]>([]);
  const [dislikers, setDislikers] = useState<PostReactionUser[]>([]);
  const [showLikers, setShowLikers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    return listenPostReactions(post.id, profile?.firebaseUid, (stats) => {
      setLikes(stats.likes);
      setDislikes(stats.dislikes);
      setViewerReaction(stats.viewerReaction);
      setLikers(stats.likers);
      setDislikers(stats.dislikers);
    });
  }, [post.id, profile?.firebaseUid]);

  useEffect(() => {
    return listenPostComments(post.id, (list) => setCommentCount(list.length));
  }, [post.id]);

  async function toggleLike() {
    if (!profile) return;
    setBusy(true);
    try {
      await setPostReaction(
        post.id,
        profile.firebaseUid,
        viewerReaction === 'like' ? null : 'like',
        {
          username: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
      );
    } finally {
      setBusy(false);
    }
  }

  async function react(reaction: 'like' | 'dislike') {
    if (!profile) return;
    setBusy(true);
    try {
      await setPostReaction(
        post.id,
        profile.firebaseUid,
        viewerReaction === reaction ? null : reaction,
        {
          username: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="lb-card lb-panel overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 px-3.5 pt-3.5 sm:px-4 sm:pt-4">
        <Link to={`/u/${encodeURIComponent(post.authorUsername)}`} className="shrink-0">
          <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-zinc-800 ring-2 ring-fuchsia-400/40">
            <span className="text-sm font-black text-fuchsia-100">
              {post.authorUsername.slice(0, 1).toUpperCase()}
            </span>
          </span>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              to={`/u/${encodeURIComponent(post.authorUsername)}`}
              className="truncate text-sm font-bold text-white hover:text-cyan-300"
            >
              @{post.authorUsername}
            </Link>
            <span className="text-[11px] text-zinc-500">{timeAgo(post.createdAt)}</span>
          </div>
        </div>
        {live ? (
          <Link
            to={`/stream/${encodeURIComponent(live.username)}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-fuchsia-600/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-[0_0_16px_rgba(217,70,239,0.45)]"
          >
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
            En vivo
            <span className="inline-flex items-center gap-0.5 opacity-90">
              <Eye size={10} />
              {formatCount(live.viewers || 0)}
            </span>
          </Link>
        ) : null}
      </div>

      {post.mediaUrl && post.type === 'video' ? (
        <div className="mt-3">
          <PostVideoPlayer
            src={post.mediaUrl}
            postId={post.id}
            authorUid={post.authorUid}
            authorUsername={post.authorUsername}
            caption={post.caption}
            likes={likes}
            dislikes={dislikes}
            viewerReaction={viewerReaction}
            likers={likers}
            dislikers={dislikers}
            busy={busy}
            onReact={(r) => void react(r)}
          />
        </div>
      ) : post.mediaUrl && post.type === 'photo' ? (
        <div className="mt-3">
          <PostPhotoViewer
            src={post.mediaUrl}
            caption={post.caption}
            postId={post.id}
            authorUsername={post.authorUsername}
            authorUid={post.authorUid}
            aspect="video"
          />
        </div>
      ) : (
        <Link to={href} className="relative mt-3 block aspect-video overflow-hidden bg-zinc-950">
          <div className="grid h-full place-items-center bg-gradient-to-br from-fuchsia-900/40 via-zinc-900 to-cyan-900/30">
            <Play className="h-14 w-14 text-white/80" fill="currentColor" />
          </div>
        </Link>
      )}

      {post.caption && post.type !== 'video' && post.type !== 'photo' ? (
        <p className="px-3.5 pt-3 text-sm leading-relaxed text-zinc-200 sm:px-4">
          <EmojiText text={post.caption} size={POST_EMOJI_SIZE} />
        </p>
      ) : null}

      <div className="relative flex flex-wrap items-center gap-1 border-t border-white/5 px-2 py-2.5 sm:gap-2 sm:px-3">
        <span className="relative inline-flex items-center">
          <BoomLikeButton
            active={viewerReaction === 'like'}
            busy={busy}
            count={likes}
            size="sm"
            onToggle={() => void toggleLike()}
            onShowWho={() => {
              setShowLikers((v) => !v);
            }}
          />
          {showLikers ? (
            <ReactionList title="Les gustó (Boom)" users={likers} onClose={() => setShowLikers(false)} />
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/5"
        >
          <MessageCircle size={15} className="text-cyan-300" />
          {commentCount > 0 ? commentCount : 'Comentar'}
        </button>
        <Link
          to={live ? `/stream/${encodeURIComponent(live.username)}` : '/billetera'}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-amber-200 hover:bg-white/5"
        >
          <Gift size={15} />
          Regalar
        </Link>
        <ShareContentButton
          url={buildPostShareUrl(post.authorUsername, post.id, post.authorUid)}
          title={`@${post.authorUsername} en LiveBoom`}
          text={post.caption || `Mira esta publicación de @${post.authorUsername} en LiveBoom`}
          mediaUrl={post.mediaUrl}
          mediaType={post.type === 'video' ? 'video' : post.type === 'photo' ? 'photo' : 'text'}
          className="ml-auto"
        />
      </div>

      {showComments || commentCount > 0 ? (
        <PostComments
          postId={post.id}
          authorUid={post.authorUid}
          defaultOpen={showComments}
        />
      ) : null}
    </article>
  );
}

function GruposTopCard({ groups }: { groups: LiveGroup[] }) {
  return (
    <aside className="lb-panel flex h-full flex-col rounded-2xl p-3.5 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">
          <Trophy size={13} className="text-amber-300" />
          Grupos top
        </p>
        <Link to="/grupos" className="text-[10px] font-semibold text-cyan-400 hover:underline">
          Ver todos
        </Link>
      </div>
      {groups.length === 0 ? (
        <p className="mt-4 text-xs text-zinc-500">
          Aún no hay grupos.{' '}
          <Link to="/grupos" className="text-cyan-400 underline">
            Crea el primero
          </Link>
        </p>
      ) : (
        <ul className="mt-3 flex-1 space-y-2">
          {groups.slice(0, 5).map((g, i) => (
            <li key={g.id}>
              <Link
                to="/grupos"
                className="lb-card flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 hover:bg-white/5"
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-black ${
                    i === 0
                      ? 'bg-amber-400/25 text-amber-300'
                      : i === 1
                        ? 'bg-zinc-300/20 text-zinc-200'
                        : i === 2
                          ? 'bg-orange-400/25 text-orange-300'
                          : 'bg-white/5 text-zinc-500'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-white">{g.name}</span>
                  <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                    <Users size={10} />
                    {formatCount(g.memberCount)} miembros
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

export function HomeView() {
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const [streams, setStreams] = useState<ActiveLiveFeedItem[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [groups, setGroups] = useState<LiveGroup[]>([]);
  const [category, setCategory] = useState('');
  const [tab, setTab] = useState<FeedTab>('para_ti');
  const [regionLabel, setRegionLabel] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [flashViewer, setFlashViewer] = useState<{
    reels: Array<{
      id: string;
      username: string;
      authorUid: string;
      caption: string;
      mediaUrl: string;
      mediaType?: 'photo' | 'video';
    }>;
    index: number;
    storyMode: boolean;
  } | null>(null);

  function reelFromPost(post: FsPost) {
    return {
      id: post.id,
      username: post.username,
      authorUid: post.authorUid,
      caption: post.caption || (isStoryPost(post) ? 'Flash Boom' : 'Boom Clip'),
      mediaUrl: post.mediaUrl || '',
      mediaType: post.type === 'photo' ? ('photo' as const) : ('video' as const),
    };
  }

  function clearDeepLinkParams(keys: string[]) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const key of keys) next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  function flashReelsFromPosts(posts: FsPost[]) {
    return posts
      .filter((post) => post.mediaUrl && isStoryPost(post) && isStoryActive(post))
      .map(reelFromPost);
  }

  function openFlashViewer(posts: FsPost[], postId: string) {
    const reels = flashReelsFromPosts(posts);
    const index = reels.findIndex((reel) => reel.id === postId);
    if (index < 0) return false;
    setFlashViewer({ reels, index, storyMode: true });
    clearDeepLinkParams(['flash', 'u']);
    return true;
  }

  function openClipViewer(post: FsPost) {
    if (!post.mediaUrl || post.type !== 'video') return false;
    setFlashViewer({ reels: [reelFromPost(post)], index: 0, storyMode: false });
    clearDeepLinkParams(['clip', 'u', 'uid']);
    return true;
  }

  const flashPostId = searchParams.get('flash');
  const clipPostId = searchParams.get('clip');

  useEffect(() => {
    return listenActiveLiveRooms((list) => setStreams(list));
  }, []);

  useEffect(() => listenPublicGroups(setGroups), []);

  useEffect(() => {
    let cancelled = false;
    const verify = () => {
      void apiPublic<{ streams?: { username?: string }[] }>('/api/stream/live')
        .then((data) => {
          if (cancelled) return;
          const names = (data.streams || [])
            .map((item) => String(item.username || '').trim())
            .filter(Boolean);
          return reconcileLiveFeedWithApi(names);
        })
        .catch(() => undefined);
    };
    verify();
    const timer = window.setInterval(verify, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!profile) {
      setPosts([]);
      return;
    }
    if (tab === 'cerca') {
      return listenRecentPosts((list) => setPosts(list.map(toSocial)));
    }
    return listenHomeFeed(profile.firebaseUid, tab, (list) => setPosts(list.map(toSocial)));
  }, [profile?.firebaseUid, tab]);

  useEffect(() => {
    if (!profile) {
      setFlashViewer(null);
      return;
    }
    if (!flashPostId) return;

    let cancelled = false;
    const authorHint = searchParams.get('u')?.trim() || '';

    function fallbackToProfile(post: FsPost) {
      const username = authorHint || post.username;
      navigate(
        `/u/${encodeURIComponent(username)}?post=${encodeURIComponent(post.id)}&uid=${encodeURIComponent(post.authorUid)}`,
        { replace: true },
      );
    }

    void getPostById(flashPostId).then((post) => {
      if (cancelled || !post) return;
      if (openFlashViewer([post], flashPostId)) return;
      fallbackToProfile(post);
    });

    const unsub = listenActiveStories((list) => {
      if (cancelled) return;
      if (openFlashViewer(list, flashPostId)) return;
      const target = list.find((post) => post.id === flashPostId);
      if (target) fallbackToProfile(target);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [flashPostId, profile?.firebaseUid, navigate]);

  useEffect(() => {
    if (!profile) return;
    if (!clipPostId) return;

    let cancelled = false;
    const authorHint = searchParams.get('u')?.trim() || '';
    const uidHint = searchParams.get('uid')?.trim() || '';

    function fallbackToProfile(post: FsPost) {
      const username = authorHint || post.username;
      navigate(
        `/u/${encodeURIComponent(username)}?post=${encodeURIComponent(post.id)}&uid=${encodeURIComponent(uidHint || post.authorUid)}`,
        { replace: true },
      );
    }

    void getPostById(clipPostId).then((post) => {
      if (cancelled || !post) return;
      if (openClipViewer(post)) return;
      fallbackToProfile(post);
    });

    return () => {
      cancelled = true;
    };
  }, [clipPostId, profile?.firebaseUid, navigate, searchParams]);

  useEffect(() => {
    if (!profile?.firebaseUid) return;
    void fetchPrivateLocation(profile.firebaseUid)
      .then((geo) => setRegionLabel(geo?.regionLabel || null))
      .catch(() => undefined);
  }, [profile?.firebaseUid]);

  const visibleLives = useMemo(() => {
    if (!category) return streams;
    return streams.filter((stream) => (stream.category || 'otro') === category);
  }, [streams, category]);

  const featured = posts[0] ?? null;
  const liveForFeatured = useMemo(() => {
    if (!featured) return streams[0] ?? null;
    return (
      streams.find(
        (s) => s.username.toLowerCase() === featured.authorUsername.toLowerCase(),
      ) ?? null
    );
  }, [featured, streams]);

  const tabs: { id: FeedTab; label: string }[] = [
    { id: 'para_ti', label: 'Para ti' },
    { id: 'siguiendo', label: 'Siguiendo' },
    { id: 'cerca', label: 'Cerca de ti' },
  ];

  return (
    <div className="lb-page flex min-w-0 flex-col gap-4 sm:gap-5">
      {/* 1. Tabs + buscar + campana */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-0.5 sm:gap-1">
          {tabs.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`relative px-2.5 py-2 text-sm font-semibold transition sm:px-3 ${
                  active ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {item.label}
                {active ? (
                  <span className="absolute inset-x-2 -bottom-0.5 h-[3px] rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-400" />
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:max-w-xs sm:flex-none">
          <Link
            to="/buscar"
            className="inline-flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-white/10 bg-zinc-900/80 px-3 text-xs text-zinc-400 transition hover:border-cyan-400/40 hover:text-cyan-200 sm:w-52 sm:flex-none"
          >
            <Search size={14} className="shrink-0" />
            <span className="truncate">Buscar...</span>
          </Link>
          {profile ? <NotificationBell /> : null}
        </div>
      </header>

      {tab === 'cerca' ? (
        <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <MapPin size={12} />
          {regionLabel
            ? `Mostrando contenido cercano a ${regionLabel}`
            : 'Comparte tu ubicación en el panel derecho para personalizar esta pestaña.'}
        </p>
      ) : null}

      {/* 2. LIVE EN LÍNEA */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">
            Live en línea
          </h2>
          <Link
            to="/explorar"
            className="text-[11px] font-semibold text-cyan-400 hover:underline"
          >
            Ver todos los LIVE →
          </Link>
        </div>
        <LiveAvatarRow streams={visibleLives} />
      </section>

      {/* 2. Categorías */}
      <CategoryChips value={category} onChange={setCategory} />

      {/* 3. Flash Boom — historias 24 h */}
      {profile ? <FlashBoomRow /> : null}

      {/* 4. Boom Clip — reels públicos */}
      {profile ? <ReelsRow title="Boom Clip" mode="reels" /> : null}

      {tab === 'siguiendo' && !profile ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
          <Link to="/login" className="text-cyan-400 underline">
            Inicia sesión
          </Link>{' '}
          para ver a quienes sigues.
        </p>
      ) : null}

      {/* 5. Posts del feed */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,15.5rem)] lg:items-start">
        <div className="min-w-0">
          {!profile ? (
            <div className="lb-panel rounded-2xl px-4 py-10 text-center text-sm text-zinc-500">
              <Link to="/login" className="text-cyan-400 underline">
                Inicia sesión
              </Link>{' '}
              para ver el feed Para ti.
            </div>
          ) : featured ? (
            <FeaturedFeedCard post={featured} live={liveForFeatured} />
          ) : tab === 'siguiendo' ? (
            <div className="lb-panel rounded-2xl px-4 py-10 text-center text-sm text-zinc-500">
              Aún no hay publicaciones de quienes sigues. Cuando tus amigos publiquen fotos, textos o
              Boom Clip, aparecerán aquí. Los Flash Boom siguen en la fila de arriba.
            </div>
          ) : streams[0] ? (
            <LiveHeroCard stream={streams[0]} />
          ) : (
            <div className="lb-panel rounded-2xl px-4 py-10 text-center text-sm text-zinc-500">
              Aún no hay posts. Publica desde Crear o espera un LIVE.
            </div>
          )}
        </div>
        <div className="hidden lg:block">
          <GruposTopCard groups={groups} />
        </div>
      </section>

      {/* Grupos top en móvil (debajo del post) */}
      <div className="lg:hidden">
        <GruposTopCard groups={groups} />
      </div>

      {/* Más posts del feed */}
      {profile && posts.length > 1 ? (
        <section className="space-y-3">
          {posts.slice(1, 6).map((post) => {
            const live = streams.find(
              (s) => s.username.toLowerCase() === post.authorUsername.toLowerCase(),
            );
            return <FeaturedFeedCard key={post.id} post={post} live={live ?? null} />;
          })}
        </section>
      ) : null}

      {flashViewer ? (
        <ReelFeedViewer
          reels={flashViewer.reels}
          initialIndex={flashViewer.index}
          storyMode={flashViewer.storyMode}
          onClose={() => setFlashViewer(null)}
        />
      ) : null}
    </div>
  );
}

function LiveHeroCard({ stream }: { stream: ActiveLiveFeedItem }) {
  const name = stream.displayName || stream.username;
  return (
    <article className="lb-card lb-panel overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 px-3.5 pt-3.5 sm:px-4 sm:pt-4">
        <span className="live-ring grid h-10 w-10 place-items-center rounded-full p-[2px]">
          <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-zinc-900 text-sm font-black text-fuchsia-100">
            {stream.avatarUrl ? (
              <img src={stream.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              name.slice(0, 1).toUpperCase()
            )}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{name}</p>
          <p className="text-[11px] text-zinc-500">
            @{stream.username} · {categoryLabel(stream.category || 'otro')}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-600 px-2.5 py-1 text-[10px] font-black uppercase text-white">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
          En vivo · {formatCount(stream.viewers || 0)}
        </span>
      </div>
      <Link
        to={`/stream/${encodeURIComponent(stream.username)}`}
        className="relative mt-3 block aspect-video bg-gradient-to-br from-fuchsia-900/50 via-zinc-900 to-cyan-900/40"
      >
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-white/20 ring-1 ring-white/40 backdrop-blur-sm">
            <Play className="ml-0.5 h-7 w-7 text-white" fill="currentColor" />
          </span>
        </span>
      </Link>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-xs font-semibold text-zinc-300">
        <span className="inline-flex items-center gap-1">
          <img src="/reactions/boom-off.png" alt="" className="h-4 w-4 object-contain brightness-125" /> —
        </span>
        <Link
          to={`/stream/${encodeURIComponent(stream.username)}`}
          className="inline-flex items-center gap-1 text-amber-200"
        >
          <Gift size={14} /> Regalar
        </Link>
      </div>
    </article>
  );
}
