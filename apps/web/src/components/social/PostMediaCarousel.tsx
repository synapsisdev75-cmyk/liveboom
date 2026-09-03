import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { publicationFeedPlaceholderStyle } from '../../lib/publicationMedia';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import { PostActionRail } from './PostActionRail';
import { PublicationMedia } from './PublicationMedia';
import { PostComments } from './PostVideoPlayer';
import { ShareContentButton } from './ShareContentButton';
import { buildPostShareUrl } from '../../lib/shareContent';
import {
  listenPostComments,
  listenPostReactions,
  setPostReaction,
  type PostReactionUser,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';

type Props = {
  sources: string[];
  caption?: string | null;
  postId?: string;
  authorUsername?: string;
  authorUid?: string;
  authorAvatarUrl?: string | null;
  startExpanded?: boolean;
  onCloseExpand?: () => void;
  onExpandChange?: (expanded: boolean) => void;
};

function loadImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    const onLoad = () => {
      resolve({
        width: img.naturalWidth || 1,
        height: img.naturalHeight || 1,
      });
    };
    img.addEventListener('load', onLoad);
    img.addEventListener('error', () => resolve({ width: 1, height: 1 }));
    img.src = src;
  });
}

/**
 * Carrusel de fotos en publicaciones — feed y fullscreen con altura estable.
 */
