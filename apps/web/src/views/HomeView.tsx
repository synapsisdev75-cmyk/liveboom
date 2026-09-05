import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGroup } from 'framer-motion';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Gift,
  MapPin,
  MessageCircle,
  Play,
  Plus,
  Search,
} from 'lucide-react';
import { FlashBoomRow } from '../components/feed/FlashBoomRow';
import { CreatePostModal } from '../components/social/CreatePostModal';
import { LiveAvatarRow } from '../components/feed/LiveAvatarRow';
import { TopLivesRail } from '../components/feed/TopLivesRail';
import { ReelFeedViewer, type ReelFeedItem } from '../components/feed/ReelFeedViewer';
import { ReelsRow } from '../components/feed/ReelsRow';
import { CategoryChips } from '../components/search/CategoryChips';
import { BoomLikeButton } from '../components/social/BoomButtons';
import { NotificationBell } from '../components/social/NotificationBell';
import { ReactionList } from '../components/social/PostReactionButtons';
import { PostComments, PostVideoPlayer } from '../components/social/PostVideoPlayer';
import { ShareContentButton } from '../components/social/ShareContentButton';
import { ReelGiftControls } from '../components/feed/ReelGiftControls';
import { buildPostShareUrl } from '../lib/shareContent';
import { PostPhotoViewer } from '../components/social/PostPhotoViewer';
import { PostMediaCarousel } from '../components/social/PostMediaCarousel';
import { postPhotoUrls } from '../lib/mediaFrame';
import { POST_EMOJI_SIZE } from '../lib/liveboomEmojis';
import { EmojiText } from '../components/social/EmojiText';
import { PublicationCaption } from '../components/social/PublicationCaption';
import {
  TextNoteBody,
  isTextOnlyPost,
  type SocialPost,
} from '../components/social/SocialPostCard';
import { RepostPostCard } from '../components/social/RepostPostCard';
import { isRepostPost } from '../lib/socialFirestore';
import { UserAvatar } from '../components/profile/UserAvatar';
import { apiPublic } from '../lib/api';
import { categoryLabel } from '../lib/categories';
import {
  listenActiveLiveRooms,
  reconcileLiveFeedWithApi,
  type ActiveLiveFeedItem,
} from '../lib/liveGiftsFirestore';
import { getLiveRanking } from '../lib/liveRanking';
import {
  listenPostComments,
  listenPostReactions,
  listenHomeFeed,
  listenRecentPosts,
  listenActiveStories,
  getPostById,
  setPostReaction,
  type FsPost,
  type HomeFeedMeta,
  type PostReactionUser,
} from '../lib/socialFirestore';
import { markHomeFeedInteracted, markHomeFeedSeen, readHomeFeedHistory } from '../lib/homeFeedHistory';
import {
  HOME_FEED_PAGE_SIZE,
  nextHomeFeedPage,
  rankHomePublications,
} from '../lib/homeFeedRanking';
import { canEditOwnedPublication, isPublicationPost } from '../lib/contentType';
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
    mediaUrls: post.mediaUrls,
    mediaWidth: post.mediaWidth,
    mediaHeight: post.mediaHeight,
    thumbUrl: post.thumbUrl ?? null,
    visibility: post.visibility,
    createdAt: post.createdAt,
    likes: post.likes,
    dislikes: 0,
    viewerReaction: null,
    postFormat: post.postFormat,
    durationSec: post.durationSec,
    reelFeedUntilMs: post.reelFeedUntilMs,
    sharedFromPostId: post.sharedFromPostId,
    sharedFromAuthorUid: post.sharedFromAuthorUid,
    sharedFromUsername: post.sharedFromUsername,
    overlays: post.overlays,
    edited: post.edited,
    updatedAt: post.updatedAt,
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

/** Post destacado: video con autoplay + comentarios directos. */
function FeaturedFeedCard({
  post,
  live,
  onEdit,
}: {
  post: SocialPost;
  live: ActiveLiveFeedItem | null;
  onEdit?: (post: SocialPost) => void;
}) {
  const profile = useAuthStore((state) => state.profile);
  if (isRepostPost(post)) {
    return (
      <RepostPostCard
        post={post}
        live={live}
        onInteracted={() => {
          if (profile) markHomeFeedInteracted(profile.firebaseUid, post.id);
        }}
      />
    );
  }
  return <HomePublicationCard post={post} live={live} onEdit={onEdit} />;
}

