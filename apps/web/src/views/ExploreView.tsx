import {
  BadgeCheck,
  Camera,
  ChevronDown,
  ChevronRight,
  Gamepad2,
  Gift,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  Palette,
  PenLine,
  Play,
  Search,
  Smile,
  Trophy,
  Users,
  Video,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LiveAvatarRow } from '../components/feed/LiveAvatarRow';
import { AutoplayMuteVideo } from '../components/feed/AutoplayMuteVideo';
import { ReelFeedViewer } from '../components/feed/ReelFeedViewer';
import { PostPhotoViewer } from '../components/social/PostPhotoViewer';
import { type SocialPost } from '../components/social/SocialPostCard';
import { LIVE_CATEGORIES, categoryLabel } from '../lib/categories';
import { listenPublicGroups, type LiveGroup } from '../lib/groupsFirestore';
import {
  listenActiveLiveRooms,
  type ActiveLiveFeedItem,
} from '../lib/liveGiftsFirestore';
import {
  listenPostComments,
  listenPostReactions,
  listenRecentPosts,
  type FsPost,
} from '../lib/socialFirestore';
import { useAuthStore } from '../store/authStore';
import { useVideoAspect } from '../lib/videoAspect';

type MediaFilter = 'all' | 'photo' | 'video' | 'text';
type SortMode = 'recientes' | 'populares' | 'vistas';

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

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(n);
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

function scrollRow(ref: React.RefObject<HTMLDivElement | null>, dir: 1 | -1) {
  const el = ref.current;
  if (!el) return;
  el.scrollBy({ left: dir * Math.min(320, el.clientWidth * 0.75), behavior: 'smooth' });
}

type Chip = {
  id: string;
  label: string;
  icon?: ReactNode;
  media?: MediaFilter;
  category?: string;
};

const MEDIA_CHIPS: Chip[] = [
  { id: 'all', label: 'Todo', media: 'all' },
  { id: 'photo', label: 'Fotos', media: 'photo', icon: <Camera size={13} /> },
  { id: 'video', label: 'Reels / Video', media: 'video', icon: <Play size={13} /> },
  { id: 'text', label: 'Posts', media: 'text', icon: <PenLine size={13} /> },
];

const CATEGORY_ICONS: Record<string, ReactNode> = {
  gaming: <Gamepad2 size={13} />,
  charla: <MessageCircle size={13} />,
  arte: <Palette size={13} />,
  educacion: <ImageIcon size={13} />,
  humor: <Smile size={13} />,
  musica: <Video size={13} />,
};

