import {
  ChevronDown,
  ChevronUp,
  Globe,
  Lock,
  Maximize2,
  MessageCircle,
  ThumbsDown,
  Volume2,
  VolumeX,
  X,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode, type TouchEvent, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  addPostComment,
  deletePostComment,
  listenPostComments,
  type PostComment,
  type PostReactionUser,
} from '../../lib/socialFirestore';
import {
  claimExclusivePlayback,
  claimUnmuted,
  registerFeedVideo,
  releaseExclusivePlayback,
  releaseUnmuted,
} from '../../lib/videoPlayback';
import { useVideoAspect } from '../../lib/videoAspect';
import { buildPostShareUrl } from '../../lib/shareContent';
import { BoomLikeButton } from './BoomButtons';
import { ShareContentButton } from './ShareContentButton';
import { EmojiPickerButton } from './EmojiPicker';
import { EmojiInput, type EmojiInputHandle } from './EmojiInput';
import { EmojiText } from './EmojiText';
import { insertEmojiToken, COMMENT_EMOJI_SIZE, COMMENT_EMOJI_SIZE_COMPACT } from '../../lib/liveboomEmojis';
import { ReactionList } from './PostReactionButtons';
import { ReelGiftControls } from '../feed/ReelGiftControls';
import { profileHref } from '../../lib/profileFirestore';
import { useAuthStore } from '../../store/authStore';

type Visibility = 'public' | 'friends' | 'private' | 'circle';

type Props = {
  src: string;
  postId: string;
  authorUid?: string;
  authorUsername?: string;
  caption?: string | null;
  likes: number;
  dislikes: number;
  viewerReaction: 'like' | 'dislike' | null;
  likers: PostReactionUser[];
  dislikers: PostReactionUser[];
  busy?: boolean;
  onReact: (reaction: 'like' | 'dislike') => void;
  visibility?: Visibility;
  canChangeVisibility?: boolean;
  onChangeVisibility?: (visibility: Visibility) => void;
  canDelete?: boolean;
  onDelete?: () => void;
  /** Abrir expandido al montar (p. ej. justo después de publicar). */
  startExpanded?: boolean;
  onCloseExpand?: () => void;
  /** Notifica cuando el overlay fullscreen abre/cierra (evita UI duplicada en el padre). */
  onExpandChange?: (expanded: boolean) => void;
  /** Solo overlay (sin player inline), p. ej. desde Explorar. */
  overlayOnly?: boolean;
  /** Modo feed de reels: comentarios desplazables + deslizar vertical. */
  /** Si se define, el padre abre su propio visor fullscreen (p. ej. ReelFeedViewer en perfil). */
  onRequestExpand?: () => void;
  reelFeed?: boolean;
  reelNavigation?: {
    onNext: () => void;
    onPrev: () => void;
  };
  reelPosition?: { current: number; total: number };
  /** Modo Flash Boom: auto-avance + barras de progreso. */
  storyMode?: boolean;
};