export function PostMediaCarousel({
  sources,
  caption,
  postId,
  authorUsername,
  authorUid,
  authorAvatarUrl,
  startExpanded = false,
  onCloseExpand,
  onExpandChange,
}: Props) {
  const profile = useAuthStore((state) => state.profile);
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(startExpanded);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [viewerReaction, setViewerReaction] = useState<'like' | 'dislike' | null>(null);
  const [likers, setLikers] = useState<PostReactionUser[]>([]);
  const [dislikers, setDislikers] = useState<PostReactionUser[]>([]);
  const [busy, setBusy] = useState(false);
  const swipeRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });

  const total = sources.length;
  const shareUrl =
    authorUsername && postId ? buildPostShareUrl(authorUsername, postId, authorUid) : null;
  const shareTitle = authorUsername ? `@${authorUsername} en LiveBoom` : 'LiveBoom';
  const shareText =
    caption?.trim() ||
    (authorUsername ? `Mira esta foto de @${authorUsername} en LiveBoom` : 'Mira esta foto en LiveBoom');

  useEffect(() => {
    const active = sources[index];
    if (!active) return;
    let cancelled = false;
    void loadImageSize(active).then((size) => {
      if (!cancelled) setFrameSize(size);
    });
    return () => {
      cancelled = true;
    };
  }, [sources, index]);

  useEffect(() => {
    onExpandChange?.(expanded);
  }, [expanded, onExpandChange]);

  useBodyScrollLock(expanded);

  useEffect(() => {
    if (!expanded || !postId || !profile?.firebaseUid) return;
    return listenPostReactions(postId, profile.firebaseUid, (stats) => {
      setLikes(stats.likes);
      setDislikes(stats.dislikes);
      setViewerReaction(stats.viewerReaction);
      setLikers(stats.likers);
      setDislikers(stats.dislikers);
    });
  }, [expanded, postId, profile?.firebaseUid]);

  useEffect(() => {
    if (!expanded || !postId) return;
    return listenPostComments(postId, (list) => setCommentCount(list.length));
  }, [expanded, postId]);

  const goNext = useCallback(() => {
    setIndex((current) => (current < total - 1 ? current + 1 : current));
  }, [total]);

  const goPrev = useCallback(() => {
    setIndex((current) => (current > 0 ? current - 1 : current));
  }, []);

  useEffect(() => {
    if (!expanded) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeExpand();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, goNext, goPrev]);

  function openExpand() {
    setExpanded(true);
  }

  function closeExpand() {
    setCommentsOpen(false);
    setExpanded(false);
    onCloseExpand?.();
  }

  async function react(reaction: 'like' | 'dislike') {
    if (!profile || !postId) return;
    setBusy(true);
    try {
      await setPostReaction(
        postId,
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

  const frameW = frameSize?.width ?? 0;
  const frameH = frameSize?.height ?? 0;

  const carouselBody = (
    <PublicationMedia
      src={sources[index] || sources[0] || ''}
      mediaKind="image"
      width={frameW}
      height={frameH}
      style={!frameSize ? publicationFeedPlaceholderStyle() : undefined}
      overlay={
        <>
          {total > 1 ? (
            <>
              {index > 0 ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goPrev();
                  }}
                  className="absolute left-2 top-1/2 z-20 grid min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-md"
                  aria-label="Foto anterior"
                >
                  <ChevronLeft size={20} />
                </button>
              ) : null}
              {index < total - 1 ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goNext();
                  }}
                  className="absolute right-2 top-1/2 z-20 grid min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-md"
                  aria-label="Foto siguiente"
                >
                  <ChevronRight size={20} />
                </button>
              ) : null}
              <div className="absolute inset-x-0 bottom-2 z-20 flex justify-center gap-1.5">
                {sources.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/40'
                    }`}
                  />
                ))}
              </div>
              <span className="absolute right-2 top-2 z-20 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold tabular-nums text-white backdrop-blur-sm">
                {index + 1}/{total}
              </span>
            </>
          ) : null}

          {!expanded ? (
            <>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
              <span className="absolute bottom-2 right-2 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-black/55 px-3 py-2 text-xs font-bold text-white backdrop-blur-sm">
                <Maximize2 size={14} /> Expandir
              </span>
              {shareUrl ? (
                <span className="absolute bottom-2 left-2">
                  <ShareContentButton
                    url={shareUrl}
                    title={shareTitle}
                    text={shareText}
                    mediaUrl={sources[index]}
                    mediaType="photo"
                    iconOnly
                  />
                </span>
              ) : null}
            </>
          ) : null}
        </>
      }
    >
      <div className="relative h-full w-full">
        {sources.map((src, i) => (
          <img
            key={src}
            src={src}
            alt=""
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
            className={`lb-post-media__img absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ${
              i === index ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          />
        ))}
      </div>
    </PublicationMedia>
  );

  const expandedOverlay =
    expanded && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] touch-none overflow-hidden overscroll-none bg-black"
            role="dialog"
            aria-modal
            aria-label="Publicación"
            onTouchStart={(e) => {
              const t = e.changedTouches[0];
              if (!t) return;
              swipeRef.current = { x: t.clientX, y: t.clientY, active: true };
            }}
            onTouchEnd={(e) => {
              if (!swipeRef.current.active) return;
              swipeRef.current.active = false;
              const t = e.changedTouches[0];
              if (!t) return;
              const dx = t.clientX - swipeRef.current.x;
              if (Math.abs(dx) < 48) return;
              if (dx < 0) goNext();
              else goPrev();
            }}
          >
            <div className="relative flex h-full w-full items-center justify-center px-2">
              <button
                type="button"
                onClick={closeExpand}
                className="absolute left-[max(0.75rem,var(--lb-safe-left))] top-[max(0.75rem,var(--lb-safe-top))] z-30 grid min-h-11 min-w-11 place-items-center rounded-full border border-white/15 bg-black/65 text-white backdrop-blur-md"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
              <div
                className="relative w-full max-w-[min(100%,56rem)]"
                style={{ maxHeight: 'min(720px, 92dvh)' }}
              >
                {carouselBody}
              </div>

              {postId ? (
                <PostActionRail
                  postId={postId}
                  authorUid={authorUid}
                  authorUsername={authorUsername}
                  authorAvatarUrl={authorAvatarUrl}
                  likes={likes}
                  dislikes={dislikes}
                  viewerReaction={viewerReaction}
                  likers={likers}
                  dislikers={dislikers}
                  busy={busy}
                  onReact={(r) => void react(r)}
                  commentCount={commentCount}
                  commentsOpen={commentsOpen}
                  onToggleComments={() => setCommentsOpen((v) => !v)}
                  shareUrl={shareUrl}
                  shareTitle={shareTitle}
                  shareText={shareText}
                  mediaUrl={sources[index]}
                  mediaType="photo"
                  anchor="viewport"
                />
              ) : null}

              {caption && !commentsOpen ? (
                <p
                  className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 text-sm text-white/90"
                  style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
                >
                  {caption}
                </p>
              ) : null}

              {commentsOpen && postId ? (
                <div
                  className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex max-h-[min(44dvh,calc(100dvh-5rem))] flex-col rounded-t-2xl border border-white/15 bg-zinc-950/95 backdrop-blur-md"
                  style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom, 0px))' }}
                >
                  <PostComments
                    postId={postId}
                    authorUid={authorUid}
                    variant="overlay"
                    defaultOpen
                    scrollable
                    embedded
                  />
                </div>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button type="button" onClick={openExpand} className="block w-full text-left">
        {carouselBody}
      </button>
      {expandedOverlay}
    </>
  );
}