function ExplorePostCard({
  post,
  onOpenVideo,
}: {
  post: SocialPost;
  onOpenVideo?: (postId: string) => void;
}) {
  const profile = useAuthStore((state) => state.profile);
  const href = `/u/${encodeURIComponent(post.authorUsername)}`;
  const isVideo = Boolean(post.mediaUrl && post.type === 'video');
  const isPhoto = Boolean(post.mediaUrl && post.type === 'photo');
  const isExpandable = isVideo || isPhoto;
  const videoAspect = useVideoAspect(isVideo ? post.mediaUrl : null);
  const [open, setOpen] = useState(false);
  const [likes, setLikes] = useState(post.likes || 0);
  const [commentCount, setCommentCount] = useState(0);

  useEffect(() => {
    if (!isExpandable) return;
    return listenPostReactions(post.id, profile?.firebaseUid, (stats) => {
      setLikes(stats.likes);
    });
  }, [isExpandable, post.id, profile?.firebaseUid]);

  useEffect(() => {
    if (!isExpandable) return;
    return listenPostComments(post.id, (list) => setCommentCount(list.length));
  }, [isExpandable, post.id]);

  function openCard() {
    if (isVideo) onOpenVideo?.(post.id);
    else setOpen(true);
  }

  const media = (
    <>
      {post.mediaUrl && post.type === 'video' ? (
        <AutoplayMuteVideo
          src={post.mediaUrl}
          className={`h-full w-full transition duration-500 group-hover:scale-[1.02] ${
            videoAspect.isLandscape ? 'object-contain' : 'object-cover'
          }`}
        />
      ) : post.mediaUrl && post.type === 'photo' ? (
        <img
          src={post.mediaUrl}
          alt=""
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="grid h-full place-items-center bg-gradient-to-br from-fuchsia-900/40 via-zinc-900 to-cyan-900/30 p-4 text-center">
          <p className="line-clamp-5 text-sm font-medium text-zinc-200">{post.caption || 'Publicación'}</p>
        </div>
      )}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/75" />

      <div className="absolute inset-x-0 top-0 flex items-center gap-2 p-3">
        <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-zinc-800 text-[10px] font-bold text-cyan-200 ring-1 ring-white/20">
          {post.authorUsername.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-white">
          @{post.authorUsername}
        </span>
        <BadgeCheck size={14} className="shrink-0 text-sky-400" />
        <span className="shrink-0 text-[10px] text-zinc-300">{timeAgo(post.createdAt)}</span>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 p-3 text-[11px] font-semibold text-white">
        <span className="inline-flex items-center gap-1">
          <Heart size={14} className="text-rose-400" fill="currentColor" />
          {formatCount(likes || post.likes || 0)}
        </span>
        <span className="inline-flex items-center gap-1 text-zinc-200">
          <MessageCircle size={14} />
          {commentCount > 0 ? commentCount : 'Comentar'}
        </span>
        <Gift size={15} className="ml-auto text-amber-300" />
      </div>
    </>
  );

  const cardAspect = isVideo
    ? videoAspect.isReady
      ? ''
      : videoAspect.aspectClass
    : 'aspect-[4/5]';
  const cardStyle = isVideo && videoAspect.isReady ? videoAspect.aspectStyle : undefined;
  const cardWidth = isVideo && videoAspect.isLandscape ? 'w-[12.5rem] sm:w-[14rem]' : 'w-[11.5rem] sm:w-[13rem]';

  return (
    <>
      {isExpandable ? (
        <button
          type="button"
          onClick={openCard}
          className={`lb-card group relative ${cardAspect} ${cardWidth} shrink-0 overflow-hidden rounded-3xl bg-zinc-900 text-left ring-1 ring-white/10`}
          style={cardStyle}
        >
          {media}
        </button>
      ) : (
        <Link
          to={href}
          className={`lb-card group relative ${cardAspect} ${cardWidth} shrink-0 overflow-hidden rounded-3xl bg-zinc-900 ring-1 ring-white/10`}
          style={cardStyle}
        >
          {media}
        </Link>
      )}

      {open && post.mediaUrl && isPhoto ? (
        <PostPhotoViewer
          src={post.mediaUrl}
          caption={post.caption}
          postId={post.id}
          authorUsername={post.authorUsername}
          authorUid={post.authorUid}
          overlayOnly
          startExpanded
          onCloseExpand={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function GroupExploreCard({ group, rank }: { group: LiveGroup; rank: number }) {
  const extras = Math.max(0, group.memberCount - 3);
  const trophy =
    rank === 0
      ? 'bg-amber-400/25 text-amber-300'
      : rank === 1
        ? 'bg-zinc-300/20 text-zinc-200'
        : rank === 2
          ? 'bg-orange-400/25 text-orange-300'
          : 'bg-white/5 text-zinc-500';

  return (
    <Link
      to="/grupos"
      className="lb-card flex w-[16.5rem] shrink-0 flex-col gap-2.5 rounded-2xl border border-white/[0.08] bg-[#14151c] p-3.5 transition hover:border-cyan-400/30"
    >
      <div className="flex items-start gap-2.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/20 text-sm font-black text-white ring-1 ring-white/10">
          {group.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-bold text-white">{group.name}</p>
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-black ${trophy}`}>
              {rank < 3 ? <Trophy size={12} /> : rank + 1}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] font-semibold text-emerald-300/90">
            {formatCount(group.memberCount)} miembros
          </p>
        </div>
      </div>
      <p className="line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
        {group.description || 'Comunidad LiveBoom — únete y crece con otros Boomers.'}
      </p>
      <div className="mt-auto flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="grid h-6 w-6 place-items-center rounded-full bg-zinc-800 text-[9px] font-bold text-zinc-400 ring-2 ring-[#14151c]"
            style={{ marginLeft: i === 0 ? 0 : -8 }}
          >
            {String.fromCharCode(65 + i)}
          </span>
        ))}
        {extras > 0 ? (
          <span className="ml-1 text-[11px] font-semibold text-zinc-500">+{formatCount(extras)}</span>
        ) : (
          <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-zinc-500">
            <Users size={11} /> comunidad
          </span>
        )}
      </div>
    </Link>
  );
}

export function ExploreView() {
  const profile = useAuthStore((state) => state.profile);
  const ready = useAuthStore((state) => state.ready);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [lives, setLives] = useState<ActiveLiveFeedItem[]>([]);
  const [groups, setGroups] = useState<LiveGroup[]>([]);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [category, setCategory] = useState('');
  const [showMoreCats, setShowMoreCats] = useState(false);
  const [sort, setSort] = useState<SortMode>('recientes');
  const [q, setQ] = useState('');
  const [openReelId, setOpenReelId] = useState<string | null>(null);

  const livesRef = useRef<HTMLDivElement>(null);
  const groupsRef = useRef<HTMLDivElement>(null);
  const postsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) {
      setPosts([]);
      return;
    }
    return listenRecentPosts((list) => setPosts(list.map(toSocial)));
  }, [profile?.firebaseUid]);

  useEffect(() => listenActiveLiveRooms(setLives), []);
  useEffect(() => listenPublicGroups(setGroups), []);

  const visibleLives = useMemo(() => {
    if (!category) return lives;
    return lives.filter((s) => (s.category || 'otro') === category);
  }, [lives, category]);

  const visiblePosts = useMemo(() => {
    let list = mediaFilter === 'all' ? posts : posts.filter((p) => p.type === mediaFilter);
    const needle = q.trim().toLowerCase().replace(/^@/, '');
    if (needle) {
      list = list.filter(
        (p) =>
          p.authorUsername.toLowerCase().includes(needle) ||
          (p.caption || '').toLowerCase().includes(needle) ||
          (p.caption || '').toLowerCase().includes(`#${needle}`),
      );
    }
    if (sort === 'populares' || sort === 'vistas') {
      return [...list].sort((a, b) => (b.likes || 0) - (a.likes || 0));
    }
    return list;
  }, [posts, mediaFilter, q, sort]);

  const videoReels = useMemo(
    () =>
      visiblePosts
        .filter((post) => post.type === 'video' && post.mediaUrl)
        .slice(0, 16)
        .map((post) => ({
          id: post.id,
          username: post.authorUsername,
          authorUid: post.authorUid || '',
          caption: post.caption || 'Video',
          mediaUrl: post.mediaUrl!,
        })),
    [visiblePosts],
  );

  const openReelIndex = openReelId ? videoReels.findIndex((reel) => reel.id === openReelId) : -1;

  const primaryCats = LIVE_CATEGORIES.filter((c) =>
    ['gaming', 'charla', 'arte', 'educacion', 'humor', 'musica'].includes(c.id),
  );
  const extraCats = LIVE_CATEGORIES.filter((c) => !primaryCats.some((p) => p.id === c.id));

  function selectChip(chip: Chip) {
    if (chip.media) {
      setMediaFilter(chip.media);
      setCategory('');
      return;
    }
    if (chip.category) {
      setCategory(chip.category === category ? '' : chip.category);
      setMediaFilter('all');
    }
  }

  return (
    <div className="lb-page mx-auto flex w-full max-w-5xl flex-col gap-5 pb-2 sm:gap-7">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Explorar</h1>
          <p className="mt-1 text-sm text-zinc-400">Descubre lo mejor de LiveBoom</p>
        </div>
        <label className="relative w-full sm:max-w-md">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar publicaciones, usuarios o hashtags..."
            className="h-11 w-full rounded-full border border-white/10 bg-[#14151c] py-2 pl-4 pr-11 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-500/50"
          />
          <Search size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500" />
        </label>
      </header>

      {/* Category / media pills */}
      <div className="gift-row -mx-0.5 flex gap-2 overflow-x-auto px-0.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MEDIA_CHIPS.map((chip) => {
          const active = !category && mediaFilter === chip.media;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => selectChip(chip)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                active
                  ? 'bg-gradient-to-r from-teal-500 to-cyan-400 text-white shadow-[0_0_16px_rgba(34,211,238,0.35)]'
                  : 'border border-white/10 bg-[#14151c] text-zinc-300 hover:text-white'
              }`}
            >
              {chip.icon}
              {chip.label}
            </button>
          );
        })}
        {primaryCats.map((cat) => {
          const active = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => selectChip({ id: cat.id, label: cat.label, category: cat.id })}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                active
                  ? 'bg-gradient-to-r from-teal-500 to-cyan-400 text-white'
                  : 'border border-white/10 bg-[#14151c] text-zinc-300 hover:text-white'
              }`}
            >
              {CATEGORY_ICONS[cat.id] || (
                <img src={cat.icon} alt="" className="h-4 w-4 object-contain" draggable={false} />
              )}
              {cat.label === 'Charla' ? 'Charlas' : cat.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setShowMoreCats((v) => !v)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-[#14151c] px-3.5 py-2 text-xs font-semibold text-zinc-300"
        >
          Más
          <ChevronDown size={14} className={showMoreCats ? 'rotate-180 transition' : 'transition'} />
        </button>
      </div>
      {showMoreCats ? (
        <div className="-mt-4 flex flex-wrap gap-2">
          {extraCats.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => selectChip({ id: cat.id, label: cat.label, category: cat.id })}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                category === cat.id
                  ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40'
                  : 'border border-white/10 text-zinc-400'
              }`}
            >
              <img src={cat.icon} alt="" className="h-4 w-4" />
              {cat.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* LIVE EN LÍNEA */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white">
            <span className="live-dot h-2 w-2 rounded-full bg-rose-500" />
            Live en línea
          </h2>
          <Link to="/" className="text-[12px] font-semibold text-zinc-400 hover:text-cyan-300">
            Ver todos los LIVE &gt;
          </Link>
        </div>
        <div className="relative">
          <div ref={livesRef} className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <LiveAvatarRow streams={visibleLives.slice(0, 20)} />
          </div>
          {visibleLives.length > 4 ? (
            <button
              type="button"
              aria-label="Ver más lives"
              onClick={() => scrollRow(livesRef, 1)}
              className="absolute -right-1 top-8 hidden h-9 w-9 place-items-center rounded-full border border-white/10 bg-zinc-900/90 text-white shadow-lg md:grid"
            >
              <ChevronRight size={18} />
            </button>
          ) : null}
        </div>
        {category ? (
          <p className="mt-2 text-[11px] text-zinc-500">
            Filtrando lives por {categoryLabel(category)}
          </p>
        ) : null}
      </section>

      {/* GRUPOS TOP */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-white">Grupos top</h2>
          <Link to="/grupos" className="text-[12px] font-semibold text-cyan-400 hover:underline">
            Ver todos los grupos &gt;
          </Link>
        </div>
        {groups.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
            Aún no hay grupos.{' '}
            <Link to="/grupos" className="text-cyan-400 underline">
              Crea el primero
            </Link>
          </p>
        ) : (
          <div className="relative">
            <div
              ref={groupsRef}
              className="gift-row flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {groups.slice(0, 10).map((g, i) => (
                <GroupExploreCard key={g.id} group={g} rank={i} />
              ))}
            </div>
            {groups.length > 2 ? (
              <button
                type="button"
                aria-label="Ver más grupos"
                onClick={() => scrollRow(groupsRef, 1)}
                className="absolute -right-1 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-zinc-900/90 text-white shadow-lg md:grid"
              >
                <ChevronRight size={18} />
              </button>
            ) : null}
          </div>
        )}
      </section>

      {/* PUBLICACIONES POPULARES */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-white">
              Publicaciones populares
            </h2>
            <div className="flex items-center gap-1">
              {(
                [
                  ['recientes', 'Recientes'],
                  ['populares', 'Populares'],
                  ['vistas', 'Más vistas'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSort(id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                    sort === id
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Link to="/buscar" className="text-[12px] font-semibold text-cyan-400 hover:underline">
            Ver todas &gt;
          </Link>
        </div>

        {!ready ? (
          <p className="rounded-2xl bg-zinc-900/60 px-4 py-10 text-center text-sm text-zinc-500">
            Cargando…
          </p>
        ) : !profile ? (
          <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-zinc-500">
            <Link to="/login" className="text-cyan-400 underline">
              Inicia sesión
            </Link>{' '}
            para explorar publicaciones.
          </p>
        ) : visiblePosts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-zinc-500">
            No hay resultados. Publica el primero desde{' '}
            <Link to="/crear" className="text-cyan-400 underline">
              Crear
            </Link>
            .
          </p>
        ) : (
          <div className="relative">
            <div
              ref={postsRef}
              className="gift-row flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {visiblePosts.slice(0, 16).map((post) => (
                <ExplorePostCard key={post.id} post={post} onOpenVideo={setOpenReelId} />
              ))}
            </div>
            {visiblePosts.length > 3 ? (
              <button
                type="button"
                aria-label="Ver más publicaciones"
                onClick={() => scrollRow(postsRef, 1)}
                className="absolute -right-1 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-zinc-900/90 text-white shadow-lg md:grid"
              >
                <ChevronRight size={18} />
              </button>
            ) : null}
          </div>
        )}
      </section>

      {openReelIndex >= 0 ? (
        <ReelFeedViewer
          reels={videoReels}
          initialIndex={openReelIndex}
          onClose={() => setOpenReelId(null)}
        />
      ) : null}
    </div>
  );
}