export function PostVideoPlayer({
  src,
  postId,
  authorUid,
  authorUsername,
  caption,
  likes,
  dislikes,
  viewerReaction,
  likers,
  dislikers,
  busy,
  onReact,
  visibility,
  canChangeVisibility,
  onChangeVisibility,
  canDelete,
  onDelete,
  startExpanded = false,
  onCloseExpand,
  onExpandChange,
  onRequestExpand,
  overlayOnly = false,
  reelNavigation,
  reelPosition,
  storyMode = false,
}: Props) {
  const reactId = useId();
  const playerId = `post-video-${postId}-${reactId}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const inlineRef = useRef<HTMLVideoElement>(null);
  const fullRef = useRef<HTMLVideoElement>(null);
  const swipeRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const [expanded, setExpanded] = useState(startExpanded || overlayOnly);
  const [muted, setMuted] = useState(true);
  const [showLikers, setShowLikers] = useState(false);
  const [showDislikers, setShowDislikers] = useState(false);
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [storyProgress, setStoryProgress] = useState(0);
  const shareUrl =
    authorUsername && postId
      ? buildPostShareUrl(authorUsername, postId, authorUid)
      : null;
  const shareTitle = authorUsername ? `@${authorUsername} en LiveBoom` : 'LiveBoom';
  const shareText =
    caption?.trim() ||
    (authorUsername ? `Mira este video de @${authorUsername} en LiveBoom` : 'Mira este video en LiveBoom');
  const videoAspect = useVideoAspect(src);

  useEffect(() => {
    if (onRequestExpand) return;
    if (startExpanded || overlayOnly) setExpanded(true);
  }, [startExpanded, overlayOnly, onRequestExpand]);

  useEffect(() => {
    onExpandChange?.(expanded);
  }, [expanded, onExpandChange]);

  useEffect(() => {
    setStoryProgress(0);
    setCommentsPanelOpen(false);
  }, [postId, src]);

  useEffect(() => {
    if (!expanded) return;
    return listenPostComments(postId, (list) => setCommentCount(list.length));
  }, [expanded, postId]);

  useEffect(() => {
    return registerFeedVideo({
      id: playerId,
      pause: () => {
        inlineRef.current?.pause();
        fullRef.current?.pause();
      },
      mute: () => {
        setMuted(true);
        if (inlineRef.current) inlineRef.current.muted = true;
        if (fullRef.current) fullRef.current.muted = true;
      },
    });
  }, [playerId]);

  // Autoplay muted en viewport (solo inline, nunca si está expandido)
  useEffect(() => {
    const host = wrapRef.current;
    const video = inlineRef.current;
    if (!host || !video || expanded || overlayOnly) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
          video.muted = true;
          setMuted(true);
          void video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: [0, 0.45, 0.75] },
    );
    io.observe(host);
    return () => {
      io.disconnect();
      video.pause();
    };
  }, [src, expanded, overlayOnly]);

  const playExpandedVideo = useCallback(() => {
    const full = fullRef.current;
    if (!full || !expanded) return;
    if (inlineRef.current) {
      full.currentTime = inlineRef.current.currentTime;
    }
    full.muted = muted;
    if (!muted) claimUnmuted(playerId);
    else releaseUnmuted(playerId);
    void full.play().catch(() => undefined);
  }, [expanded, muted, playerId]);

  // Expandido: un solo <video> con audio; el inline queda pausado
  useLayoutEffect(() => {
    if (!expanded) {
      releaseExclusivePlayback(playerId);
      return;
    }

    claimExclusivePlayback(playerId);
    const inline = inlineRef.current;
    if (inline) {
      inline.pause();
      inline.muted = true;
    }

    playExpandedVideo();
    const kick = window.setTimeout(playExpandedVideo, 60);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(kick);
      document.body.style.overflow = prevOverflow;
      fullRef.current?.pause();
      releaseExclusivePlayback(playerId);
      if (inline && !overlayOnly) {
        const full = fullRef.current;
        if (full) inline.currentTime = full.currentTime;
        inline.muted = true;
        setMuted(true);
        void inline.play().catch(() => undefined);
      }
    };
  }, [expanded, playerId, overlayOnly, src, playExpandedVideo]);

  useEffect(() => {
    const el = expanded ? fullRef.current : inlineRef.current;
    if (!el) return;
    el.muted = muted;
    if (!muted) claimUnmuted(playerId);
    else releaseUnmuted(playerId);
  }, [muted, expanded, playerId]);

  function toggleMute(event: MouseEvent) {
    event.stopPropagation();
    setMuted((value) => {
      const next = !value;
      if (!next) claimUnmuted(playerId);
      else releaseUnmuted(playerId);
      return next;
    });
  }

  function openExpand(event?: MouseEvent) {
    event?.stopPropagation();
    if (onRequestExpand) {
      onRequestExpand();
      return;
    }
    setExpanded(true);
  }

  function closeExpand() {
    if (overlayOnly) {
      onCloseExpand?.();
      return;
    }
    setExpanded(false);
    onCloseExpand?.();
  }

  const handleSwipeStart = useCallback((clientX: number, clientY: number) => {
    if (!reelNavigation) return;
    swipeRef.current = { x: clientX, y: clientY, active: true };
  }, [reelNavigation]);

  const handleSwipeEnd = useCallback((clientX: number, clientY: number) => {
    if (!reelNavigation || !swipeRef.current.active) return;
    swipeRef.current.active = false;
    const dx = clientX - swipeRef.current.x;
    const dy = clientY - swipeRef.current.y;
    if (Math.abs(dy) < 48 || Math.abs(dy) < Math.abs(dx) * 1.15) return;
    if (dy < 0) reelNavigation.onNext();
    else reelNavigation.onPrev();
  }, [reelNavigation]);

  const handleWheelNavigate = useCallback((deltaY: number) => {
    if (!reelNavigation || Math.abs(deltaY) < 24) return;
    if (deltaY > 0) reelNavigation.onNext();
    else reelNavigation.onPrev();
  }, [reelNavigation]);

  useEffect(() => {
    if (!expanded || !reelNavigation) return;
    const nav = reelNavigation;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        nav.onNext();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        nav.onPrev();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, reelNavigation]);

  const stopCommentTouch = useCallback((event: React.TouchEvent | React.WheelEvent) => {
    event.stopPropagation();
  }, []);

  const inlineLandscape = videoAspect.isLandscape;
  const inlineWrapClass = inlineLandscape
    ? 'relative mx-auto aspect-video w-full max-w-full min-h-[13rem] bg-black'
    : `relative mx-auto w-full bg-black ${videoAspect.maxWidthClass} ${
        videoAspect.isReady ? '' : videoAspect.aspectClass
      }`;
  const inlineWrapStyle =
    !inlineLandscape && videoAspect.isReady ? videoAspect.aspectStyle : undefined;

  const expandedOverlay =
    expanded && typeof document !== 'undefined' ? (
      <div className="fixed inset-0 z-[100] overflow-hidden overscroll-none bg-black">
        <div
          className="absolute inset-0"
          onTouchStart={(event: TouchEvent<HTMLDivElement>) => {
            const touch = event.touches[0];
            if (!touch) return;
            handleSwipeStart(touch.clientX, touch.clientY);
          }}
          onTouchEnd={(event: TouchEvent<HTMLDivElement>) => {
            const touch = event.changedTouches[0];
            if (!touch) return;
            handleSwipeEnd(touch.clientX, touch.clientY);
          }}
          onWheel={(event: WheelEvent<HTMLDivElement>) => {
            if (!reelNavigation) return;
            event.preventDefault();
            handleWheelNavigate(event.deltaY);
          }}
        >
          <video
            ref={fullRef}
            src={src}
            className="absolute inset-0 h-full w-full object-contain"
            muted={muted}
            loop={!storyMode}
            playsInline
            autoPlay
            preload="auto"
            onLoadedData={playExpandedVideo}
            onCanPlay={playExpandedVideo}
            onTimeUpdate={(event) => {
              if (!storyMode) return;
              const video = event.currentTarget;
              if (video.duration > 0) {
                setStoryProgress(Math.min(1, video.currentTime / video.duration));
              }
            }}
            onEnded={() => {
              if (!storyMode || commentsPanelOpen || !reelNavigation) return;
              setStoryProgress(1);
              reelNavigation.onNext();
            }}
            onClick={() => {
              if (reelNavigation) return;
              const el = fullRef.current;
              if (!el) return;
              if (el.paused) void el.play();
              else el.pause();
            }}
          />
          {reelNavigation ? (
            <>
              <button
                type="button"
                className="absolute inset-x-0 top-0 z-[5] h-[22%] md:hidden"
                aria-label="Clip siguiente"
                onClick={(event) => {
                  event.stopPropagation();
                  reelNavigation.onNext();
                }}
              />
              <button
                type="button"
                className="absolute inset-x-0 bottom-0 z-[5] h-[22%] md:hidden"
                aria-label="Clip anterior"
                onClick={(event) => {
                  event.stopPropagation();
                  reelNavigation.onPrev();
                }}
              />
            </>
          ) : null}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/85" />

        <div className="pointer-events-none absolute inset-0 z-10 flex min-h-0 flex-col">
          {storyMode && reelPosition && reelPosition.total > 0 ? (
            <div className="pointer-events-none flex shrink-0 gap-1 px-3 pt-[max(0.5rem,var(--lb-safe-top))]">
              {Array.from({ length: reelPosition.total }).map((_, segmentIndex) => {
                const current = reelPosition.current - 1;
                let fill = '0%';
                if (segmentIndex < current) fill = '100%';
                else if (segmentIndex === current) fill = `${Math.round(storyProgress * 100)}%`;
                return (
                  <div
                    key={segmentIndex}
                    className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-white/25"
                  >
                    <div
                      className="h-full rounded-full bg-white transition-[width] duration-75 ease-linear"
                      style={{ width: fill }}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}

          <div
            className={`pointer-events-auto flex shrink-0 items-start justify-between gap-3 p-3 ${
              storyMode ? 'pt-2' : 'pt-[max(0.75rem,var(--lb-safe-top))]'
            }`}
          >
            <button
              type="button"
              onClick={closeExpand}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
            <div className="flex items-center gap-2">
              {reelPosition ? (
                <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white/80 backdrop-blur-sm">
                  {reelPosition.current}/{reelPosition.total}
                </span>
              ) : null}
              <button
                type="button"
                onClick={toggleMute}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
                aria-label={muted ? 'Activar sonido' : 'Silenciar'}
              >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            </div>
          </div>

          <div className="pointer-events-none relative min-h-0 flex-1">
            {reelNavigation ? (
              <div className="pointer-events-auto absolute right-[4.75rem] top-1/2 z-20 flex -translate-y-1/2 flex-col gap-3 lg:right-[5.25rem]">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    reelNavigation.onNext();
                  }}
                  className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-black/15 text-white/30 opacity-70 transition hover:bg-black/35 hover:text-white/60 hover:opacity-100 lg:h-12 lg:w-12"
                  aria-label="Siguiente clip"
                >
                  <ChevronUp size={26} strokeWidth={2.25} />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    reelNavigation.onPrev();
                  }}
                  className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-black/15 text-white/30 opacity-70 transition hover:bg-black/35 hover:text-white/60 hover:opacity-100 lg:h-12 lg:w-12"
                  aria-label="Clip anterior"
                >
                  <ChevronDown size={26} strokeWidth={2.25} />
                </button>
              </div>
            ) : null}
            <div
              className={`pointer-events-auto absolute right-2 flex flex-col items-center gap-2 overflow-y-auto overscroll-contain pr-1 sm:right-3 sm:gap-3 ${
                commentsPanelOpen
                  ? 'bottom-[min(46dvh,calc(100dvh-8rem))] max-h-[min(40dvh,calc(100dvh-12rem))]'
                  : 'bottom-[max(1rem,var(--lb-safe-bottom))] max-h-[min(72dvh,calc(100dvh-6rem))] sm:bottom-4 sm:max-h-none'
              }`}
            >
              {authorUsername ? (
                <ReelGiftControls
                  authorUsername={authorUsername}
                  authorUid={authorUid}
                  postId={postId}
                />
              ) : null}
              <div className="relative flex flex-col items-center gap-1">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-black/55 shadow-lg backdrop-blur-sm sm:h-12 sm:w-12">
                  <BoomLikeButton
                    active={viewerReaction === 'like'}
                    busy={busy}
                    count={likes}
                    showCount={false}
                    size="md"
                    onToggle={() => onReact('like')}
                  />
                </div>
                <button
                  type="button"
                  disabled={likes === 0}
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowDislikers(false);
                    setShowLikers((v) => !v);
                  }}
                  className="text-[11px] font-bold text-white drop-shadow disabled:opacity-40"
                >
                  {likes}
                </button>
                {showLikers ? (
                  <div className="absolute bottom-full right-0 mb-2">
                    <ReactionList title="Les gustó (Boom)" users={likers} onClose={() => setShowLikers(false)} />
                  </div>
                ) : null}
              </div>
              <div className="relative flex flex-col items-center gap-1">
                <OverlayIconButton
                  active={viewerReaction === 'dislike'}
                  activeClass="bg-fuchsia-500 text-zinc-950"
                  onClick={() => onReact('dislike')}
                  disabled={busy}
                >
                  <ThumbsDown size={20} />
                </OverlayIconButton>
                <button
                  type="button"
                  disabled={dislikes === 0}
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowLikers(false);
                    setShowDislikers((v) => !v);
                  }}
                  className="text-[11px] font-bold text-white drop-shadow disabled:opacity-40"
                >
                  {dislikes}
                </button>
                {showDislikers ? (
                  <div className="absolute bottom-full right-0 mb-2">
                    <ReactionList title="No les gustó" users={dislikers} onClose={() => setShowDislikers(false)} />
                  </div>
                ) : null}
              </div>
              <div className="relative flex flex-col items-center gap-0.5">
                <OverlayIconButton
                  active={commentsPanelOpen}
                  activeClass="bg-cyan-500 text-zinc-950"
                  onClick={() => setCommentsPanelOpen((value) => !value)}
                >
                  <MessageCircle size={20} />
                </OverlayIconButton>
                <span className="min-h-[14px] text-[10px] font-bold text-white drop-shadow">
                  {commentCount > 0 ? commentCount : 'Comentar'}
                </span>
              </div>
              {shareUrl ? (
                <ShareContentButton
                  url={shareUrl}
                  title={shareTitle}
                  text={shareText}
                  mediaUrl={src}
                  mediaType="video"
                  iconOnly
                />
              ) : null}
            </div>
          </div>

          {commentsPanelOpen ? (
            <div
              className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex max-h-[min(44dvh,calc(100dvh-5rem))] flex-col rounded-t-2xl border border-white/15 bg-zinc-950/95 backdrop-blur-md pb-[max(0px,var(--lb-safe-bottom))]"
              onTouchStart={stopCommentTouch}
              onTouchMove={stopCommentTouch}
              onWheel={stopCommentTouch}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
                <p className="text-sm font-semibold text-white">Comentarios</p>
                <button
                  type="button"
                  onClick={() => setCommentsPanelOpen(false)}
                  className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white"
                  aria-label="Cerrar comentarios"
                >
                  <X size={16} />
                </button>
              </div>
              <PostComments
                postId={postId}
                authorUid={authorUid}
                variant="overlay"
                defaultOpen
                scrollable
                embedded
                commentCountRef={setCommentCount}
              />
            </div>
          ) : null}

          {!commentsPanelOpen ? (
          <div
            className="pointer-events-auto relative z-20 mt-auto shrink-0 space-y-2 px-3 pb-[max(0.75rem,var(--lb-safe-bottom))]"
          >
            {authorUsername ? (
              <Link
                to={profileHref(authorUsername, authorUid)}
                className="inline-block text-sm font-bold text-white drop-shadow hover:text-cyan-300"
              >
                @{authorUsername}
              </Link>
            ) : null}
            {caption ? (
              <p className="line-clamp-3 text-sm font-medium text-white/90 drop-shadow">
                <EmojiText text={caption} size={COMMENT_EMOJI_SIZE} />
              </p>
            ) : null}

            {canChangeVisibility ? (
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    ['public', Globe, 'Público'],
                    ['friends', Users, 'Amigos'],
                    ['private', Lock, 'Privado'],
                  ] as const
                ).map(([value, Icon, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onChangeVisibility?.(value)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold backdrop-blur-sm ${
                      visibility === value
                        ? 'bg-emerald-400 text-zinc-950'
                        : 'bg-white/15 text-white'
                    }`}
                  >
                    <Icon size={12} />
                    {label}
                  </button>
                ))}
                {canDelete ? (
                  <button
                    type="button"
                    onClick={onDelete}
                    className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-rose-200 backdrop-blur-sm"
                  >
                    Eliminar
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          ) : null}
        </div>
      </div>
    ) : null;

  return (
    <>
      {!overlayOnly ? (
        <div ref={wrapRef} className={inlineWrapClass} style={inlineWrapStyle}>
          <video
            ref={inlineRef}
            src={src}
            className="h-full w-full object-contain"
            muted={muted}
            loop
            playsInline
            preload="metadata"
            onClick={openExpand}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
              aria-label={muted ? 'Activar sonido' : 'Silenciar'}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button
              type="button"
              onClick={openExpand}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-black/55 px-3 py-2 text-xs font-bold text-white backdrop-blur-sm"
            >
              <Maximize2 size={14} /> Expandir
            </button>
            {shareUrl ? (
              <ShareContentButton
                url={shareUrl}
                title={shareTitle}
                text={shareText}
                mediaUrl={src}
                mediaType="video"
                iconOnly
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {expandedOverlay ? createPortal(expandedOverlay, document.body) : null}
    </>
  );
}

function OverlayIconButton({
  children,
  onClick,
  disabled,
  active,
  activeClass,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  activeClass: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`grid h-10 w-10 place-items-center rounded-full shadow-lg backdrop-blur-sm transition disabled:opacity-50 sm:h-12 sm:w-12 ${
        active ? activeClass : 'bg-black/55 text-white'
      }`}
    >
      {children}
    </button>
  );
}

export function PostComments({
  postId,
  authorUid,
  variant = 'inline',
  defaultOpen = false,
  scrollable = false,
  commentCountRef,
  embedded = false,
}: {
  postId: string;
  authorUid?: string;
  variant?: 'inline' | 'overlay';
  defaultOpen?: boolean;
  /** Lista de comentarios con scroll propio (reels). */
  scrollable?: boolean;
  /** Notifica el conteo al padre (p. ej. barra de acciones). */
  commentCountRef?: (count: number) => void;
  /** Sin cabecera propia (panel lateral del visor). */
  embedded?: boolean;
}) {
  const profile = useAuthStore((state) => state.profile);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(defaultOpen);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<EmojiInputHandle>(null);

  useEffect(() => {
    return listenPostComments(postId, (list) => {
      setComments(list);
      commentCountRef?.(list.length);
    });
  }, [postId, commentCountRef]);

  useEffect(() => {
    if (defaultOpen) setExpanded(true);
  }, [defaultOpen]);

  useEffect(() => {
    if (!expanded) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }, [comments.length, expanded]);

  async function submit() {
    if (!profile) {
      setError('Inicia sesión para comentar');
      return;
    }
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      await addPostComment(
        postId,
        {
          firebaseUid: profile.firebaseUid,
          handle: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
        body,
      );
      setText('');
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar el comentario');
    } finally {
      setBusy(false);
    }
  }

  async function remove(commentId: string) {
    setError(null);
    try {
      await deletePostComment(postId, commentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el comentario');
    }
  }

  const overlay = variant === 'overlay';
  const preview = comments.slice(-2);
  const visible = expanded ? comments : preview;
  const listClass = scrollable && overlay
    ? 'min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]'
    : `space-y-2 overflow-y-auto ${overlay ? 'max-h-[36dvh]' : 'max-h-64'}`;

  return (
    <div
      className={
        overlay
          ? scrollable
            ? `flex min-h-0 flex-1 flex-col ${embedded ? 'px-3 pb-3' : 'px-3 py-2.5'}`
            : embedded
              ? 'px-3 pb-3'
              : 'px-3 py-2.5'
          : 'border-t border-white/5 px-3 py-3'
      }
    >
      {!embedded ? (
      <div className="mb-2 flex w-full items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${
            overlay ? 'text-white/70' : 'text-zinc-500'
          }`}
        >
          <MessageCircle size={12} className="shrink-0" />
          <span className="truncate">Comentarios</span>
          {comments.length > 0 ? (
            <span className={overlay ? 'text-white/50' : 'text-zinc-400'}>{comments.length}</span>
          ) : null}
          {comments.length > 2 ? (
            <span className={`normal-case ${overlay ? 'text-cyan-300' : 'text-cyan-400'}`}>
              {expanded ? '· ocultar' : '· ver todos'}
            </span>
          ) : null}
        </button>
        {!expanded && profile ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={`shrink-0 text-[11px] font-semibold ${overlay ? 'text-cyan-300' : 'text-cyan-400'}`}
          >
            Comentar…
          </button>
        ) : null}
      </div>
      ) : null}

      {!embedded && !expanded && comments.length > 0 ? (
        <ul className={`space-y-1.5 ${comments.length > 2 ? 'opacity-70' : ''}`}>
          {preview.map((comment) => (
            <li
              key={comment.id}
              className={overlay ? 'rounded-lg bg-white/10 px-2 py-1.5' : 'rounded-lg bg-zinc-900/60 px-2 py-1.5'}
            >
              <p className={`text-[11px] ${overlay ? 'text-white/90' : 'text-zinc-300'}`}>
                <span className={overlay ? 'font-semibold text-cyan-300' : 'font-semibold text-cyan-400'}>
                  @{comment.username}
                </span>{' '}
                <EmojiText text={comment.text} size={COMMENT_EMOJI_SIZE_COMPACT} className={overlay ? 'text-white/90' : 'text-zinc-300'} />
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {embedded || expanded ? (
        <div className={scrollable && overlay ? 'flex min-h-0 flex-1 flex-col' : undefined}>
          <ul ref={listRef} className={listClass}>
            {comments.length === 0 ? (
              <li className={`text-[11px] ${overlay ? 'text-white/45' : 'text-zinc-600'}`}>
                Sé el primero en comentar.
              </li>
            ) : (
              visible.map((comment) => {
                const canRemove =
                  Boolean(profile) &&
                  (profile!.firebaseUid === comment.authorUid ||
                    (authorUid && profile!.firebaseUid === authorUid));
                return (
                  <li
                    key={comment.id}
                    className={
                      overlay ? 'rounded-xl bg-white/10 px-2.5 py-2' : 'rounded-xl bg-zinc-900/80 px-2.5 py-2'
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to={profileHref(comment.username, comment.authorUid)}
                        className={`text-[11px] font-semibold ${
                          overlay ? 'text-cyan-300' : 'text-cyan-400'
                        }`}
                      >
                        @{comment.username}
                      </Link>
                      {canRemove ? (
                        <button
                          type="button"
                          onClick={() => void remove(comment.id)}
                          className={`text-[10px] ${overlay ? 'text-white/40 hover:text-rose-300' : 'text-zinc-600 hover:text-rose-400'}`}
                        >
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                    <p className={`mt-0.5 text-xs ${overlay ? 'text-white/90' : 'text-zinc-200'}`}>
                      <EmojiText text={comment.text} size={COMMENT_EMOJI_SIZE} />
                    </p>
                  </li>
                );
              })
            )}
          </ul>
          <form
            className={`mt-2 flex shrink-0 items-end gap-2 ${scrollable && overlay ? 'pt-2' : ''}`}
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <EmojiInput
              ref={inputRef}
              value={text}
              onChange={setText}
              placeholder={profile ? 'Escribe un comentario…' : 'Inicia sesión para comentar'}
              disabled={!profile || busy}
              maxLength={280}
              emojiSize={COMMENT_EMOJI_SIZE}
              mirrorTextClassName={overlay ? 'text-white/90' : 'text-zinc-200'}
              fieldClassName={`min-h-10 rounded-xl ${
                overlay
                  ? 'border border-white/20 bg-black/40'
                  : 'border border-white/10 bg-zinc-900'
              }`}
              placeholderClassName={overlay ? 'text-white/40' : 'text-zinc-600'}
            />
            <EmojiPickerButton
              placement="above"
              onPick={(id) => setText((t) => insertEmojiToken(t, id))}
            />
            <button
              type="submit"
              disabled={!profile || busy || !text.trim()}
              className="min-h-10 shrink-0 rounded-xl bg-cyan-500 px-3 text-xs font-bold text-zinc-950 disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
        </div>
      ) : null}
      {error ? (
        <p className={`mt-1.5 text-[11px] ${overlay ? 'text-rose-300' : 'text-fuchsia-400'}`}>{error}</p>
      ) : null}
    </div>
  );
}