function HomePublicationCard({
  post,
  live,
  onEdit,
}: {
  post: SocialPost;
  live: ActiveLiveFeedItem | null;
  onEdit?: (post: SocialPost) => void;
}) {
  const profile = useAuthStore((state) => state.profile);
  const [likes, setLikes] = useState(post.likes || 0);
  const [dislikes, setDislikes] = useState(0);
  const [viewerReaction, setViewerReaction] = useState<'like' | 'dislike' | null>(null);
  const [likers, setLikers] = useState<PostReactionUser[]>([]);
  const [dislikers, setDislikers] = useState<PostReactionUser[]>([]);
  const [showLikers, setShowLikers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const canEdit = canEditOwnedPublication(post, profile?.firebaseUid);

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
      markHomeFeedInteracted(profile.firebaseUid, post.id);
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
      markHomeFeedInteracted(profile.firebaseUid, post.id);
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
    <article className="lb-card lb-panel min-w-0 max-w-full overflow-hidden rounded-2xl">
      <div className="flex min-w-0 items-center gap-3 px-3.5 pt-3.5 sm:px-4 sm:pt-4">
        <Link to={`/u/${encodeURIComponent(post.authorUsername)}`} className="shrink-0">
          <UserAvatar
            uid={post.authorUid}
            username={post.authorUsername}
            size={40}
            ringClassName="ring-2 ring-fuchsia-400/40"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              to={`/u/${encodeURIComponent(post.authorUsername)}`}
              className="truncate text-sm font-bold text-white hover:text-cyan-300"
            >
              @{post.authorUsername}
            </Link>
            <span className="text-[11px] text-zinc-500">
              {timeAgo(post.createdAt)}
              {post.edited ? ' · Editado' : ''}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canEdit ? (
            <button
              type="button"
              title="Editar publicación"
              aria-label="Editar publicación"
              onClick={() => onEdit?.(post)}
              className="text-[11px] font-semibold text-zinc-500 hover:text-cyan-300"
            >
              Editar
            </button>
          ) : null}
          {live ? (
            <Link
              to={`/stream/${encodeURIComponent(live.username)}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-fuchsia-600/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-[0_0_16px_rgba(217,70,239,0.45)]"
            >
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
              En vivo
            </Link>
          ) : null}
        </div>
      </div>

      {isTextOnlyPost(post) ? (
        <div className="mt-3">
          <TextNoteBody caption={post.caption} />
        </div>
      ) : post.mediaUrl && post.type === 'video' ? (
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
            mediaWidth={post.mediaWidth}
            mediaHeight={post.mediaHeight}
            posterUrl={post.thumbUrl}
            publicationCaption
            overlays={post.overlays}
          />
        </div>
      ) : postPhotoUrls(post).length > 1 ? (
        <div className="mt-3">
          <PostMediaCarousel
            sources={postPhotoUrls(post)}
            caption={post.caption}
            postId={post.id}
            authorUsername={post.authorUsername}
            authorUid={post.authorUid}
            overlays={post.overlays}
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
            mediaWidth={post.mediaWidth}
            mediaHeight={post.mediaHeight}
            publicationCaption
            overlays={post.overlays}
          />
        </div>
      ) : post.caption ? (
        <div className="mt-3">
          <TextNoteBody caption={post.caption} />
        </div>
      ) : null}

      {post.caption && post.type !== 'video' && post.type !== 'photo' && !isTextOnlyPost(post) ? (
        <p className="px-3.5 pt-3 text-sm leading-relaxed text-zinc-200 sm:px-4">
          <EmojiText text={post.caption} size={POST_EMOJI_SIZE} />
        </p>
      ) : null}

      <div className="relative flex min-w-0 max-w-full flex-wrap items-center gap-1 border-t border-white/5 px-2 py-2.5 sm:gap-2 sm:px-3">
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
          onClick={() => {
            if (profile) markHomeFeedInteracted(profile.firebaseUid, post.id);
            setShowComments((v) => !v);
          }}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold hover:bg-white/5 ${
            showComments ? 'bg-white/10 text-white' : 'text-zinc-300'
          }`}
        >
          <MessageCircle size={15} className="text-cyan-300" />
          {commentCount > 0 ? commentCount : 'Comentar'}
        </button>
        {post.authorUsername ? (
          <span
            onClick={() => {
              if (profile) markHomeFeedInteracted(profile.firebaseUid, post.id);
            }}
          >
            <ReelGiftControls
              authorUsername={post.authorUsername}
              authorUid={post.authorUid}
              postId={post.id}
              inline
            />
          </span>
        ) : null}
        <span
          className="ml-auto"
          onClick={() => {
            if (profile) markHomeFeedInteracted(profile.firebaseUid, post.id);
          }}
        >
          <ShareContentButton
            url={buildPostShareUrl(post.authorUsername, post.id, post.authorUid)}
            title={`@${post.authorUsername} en LiveBoom`}
            text={post.caption || `Mira esta publicación de @${post.authorUsername} en LiveBoom`}
            mediaUrl={post.mediaUrl}
            mediaType={post.type === 'video' ? 'video' : post.type === 'photo' ? 'photo' : 'text'}
            postId={post.id}
            authorUid={post.authorUid}
            authorUsername={post.authorUsername}
          />
        </span>
      </div>

      {!isTextOnlyPost(post) &&
      (post.type === 'photo' || post.type === 'video') &&
      post.caption?.trim() ? (
        <PublicationCaption key={post.id} caption={post.caption || ''} />
      ) : null}

      {showComments ? (
        <PostComments
          postId={post.id}
          authorUid={post.authorUid}
          defaultOpen
        />
      ) : null}
    </article>
  );
}

export function HomeView() {
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const [streams, setStreams] = useState<ActiveLiveFeedItem[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [feedMeta, setFeedMeta] = useState<HomeFeedMeta>({ friendUids: [], followingUids: [] });
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [feedEpoch, setFeedEpoch] = useState(() => Date.now());
  const [historySnap, setHistorySnap] = useState(() =>
    profile?.firebaseUid ? readHomeFeedHistory(profile.firebaseUid) : {},
  );
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState('');
  const [tab, setTab] = useState<FeedTab>('para_ti');
  const [regionLabel, setRegionLabel] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [createPublicationOpen, setCreatePublicationOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [flashViewer, setFlashViewer] = useState<{
    reels: ReelFeedItem[];
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
      durationSec: post.durationSec ?? null,
      sharedFromPostId: post.sharedFromPostId,
      sharedFromAuthorUid: post.sharedFromAuthorUid,
      sharedFromUsername: post.sharedFromUsername,
      overlays: post.overlays,
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
    const target = posts.find((post) => post.id === postId);
    const authorUid = target?.authorUid;
    const reels = flashReelsFromPosts(posts).filter((reel) =>
      authorUid ? reel.authorUid === authorUid : reel.id === postId,
    );
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
    setVisibleIds([]);
    setFeedEpoch(Date.now());
    if (profile?.firebaseUid) setHistorySnap(readHomeFeedHistory(profile.firebaseUid));
    if (!profile) {
      setPosts([]);
      setFeedMeta({ friendUids: [], followingUids: [] });
      return;
    }
    setPosts([]);
    if (tab === 'cerca') {
      return listenRecentPosts((list) =>
        setPosts(list.filter((item) => isPublicationPost(item)).map(toSocial)),
      );
    }
    return listenHomeFeed(profile.firebaseUid, tab, (list, meta) => {
      setPosts(list.map(toSocial));
      setFeedMeta(meta);
    });
  }, [profile?.firebaseUid, tab]);

  const rankedPosts = useMemo(() => {
    if (tab !== 'para_ti' || !profile?.firebaseUid) return posts;
    return rankHomePublications(
      posts,
      {
        uid: profile.firebaseUid,
        friendUids: new Set(feedMeta.friendUids),
        followingUids: new Set(feedMeta.followingUids),
      },
      historySnap,
      feedEpoch,
    );
  }, [tab, posts, profile?.firebaseUid, feedMeta, historySnap, feedEpoch]);

  const feedById = useMemo(() => {
    const map = new Map(rankedPosts.map((post) => [post.id, post]));
    return map;
  }, [rankedPosts]);

  useEffect(() => {
    const eligible = new Set(rankedPosts.map((post) => post.id));
    setVisibleIds((prev) => {
      const kept = prev.filter((id) => eligible.has(id));
      if (kept.length > 0) {
        if (kept.length === prev.length && kept.every((id, index) => id === prev[index])) return prev;
        return kept;
      }
      const next = rankedPosts.slice(0, HOME_FEED_PAGE_SIZE).map((post) => post.id);
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) return prev;
      return next;
    });
  }, [rankedPosts]);

  const visiblePosts = useMemo(
    () => visibleIds.map((id) => feedById.get(id)).filter((post): post is SocialPost => Boolean(post)),
    [visibleIds, feedById],
  );

  const canLoadMore = rankedPosts.some((post) => !visibleIds.includes(post.id));
  const rankedRef = useRef(rankedPosts);
  rankedRef.current = rankedPosts;

  const loadMoreHomeFeed = useCallback(() => {
    setVisibleIds((prev) => {
      const extra = nextHomeFeedPage(rankedRef.current, prev, HOME_FEED_PAGE_SIZE);
      if (extra.length === 0) return prev;
      return [...prev, ...extra.map((post) => post.id)];
    });
  }, []);

  useEffect(() => {
    const uid = profile?.firebaseUid;
    if (!uid) return;
    for (const id of visibleIds) markHomeFeedSeen(uid, id);
  }, [visibleIds, profile?.firebaseUid]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !canLoadMore) return;
    let armed = false;
    const armTimer = window.setTimeout(() => {
      armed = true;
    }, 700);
    const observer = new IntersectionObserver(
      (entries) => {
        if (!armed) return;
        if (!entries.some((entry) => entry.isIntersecting)) return;
        armed = false;
        loadMoreHomeFeed();
      },
      { rootMargin: '220px 0px' },
    );
    observer.observe(node);
    return () => {
      window.clearTimeout(armTimer);
      observer.disconnect();
    };
  }, [canLoadMore, visibleIds.length, loadMoreHomeFeed]);

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

  const { topLives, regularLives } = useMemo(
    () => getLiveRanking(streams, category),
    [streams, category],
  );

  const featured = visiblePosts[0] ?? null;
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
    <div className="lb-page lb-home-center flex min-w-0 flex-col gap-4 sm:gap-5">
      {/* 1. Tabs + buscar + campana */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex min-w-0 max-w-full items-center gap-0.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] sm:gap-1 [&::-webkit-scrollbar]:hidden">
          {tabs.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === tab) {
                    setFeedEpoch(Date.now());
                    setVisibleIds([]);
                    if (profile?.firebaseUid) {
                      setHistorySnap(readHomeFeedHistory(profile.firebaseUid));
                    }
                    return;
                  }
                  setTab(item.id);
                }}
                className={`relative min-h-11 shrink-0 px-2.5 py-2 text-sm font-semibold transition sm:px-3 ${
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
          {profile ? (
            <span className="hidden lg:contents">
              <NotificationBell />
            </span>
          ) : null}
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

      {/* Filtros de categoría — inicio del contenido central */}
      <CategoryChips value={category} onChange={setCategory} />

      <LayoutGroup id="home-live-ranking">
        {topLives.length > 0 || regularLives.length > 0 ? (
          <>
            {/* Directos top — top 5 por espectadores, video preview */}
            <TopLivesRail streams={topLives} />

            {/* Live en línea — resto de lives, avatar estático */}
            <section>
              <div className="mb-3 flex items-end justify-between gap-2">
                <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">Live en línea</h2>
                <Link
                  to="/explorar"
                  className="text-[11px] font-semibold text-cyan-400 hover:underline"
                >
                  Ver todos los LIVE →
                </Link>
              </div>
              <LiveAvatarRow streams={regularLives} />
            </section>
          </>
        ) : null}
      </LayoutGroup>

      {/* Flash Boom — historias 24 h */}
      {profile ? <FlashBoomRow /> : null}

      {/* Boom Clip — solo videos cortos ≤ 90 s */}
      {profile ? (
        <ReelsRow
          title="Boom Clip"
          subtitle="Videos cortos de hasta 90 segundos"
          mode="reels"
        />
      ) : null}

      {tab === 'siguiendo' && !profile ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
          <Link to="/login" className="text-cyan-400 underline">
            Inicia sesión
          </Link>{' '}
          para ver a quienes sigues.
        </p>
      ) : null}

      {/* 5. Publicaciones — feed (no Boom Clip) */}
      <section className="space-y-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">Publicaciones</h2>
            <p className="mt-0.5 text-[10px] text-zinc-500">
              Fotos, texto y videos largos · feed social
            </p>
          </div>
          {profile ? (
            <button
              type="button"
              onClick={() => setCreatePublicationOpen(true)}
              className="lb-new-post-btn"
            >
              <span className="lb-new-post-btn__shine" aria-hidden />
              <Plus size={14} strokeWidth={2.75} />
              <span>Nueva publicación</span>
            </button>
          ) : null}
        </div>
        <div className="min-w-0">
          {!profile ? (
              <div className="lb-panel rounded-2xl px-4 py-10 text-center text-sm text-zinc-500">
                <Link to="/login" className="text-cyan-400 underline">
                  Inicia sesión
                </Link>{' '}
                para ver el feed Para ti.
              </div>
            ) : featured ? (
              <FeaturedFeedCard
                post={featured}
                live={liveForFeatured}
                onEdit={setEditingPost}
              />
            ) : tab === 'siguiendo' ? (
              <div className="lb-panel rounded-2xl px-4 py-10 text-center text-sm text-zinc-500">
                Aún no hay publicaciones de quienes sigues. Cuando publiquen fotos, textos o videos,
                aparecerán aquí. Los Flash Boom y Boom Clip están arriba.
              </div>
            ) : streams[0] ? (
              <LiveHeroCard stream={streams[0]} />
            ) : (
              <div className="lb-panel rounded-2xl px-4 py-10 text-center text-sm text-zinc-500">
                Aún no hay publicaciones. Publica desde Crear o espera un LIVE.
              </div>
            )}
        </div>
      </section>

      {/* Más posts del feed */}
      {profile && visiblePosts.length > 0 ? (
        <section className="space-y-3">
          {visiblePosts.slice(1).map((post) => {
            const live = streams.find(
              (s) => s.username.toLowerCase() === post.authorUsername.toLowerCase(),
            );
            return (
              <FeaturedFeedCard
                key={post.id}
                post={post}
                live={live ?? null}
                onEdit={setEditingPost}
              />
            );
          })}
          <div ref={loadMoreRef} className="h-4" />
          {canLoadMore ? (
            <button
              type="button"
              onClick={loadMoreHomeFeed}
              className="flex min-h-11 w-full items-center justify-center rounded-2xl border border-white/10 bg-zinc-950/80 text-sm font-semibold text-cyan-300 hover:bg-white/5"
            >
              Ver más publicaciones
            </button>
          ) : (
            <p className="pb-2 text-center text-[11px] text-zinc-500">
              Sigues viendo contenido público activo. Toca Para ti para recalcular el ranking.
            </p>
          )}
        </section>
      ) : null}

      {flashViewer ? (
        <ReelFeedViewer
          reels={flashViewer.reels}
          initialIndex={flashViewer.index}
          storyMode={flashViewer.storyMode}
          immersiveLandscapeLayout={flashViewer.storyMode}
          collapsibleCaption
          onClose={() => setFlashViewer(null)}
        />
      ) : null}

      {createPublicationOpen && profile ? (
        <CreatePostModal
          username={profile.handle}
          autoOpen
          hideTrigger
          onClose={() => setCreatePublicationOpen(false)}
          onCreated={(post) => {
            setCreatePublicationOpen(false);
            if (!isPublicationPost(post)) return;
            setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)]);
            setVisibleIds((prev) => [post.id, ...prev.filter((id) => id !== post.id)]);
          }}
        />
      ) : null}

      {editingPost && profile ? (
        <CreatePostModal
          mode="edit"
          editPost={editingPost}
          username={profile.handle}
          autoOpen
          hideTrigger
          onClose={() => setEditingPost(null)}
          onUpdated={(post) => {
            setPosts((current) =>
              current.map((item) => (item.id === post.id ? { ...item, ...post } : item)),
            );
            setEditingPost(null);
          }}
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
          En vivo
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
