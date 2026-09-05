import {
  Globe,
  Lock,
  Maximize2,
  MessageCircle,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  X,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  addPostComment,
  deletePostComment,
  listenPostComments,
  type PostComment,
  type PostCommentMedia,
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
import { useIsDesktop } from '../../hooks/useBreakpoint';
import { buildPostShareUrl } from '../../lib/shareContent';
import { captureHtmlVideoPoster } from '../../lib/videoPoster';
import { uploadUserMedia } from '../../lib/storage';
import { ShareContentButton } from './ShareContentButton';
import { type EmojiInputHandle } from './EmojiInput';
import { EmojiText } from './EmojiText';
import { CommentComposerBar, type CommentDraftAttachment } from './CommentComposerBar';
import { CommentMediaThumb, commentPlainText } from './CommentMediaThumb';
import { CommentMediaViewer, type CommentMediaViewerItem } from './CommentMediaViewer';
import { CommentBoomReaction } from './CommentBoomButton';
import { PublicationCaption } from './PublicationCaption';
import { StorySegmentBar } from './StorySegmentBar';
import {
  classifyStoryGesture,
  STORY_WHEEL_COOLDOWN_MS,
  STORY_WHEEL_MIN_DELTA,
} from '../../lib/storyAuthorNav';
import { COMMENT_EMOJI_SIZE, COMMENT_EMOJI_SIZE_COMPACT } from '../../lib/liveboomEmojis';
import { PostActionRail } from './PostActionRail';
import { ImmersiveMediaStage } from './ImmersiveMediaStage';
import { PublicationMedia } from './PublicationMedia';
import { profileHref } from '../../lib/profileFirestore';
import { useAuthStore } from '../../store/authStore';
import { MediaOverlayLayer } from './MediaOverlayLayer';
import type { MediaOverlayItem } from '../../lib/mediaOverlays';

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
  canEdit?: boolean;
  onEdit?: () => void;
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
  /** Flash Boom / Boom Clip: swipe horizontal para cambiar de usuario. */
  userNavigation?: {
    onNextUser: () => void;
    onPrevUser: () => void;
  };
  /** Modo Flash Boom / Boom Clip: auto-avance + barras de progreso. */
  storyMode?: boolean;
  /** Toque izquierdo/derecho cambia de ítem (no seek ±10s). */
  itemSideNav?: boolean;
  /** Duración conocida del clip (s); respaldo si el video aún no reporta duration. */
  durationSec?: number | null;
  /** Foto del creador (se completa vía perfil si falta). */
  authorAvatarUrl?: string | null;
  /** Feed embebido en página (Explorar): sin portal fullscreen. */
  embedded?: boolean;
  /** Oculta el botón cerrar (p. ej. Explorar como página). */
  hideClose?: boolean;
  /** Badge discreto: Boom Clip / Publicación. */
  contentBadge?: string | null;
  /** Rail en visor inmersivo: `corner` en móvil; en PC se usa aside (Explorar). */
  actionRailLayout?: 'corner' | 'default';
  /** Explorar / Flash Boom: media horizontal + rail fijo al lado. */
  immersiveLandscapeLayout?: boolean;
  /** Dimensiones conocidas (Publicaciones). */
  mediaWidth?: number;
  mediaHeight?: number;
  /** Poster/thumbnail de Publicaciones (evita bloque negro). */
  posterUrl?: string | null;
  /** Publicación: descripción con Ver más / Ver menos. Default false (Boom Clip / Flash / Explorar). */
  publicationCaption?: boolean;
  /** Si este clip/flash es un repost, quién lo compartió. */
  repostByUsername?: string | null;
  originalUsername?: string | null;
  originalHref?: string | null;
  overlays?: MediaOverlayItem[];
};

const SEEK_STEP_SEC = 10;

export function PostVideoPlayer({
  src,
  postId,
  authorUid,
  authorUsername,
  authorAvatarUrl,
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
  canEdit,
  onEdit,
  startExpanded = false,
  onCloseExpand,
  onExpandChange,
  onRequestExpand,
  overlayOnly = false,
  reelNavigation,
  reelPosition,
  userNavigation,
  storyMode = false,
  itemSideNav = false,
  durationSec: durationSecProp = null,
  embedded = false,
  hideClose = false,
  contentBadge = null,
  actionRailLayout = 'corner',
  immersiveLandscapeLayout = false,
  mediaWidth: mediaWidthProp,
  mediaHeight: mediaHeightProp,
  posterUrl: posterUrlProp = null,
  publicationCaption = false,
  repostByUsername = null,
  originalUsername = null,
  originalHref = null,
  overlays = [],
}: Props) {
  const reactId = useId();
  const playerId = `post-video-${postId}-${reactId}`;
  const isDesktop = useIsDesktop();
  const [deviceLandscape, setDeviceLandscape] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const posterCapturedRef = useRef(false);
  const swipeRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const wheelLockRef = useRef(0);
  const gestureLockRef = useRef(false);
  const playbackSnapshotRef = useRef({
    time: 0,
    playing: false,
    muted: true,
    volume: 1,
  });
  const [expanded, setExpanded] = useState(startExpanded || overlayOnly);
  const [runtimePoster, setRuntimePoster] = useState<string | null>(null);
  const expandedRef = useRef(false);
  const [muted, setMuted] = useState(true);
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [storyProgress, setStoryProgress] = useState(0);
  const [seekHint, setSeekHint] = useState<string | null>(null);
  const [playbackFlash, setPlaybackFlash] = useState<'play' | 'pause' | null>(null);
  const playbackFlashTimerRef = useRef<number | null>(null);
  const [mediaSize, setMediaSize] = useState({ width: 0, height: 0 });
  const shareUrl =
    authorUsername && postId
      ? buildPostShareUrl(authorUsername, postId, authorUid)
      : null;
  const shareTitle = authorUsername ? `@${authorUsername} en LiveBoom` : 'LiveBoom';
  const shareText =
    caption?.trim() ||
    (authorUsername ? `Mira este video de @${authorUsername} en LiveBoom` : 'Mira este video en LiveBoom');
  const videoAspect = useVideoAspect(src);
  const storyHeld = commentsPanelOpen || giftsOpen;

  useEffect(() => {
    if (videoAspect.isReady) {
      setMediaSize({ width: videoAspect.width, height: videoAspect.height });
    }
  }, [videoAspect.width, videoAspect.height, videoAspect.isReady]);

  useEffect(() => {
    if (mediaWidthProp && mediaWidthProp > 0 && mediaHeightProp && mediaHeightProp > 0) {
      setMediaSize({ width: mediaWidthProp, height: mediaHeightProp });
    }
  }, [mediaWidthProp, mediaHeightProp]);

  useEffect(() => {
    posterCapturedRef.current = false;
    setRuntimePoster(null);
  }, [src]);

  useEffect(() => {
    if (onRequestExpand) return;
    if (startExpanded || overlayOnly) setExpanded(true);
  }, [startExpanded, overlayOnly, onRequestExpand]);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  useEffect(() => {
    onExpandChange?.(expanded);
  }, [expanded, onExpandChange]);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    const sync = () => setDeviceLandscape(mq.matches && window.innerWidth < 1024);
    sync();
    mq.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  useEffect(() => {
    if (!seekHint) return;
    const timer = window.setTimeout(() => setSeekHint(null), 900);
    return () => window.clearTimeout(timer);
  }, [seekHint]);

  useEffect(() => {
    setStoryProgress(0);
    setCommentsPanelOpen(false);
    setGiftsOpen(false);
    setSeekHint(null);
  }, [postId, src]);

  useEffect(() => {
    if (!storyMode) return;
    const video = videoRef.current;
    if (!video) return;

    let raf = 0;
    const tick = () => {
      if (!video.paused) {
        const reported = video.duration;
        const dur =
          Number.isFinite(reported) && reported > 0
            ? reported
            : Number(durationSecProp) > 0
              ? Number(durationSecProp)
              : 0;
        if (dur > 0) {
          setStoryProgress(Math.min(1, video.currentTime / dur));
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [storyMode, src, postId, durationSecProp]);

  useEffect(() => {
    if (!storyMode) return;
    const video = videoRef.current;
    if (!video) return;
    if (commentsPanelOpen || giftsOpen) {
      video.pause();
      return;
    }
    void video.play().catch(() => undefined);
  }, [commentsPanelOpen, giftsOpen, storyMode, src, postId]);

  useEffect(() => {
    if (!expanded) return;
    return listenPostComments(postId, (list) => setCommentCount(list.length));
  }, [expanded, postId]);

  useEffect(() => {
    return registerFeedVideo({
      id: playerId,
      pause: () => {
        videoRef.current?.pause();
      },
      mute: () => {
        setMuted(true);
        if (videoRef.current) videoRef.current.muted = true;
      },
    });
  }, [playerId]);

  // Autoplay muted en viewport (solo inline; nunca pausar al expandir)
  useEffect(() => {
    const host = wrapRef.current;
    const video = videoRef.current;
    if (!host || !video || overlayOnly) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (expandedRef.current) return;
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
          if (video.muted) {
            void video.play().catch(() => undefined);
          } else {
            void video.play().catch(() => undefined);
          }
        } else if (!expandedRef.current) {
          video.pause();
        }
      },
      { threshold: [0, 0.45, 0.75] },
    );
    io.observe(host);
    return () => {
      io.disconnect();
      if (!expandedRef.current) video.pause();
    };
  }, [src, overlayOnly]);

  // Boom Clip / Flash / Explorar: autoplay al abrir cada clip
  useEffect(() => {
    if (!overlayOnly) return;
    const video = videoRef.current;
    if (!video) return;
    const start = () => {
      void video.play().catch(() => undefined);
    };
    if (video.readyState >= 2) start();
    else video.addEventListener('loadeddata', start, { once: true });
  }, [overlayOnly, src, postId]);

  const flashPlayback = useCallback((state: 'play' | 'pause') => {
    setPlaybackFlash(state);
    if (playbackFlashTimerRef.current) window.clearTimeout(playbackFlashTimerRef.current);
    playbackFlashTimerRef.current = window.setTimeout(() => setPlaybackFlash(null), 650);
  }, []);

  const toggleExpandedPlayback = useCallback(
    (event?: MouseEvent) => {
      event?.stopPropagation();
      const el = videoRef.current;
      if (!el) return;
      if (el.paused) {
        void el.play().catch(() => undefined);
        flashPlayback('play');
      } else {
        el.pause();
        flashPlayback('pause');
      }
    },
    [flashPlayback],
  );

  const seekExpanded = useCallback((deltaSec: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + deltaSec));
    if (!Number.isFinite(next)) return;
    video.currentTime = next;
    setSeekHint(deltaSec < 0 ? `-${SEEK_STEP_SEC}s` : `+${SEEK_STEP_SEC}s`);
    if (video.paused) void video.play().catch(() => undefined);
  }, []);

  const capturePlaybackSnapshot = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    playbackSnapshotRef.current = {
      time: video.currentTime,
      playing: !video.paused,
      muted: video.muted,
      volume: video.volume,
    };
  }, []);

  const restorePlaybackSnapshot = useCallback(() => {
    const video = videoRef.current;
    const snap = playbackSnapshotRef.current;
    if (!video) return;

    const apply = () => {
      if (Number.isFinite(snap.time)) {
        video.currentTime = snap.time;
      }
      video.muted = snap.muted;
      video.volume = snap.volume;
      setMuted(snap.muted);
      if (!snap.muted) claimUnmuted(playerId);
      else releaseUnmuted(playerId);
      if (snap.playing) {
        void video.play().catch(() => undefined);
      }
    };

    if (video.readyState >= 2) apply();
    else video.addEventListener('loadeddata', apply, { once: true });
  }, [playerId]);

  // Expandido: portal a body + restaurar reproducción al montar el video
  useLayoutEffect(() => {
    if (!expanded) {
      releaseExclusivePlayback(playerId);
      if (!overlayOnly) restorePlaybackSnapshot();
      return;
    }

    claimExclusivePlayback(playerId);
    const prevOverflow = document.body.style.overflow;
    if (!embedded && !overlayOnly) document.body.style.overflow = 'hidden';
    restorePlaybackSnapshot();
    return () => {
      if (!embedded && !overlayOnly) document.body.style.overflow = prevOverflow;
      releaseExclusivePlayback(playerId);
    };
  }, [expanded, playerId, embedded, overlayOnly, restorePlaybackSnapshot]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
    if (!muted) claimUnmuted(playerId);
    else releaseUnmuted(playerId);
  }, [muted, playerId]);

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
    event?.preventDefault();
    if (onRequestExpand) {
      onRequestExpand();
      return;
    }
    capturePlaybackSnapshot();
    expandedRef.current = true;
    setExpanded(true);
  }

  function closeExpand() {
    if (overlayOnly) {
      onCloseExpand?.();
      return;
    }
    capturePlaybackSnapshot();
    expandedRef.current = false;
    setExpanded(false);
    onCloseExpand?.();
  }

  const handleSwipeStart = useCallback((clientX: number, clientY: number) => {
    if (!reelNavigation && !userNavigation) return;
    swipeRef.current = { x: clientX, y: clientY, active: true };
  }, [reelNavigation, userNavigation]);

  const handleSwipeEnd = useCallback((clientX: number, clientY: number) => {
    if (!swipeRef.current.active) return;
    swipeRef.current.active = false;
    if (storyHeld) return;
    const dx = clientX - swipeRef.current.x;
    const dy = clientY - swipeRef.current.y;
    const gesture = classifyStoryGesture(dx, dy);
    if (!gesture) return;
    if (gesture === 'user-next' || gesture === 'user-prev') {
      if (!userNavigation) return;
      gestureLockRef.current = true;
      window.setTimeout(() => {
        gestureLockRef.current = false;
      }, 80);
      if (gesture === 'user-next') userNavigation.onNextUser();
      else userNavigation.onPrevUser();
      return;
    }
    if (!reelNavigation) return;
    gestureLockRef.current = true;
    window.setTimeout(() => {
      gestureLockRef.current = false;
    }, 80);
    if (gesture === 'item-next') reelNavigation.onNext();
    else reelNavigation.onPrev();
  }, [reelNavigation, userNavigation, storyHeld]);

  const handleWheelNavigate = useCallback((deltaY: number) => {
    if (!reelNavigation || storyHeld || Math.abs(deltaY) < STORY_WHEEL_MIN_DELTA) return;
    if (storyMode) {
      const now = Date.now();
      if (now - wheelLockRef.current < STORY_WHEEL_COOLDOWN_MS) return;
      wheelLockRef.current = now;
    }
    if (deltaY > 0) reelNavigation.onNext();
    else reelNavigation.onPrev();
  }, [reelNavigation, storyHeld, storyMode]);

  useEffect(() => {
    if (!expanded) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (hideClose) return;
        event.preventDefault();
        closeExpand();
        return;
      }
      if (!reelNavigation) return;
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (storyMode) reelNavigation.onPrev();
        else reelNavigation.onNext();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (storyMode) reelNavigation.onNext();
        else reelNavigation.onPrev();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, reelNavigation, storyMode, hideClose]);

  const stopCommentTouch = useCallback((event: React.TouchEvent | React.WheelEvent) => {
    event.stopPropagation();
  }, []);

  const resolvedPoster = posterUrlProp || runtimePoster;
  const pubW =
    mediaSize.width || mediaWidthProp || (videoAspect.isReady ? videoAspect.width : 0) || 0;
  const pubH =
    mediaSize.height || mediaHeightProp || (videoAspect.isReady ? videoAspect.height : 0) || 0;

  const tryCapturePoster = useCallback(() => {
    if (overlayOnly || posterUrlProp || posterCapturedRef.current) return;
    const el = videoRef.current;
    if (!el || el.videoWidth <= 0) return;
    const shot = captureHtmlVideoPoster(el);
    if (shot) {
      posterCapturedRef.current = true;
      setRuntimePoster(shot);
    }
  }, [overlayOnly, posterUrlProp]);

  const videoNode = (
    <video
      ref={videoRef}
      src={src}
      poster={resolvedPoster || undefined}
      className="lb-post-media__video h-full w-full object-contain"
      muted={muted}
      loop={!storyMode}
      playsInline
      preload={expanded || overlayOnly ? 'auto' : 'metadata'}
      onClick={
        !expanded && !overlayOnly
          ? (event) => {
              event.stopPropagation();
              const el = videoRef.current;
              if (!el) return;
              if (el.paused) void el.play().catch(() => undefined);
              else el.pause();
            }
          : undefined
      }
      onLoadedMetadata={(event) => {
        const video = event.currentTarget;
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          setMediaSize({ width: video.videoWidth, height: video.videoHeight });
        }
      }}
      onLoadedData={() => {
        tryCapturePoster();
      }}
      onTimeUpdate={(event) => {
        if (!storyMode || storyHeld) return;
        const video = event.currentTarget;
        const reported = video.duration;
        const dur =
          Number.isFinite(reported) && reported > 0
            ? reported
            : Number(durationSecProp) > 0
              ? Number(durationSecProp)
              : 0;
        if (dur > 0) {
          setStoryProgress(Math.min(1, video.currentTime / dur));
        }
      }}
      onEnded={() => {
        if (!storyMode || storyHeld || !reelNavigation) return;
        setStoryProgress(1);
        reelNavigation.onNext();
      }}
    />
  );

  const immersiveW = pubW || videoAspect.width || 9;
  const immersiveH = pubH || videoAspect.height || 16;
  // Rail al lado del media en PC (igual que Explorar). En móvil landscape → borde.
  const useLandscapeAside = isDesktop;
  const parkRailAtDeviceEdge = deviceLandscape;
  const expandedRailLayout =
    useLandscapeAside || parkRailAtDeviceEdge ? 'aside' : actionRailLayout;
  /** Publicaciones (feed): contain en fullscreen; Explorar/clips mantienen auto. */
  const publicationFillMode = !overlayOnly && !immersiveLandscapeLayout ? 'contain' : 'auto';

  const expandedChrome =
    expanded && (embedded || typeof document !== 'undefined') ? (
      <div
        className={`${
          embedded ? 'absolute inset-0 z-10' : 'fixed inset-0 z-[100] h-[100dvh] max-h-[100dvh]'
        } overflow-hidden overscroll-none bg-black`}
      >
        <ImmersiveMediaStage
          mediaWidth={immersiveW}
          mediaHeight={immersiveH}
          mediaUrl={src}
          mediaKind="video"
          embedded={embedded}
          landscapeRailAside
          fillMode={publicationFillMode}
          insets={{
            top: storyMode ? 44 : 52,
            bottom: embedded ? 88 : 112,
            left: 4,
            right: 4,
            actionRail: 56,
          }}
          onSwipeStart={handleSwipeStart}
          onSwipeEnd={handleSwipeEnd}
          onWheel={reelNavigation ? handleWheelNavigate : undefined}
          mediaOverlay={
            <>
              <MediaOverlayLayer overlays={overlays} />
              {itemSideNav && reelNavigation && !storyHeld ? (
              <>
                <button
                  type="button"
                  className="absolute inset-y-0 left-0 z-[4] w-[32%] bg-transparent"
                  aria-label="Anterior"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (gestureLockRef.current) return;
                    reelNavigation.onPrev();
                  }}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 z-[4] w-[50%] bg-transparent"
                  aria-label="Siguiente"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (gestureLockRef.current) return;
                    reelNavigation.onNext();
                  }}
                />
                {playbackFlash ? (
                  <div className="pointer-events-none absolute inset-0 z-[7] grid place-items-center">
                    <div className="lb-playback-flash grid h-16 w-16 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm sm:h-[4.5rem] sm:w-[4.5rem]">
                      {playbackFlash === 'play' ? (
                        <Play size={34} fill="currentColor" className="ml-1" />
                      ) : (
                        <Pause size={34} fill="currentColor" />
                      )}
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="absolute bottom-0 left-[32%] right-[50%] top-0 z-[3] bg-transparent"
                  aria-label="Reproducir o pausar"
                  onClick={toggleExpandedPlayback}
                />
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`absolute left-0 z-[4] w-[28%] bg-transparent ${
                    reelNavigation ? 'top-[18%] bottom-[18%]' : 'inset-y-0'
                  }`}
                  aria-label={`Retroceder ${SEEK_STEP_SEC} segundos`}
                  onClick={(event) => {
                    event.stopPropagation();
                    seekExpanded(-SEEK_STEP_SEC);
                  }}
                />
                <button
                  type="button"
                  className={`absolute right-0 z-[4] w-[28%] bg-transparent ${
                    reelNavigation ? 'top-[18%] bottom-[18%]' : 'inset-y-0'
                  }`}
                  aria-label={`Adelantar ${SEEK_STEP_SEC} segundos`}
                  onClick={(event) => {
                    event.stopPropagation();
                    seekExpanded(SEEK_STEP_SEC);
                  }}
                />
                {seekHint ? (
                  <div className="pointer-events-none absolute inset-0 z-[6] grid place-items-center">
                    <span className="rounded-full bg-black/65 px-4 py-2 text-lg font-bold tabular-nums text-white backdrop-blur-sm">
                      {seekHint}
                    </span>
                  </div>
                ) : null}
                {playbackFlash ? (
                  <div className="pointer-events-none absolute inset-0 z-[7] grid place-items-center">
                    <div className="lb-playback-flash grid h-16 w-16 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm sm:h-[4.5rem] sm:w-[4.5rem]">
                      {playbackFlash === 'play' ? (
                        <Play size={34} fill="currentColor" className="ml-1" />
                      ) : (
                        <Pause size={34} fill="currentColor" />
                      )}
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  className={`absolute inset-x-[28%] z-[3] bg-transparent ${
                    reelNavigation ? 'inset-y-[18%] md:inset-y-0' : 'inset-y-0'
                  }`}
                  aria-label="Reproducir o pausar"
                  onClick={toggleExpandedPlayback}
                />
                {reelNavigation ? (
                  <>
                    <button
                      type="button"
                      className="absolute inset-x-0 top-0 z-[5] h-[18%] lg:hidden"
                      aria-label="Clip siguiente"
                      onClick={(event) => {
                        event.stopPropagation();
                        reelNavigation.onNext();
                      }}
                    />
                    <button
                      type="button"
                      className="absolute inset-x-0 bottom-0 z-[5] h-[18%] lg:hidden"
                      aria-label="Clip anterior"
                      onClick={(event) => {
                        event.stopPropagation();
                        reelNavigation.onPrev();
                      }}
                    />
                  </>
                ) : null}
              </>
            )}
            </>
          }
          sideChrome={
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
              onReact={onReact}
              commentCount={commentCount}
              commentsOpen={commentsPanelOpen}
              onToggleComments={() => setCommentsPanelOpen((value) => !value)}
              shareUrl={shareUrl}
              shareTitle={shareTitle}
              shareText={shareText}
              mediaUrl={src}
              mediaType="video"
              commentsPanelOpen={commentsPanelOpen}
              onGiftsOpenChange={setGiftsOpen}
              anchor="media"
              layout={expandedRailLayout}
            />
          }
        >
          {videoNode}
        </ImmersiveMediaStage>

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/85" />

        <div className="pointer-events-none absolute inset-0 z-10 flex min-h-0 flex-col">
          {storyMode && reelPosition && reelPosition.total > 0 ? (
            <StorySegmentBar
              total={reelPosition.total}
              current={reelPosition.current}
              progress={storyProgress}
            />
          ) : null}

          <div
            className={`pointer-events-auto flex shrink-0 items-start justify-between gap-3 p-3 ${
              storyMode
                ? 'pt-2'
                : parkRailAtDeviceEdge
                  ? 'pt-[max(0.35rem,var(--lb-safe-top))]'
                  : embedded
                    ? 'pt-3'
                    : 'pt-[max(0.75rem,var(--lb-safe-top))]'
            }`}
          >
            {hideClose ? (
              parkRailAtDeviceEdge ? (
                <span className="inline-flex h-8 w-8" aria-hidden />
              ) : (
                <span className="inline-flex h-10 items-center rounded-full bg-black/45 px-3 text-[11px] font-bold uppercase tracking-wider text-cyan-200/90 backdrop-blur-sm">
                  Explorar
                </span>
              )
            ) : (
              <button
                type="button"
                onClick={closeExpand}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            )}
            <div className="flex items-center gap-2">
              {reelPosition ? (
                <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white/80 backdrop-blur-sm">
                  {reelPosition.current}/{reelPosition.total}
                </span>
              ) : null}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  seekExpanded(-SEEK_STEP_SEC);
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm lg:hidden"
                aria-label={`Retroceder ${SEEK_STEP_SEC} segundos`}
              >
                <RotateCcw size={17} />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  seekExpanded(SEEK_STEP_SEC);
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm lg:hidden"
                aria-label={`Adelantar ${SEEK_STEP_SEC} segundos`}
              >
                <RotateCw size={17} />
              </button>
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

          {commentsPanelOpen ? (
            <div
              className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex max-h-[min(44dvh,calc(100dvh-5rem))] min-w-0 flex-col overflow-x-hidden rounded-t-2xl border border-white/15 bg-zinc-950/95 backdrop-blur-md pb-[max(0px,var(--lb-safe-bottom))]"
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
            className={`pointer-events-auto relative z-20 mt-auto min-w-0 max-w-full shrink-0 space-y-2 px-3 ${
              embedded || overlayOnly
                ? 'pb-[max(0.75rem,var(--lb-safe-bottom))] pl-[4.25rem] sm:pl-[4.75rem] lg:pl-3'
                : 'pb-[max(0.75rem,var(--lb-safe-bottom))]'
            }`}
            style={{ paddingRight: 'max(0.75rem, env(safe-area-inset-right))' }}
          >
            {contentBadge ? (
              <span className="inline-flex rounded-md bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-200 ring-1 ring-white/15">
                {contentBadge}
              </span>
            ) : null}
            {repostByUsername ? (
              <p className="text-[11px] font-semibold text-fuchsia-200 drop-shadow">
                @{repostByUsername} reposteó
              </p>
            ) : null}
            {originalUsername ? (
              <Link
                to={originalHref || profileHref(originalUsername)}
                className="inline-block text-sm font-bold text-white drop-shadow hover:text-cyan-300"
              >
                @{originalUsername}
              </Link>
            ) : authorUsername ? (
              <Link
                to={profileHref(authorUsername, authorUid)}
                className="inline-block text-sm font-bold text-white drop-shadow hover:text-cyan-300"
              >
                @{authorUsername}
              </Link>
            ) : null}
            {caption ? (
              publicationCaption ? (
                <PublicationCaption caption={caption} variant="overlay" />
              ) : (
                <p className="line-clamp-3 text-sm font-medium text-white/90 drop-shadow">
                  <EmojiText text={caption} size={COMMENT_EMOJI_SIZE} />
                </p>
              )
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
                {canEdit ? (
                  <button
                    type="button"
                    onClick={onEdit}
                    title="Editar publicación"
                    aria-label="Editar publicación"
                    className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-cyan-100 backdrop-blur-sm"
                  >
                    Editar
                  </button>
                ) : null}
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
      {overlayOnly ? (
        embedded ? (
          <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-black">
            {expandedChrome}
          </div>
        ) : (
          expandedChrome
        )
      ) : (
        <>
          {expanded ? (
            <div className="relative w-full min-w-0 lb-feed-media-frame" style={{ aspectRatio: pubW && pubH ? `${pubW} / ${pubH}` : '4 / 5', maxHeight: 'min(720px, 72dvh)' }} aria-hidden />
          ) : null}
          <div ref={wrapRef} className="relative w-full min-w-0">
            {!expanded ? (
              <PublicationMedia
                src={src}
                mediaKind="video"
                width={pubW}
                height={pubH}
                posterUrl={resolvedPoster}
                overlay={
                  <>
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
                          postId={postId}
                          authorUid={authorUid}
                          authorUsername={authorUsername}
                          iconOnly
                        />
                      ) : null}
                    </div>
                  </>
                }
              >
                <div className="relative h-full w-full">
                  {videoNode}
                  <MediaOverlayLayer overlays={overlays} />
                </div>
              </PublicationMedia>
            ) : null}
          </div>
          {expanded && typeof document !== 'undefined'
            ? createPortal(expandedChrome, document.body)
            : null}
        </>
      )}
    </>
  );
}

type CommentReplyTarget = {
  parentId: string;
  username: string;
  uid: string;
};

function buildCommentThreads(comments: PostComment[]) {
  const ids = new Set(comments.map((item) => item.id));
  const replies = new Map<string, PostComment[]>();
  const roots: PostComment[] = [];
  for (const comment of comments) {
    const parentId = comment.parentId && ids.has(comment.parentId) ? comment.parentId : '';
    if (!parentId) {
      roots.push(comment);
      continue;
    }
    const bucket = replies.get(parentId) || [];
    bucket.push(comment);
    replies.set(parentId, bucket);
  }
  for (const list of replies.values()) {
    list.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
  }
  return roots.map((root) => ({ root, replies: replies.get(root.id) || [] }));
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
  const [replyTo, setReplyTo] = useState<CommentReplyTarget | null>(null);
  const [mediaViewer, setMediaViewer] = useState<CommentMediaViewerItem | null>(null);
  const closeMediaViewer = useCallback(() => setMediaViewer(null), []);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<EmojiInputHandle>(null);

  const threads = useMemo(() => buildCommentThreads(comments), [comments]);

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
  }, [comments.length, expanded, replyTo?.parentId]);

  function startReply(rootId: string, comment: PostComment) {
    setReplyTo({
      parentId: rootId,
      username: comment.username,
      uid: comment.authorUid,
    });
    setExpanded(true);
    setError(null);
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function submit(attachment: CommentDraftAttachment | null = null) {
    if (!profile) {
      setError('Inicia sesión para comentar');
      throw new Error('Inicia sesión para comentar');
    }
    const body = text.trim();
    if (!body && !attachment) return;
    setBusy(true);
    setError(null);
    try {
      let media: PostCommentMedia | null = null;
      if (attachment?.kind === 'gif' && attachment.gifUrl) {
        media = {
          mediaUrl: attachment.gifUrl,
          mediaType: 'gif',
          mediaPreviewUrl: attachment.gifPreviewUrl || attachment.previewUrl,
        };
      } else if (attachment?.file) {
        const uploaded = await uploadUserMedia(
          profile.firebaseUid,
          attachment.file,
          attachment.file.name,
          'public',
          'publication',
        );
        media = {
          mediaUrl: uploaded.url,
          mediaType: attachment.kind === 'video' ? 'video' : 'image',
        };
      }
      await addPostComment(
        postId,
        {
          firebaseUid: profile.firebaseUid,
          handle: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
        body,
        replyTo
          ? {
              parentId: replyTo.parentId,
              replyToUid: replyTo.uid,
              replyToUsername: replyTo.username,
            }
          : null,
        media,
      );
      setText('');
      setReplyTo(null);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar el comentario');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function remove(commentId: string) {
    setError(null);
    try {
      await deletePostComment(postId, commentId);
      if (replyTo?.parentId === commentId) setReplyTo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el comentario');
    }
  }

  const overlay = variant === 'overlay';
  const preview = threads.slice(-2);
  const visibleThreads = expanded ? threads : preview;
  const listClass =
    scrollable && overlay
      ? 'min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch]'
      : `space-y-2 overflow-y-auto overflow-x-hidden ${overlay ? 'max-h-[36dvh]' : 'max-h-64'}`;
  const mute = overlay ? 'text-white/40 hover:text-rose-300' : 'text-zinc-600 hover:text-rose-400';
  const nameClass = overlay ? 'text-cyan-300' : 'text-cyan-400';
  const bodyClass = overlay ? 'text-white/90' : 'text-zinc-200';
  const cardClass = overlay ? 'rounded-xl bg-white/10 px-2.5 py-2' : 'rounded-xl bg-zinc-900/80 px-2.5 py-2';

  function renderComment(comment: PostComment, rootId: string, isReply: boolean) {
    const canRemove =
      Boolean(profile) &&
      (profile!.firebaseUid === comment.authorUid ||
        (authorUid && profile!.firebaseUid === authorUid));
    return (
      <div className={`min-w-0 max-w-full ${cardClass} ${isReply ? 'rounded-lg' : ''}`}>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <Link
            to={profileHref(comment.username, comment.authorUid)}
            className={`min-w-0 truncate text-[11px] font-semibold ${nameClass}`}
          >
            @{comment.username}
          </Link>
          {canRemove ? (
            <button
              type="button"
              onClick={() => void remove(comment.id)}
              className={`shrink-0 text-[10px] ${mute}`}
            >
              Eliminar
            </button>
          ) : null}
        </div>
        {isReply && comment.replyToUsername ? (
          <p className={`mt-0.5 truncate text-[10px] ${overlay ? 'text-white/45' : 'text-zinc-500'}`}>
            Respondió a @{comment.replyToUsername}
          </p>
        ) : null}
        {commentPlainText(comment.text) ? (
          <p className={`mt-0.5 min-w-0 break-words text-xs ${bodyClass}`}>
            <EmojiText text={comment.text} size={COMMENT_EMOJI_SIZE} />
          </p>
        ) : null}
        {comment.mediaUrl && comment.mediaType ? (
          <div className="mt-1.5 min-w-0 max-w-full">
            <CommentMediaThumb
              url={comment.mediaUrl}
              previewUrl={comment.mediaType === 'gif' ? null : comment.mediaPreviewUrl}
              kind={comment.mediaType}
              size="thread"
              onOpen={() =>
                setMediaViewer({
                  url: comment.mediaUrl!,
                  kind: comment.mediaType!,
                  previewUrl: comment.mediaPreviewUrl,
                })
              }
            />
          </div>
        ) : null}
        <div className="mt-0.5 flex min-h-11 min-w-0 flex-wrap items-center gap-3">
          <CommentBoomReaction
            postId={postId}
            commentId={comment.id}
            currentUserId={profile?.firebaseUid}
          />
          <button
            type="button"
            onClick={() => startReply(rootId, comment)}
            className={`inline-flex min-h-11 items-center text-[11px] font-semibold ${
              overlay ? 'text-white/70 hover:text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Responder
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        overlay
          ? scrollable
            ? `flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden ${embedded ? 'px-3 pb-3' : 'px-3 py-2.5'}`
            : embedded
              ? 'min-w-0 overflow-x-hidden px-3 pb-3'
              : 'min-w-0 overflow-x-hidden px-3 py-2.5'
          : 'min-w-0 overflow-x-hidden border-t border-white/5 px-3 py-3'
      }
    >
      {!embedded ? (
      <div className="mb-2 flex w-full min-w-0 items-center justify-between gap-2">
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
          {threads.length > 2 ? (
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

      {!embedded && !expanded && threads.length > 0 ? (
        <ul className={`min-w-0 space-y-1.5 ${threads.length > 2 ? 'opacity-70' : ''}`}>
          {preview.map(({ root }) => (
            <li
              key={root.id}
              className={overlay ? 'rounded-lg bg-white/10 px-2 py-1.5' : 'rounded-lg bg-zinc-900/60 px-2 py-1.5'}
            >
              <p className={`flex min-w-0 items-center gap-2 text-[11px] ${overlay ? 'text-white/90' : 'text-zinc-300'}`}>
                <span className={overlay ? 'font-semibold text-cyan-300' : 'font-semibold text-cyan-400'}>
                  @{root.username}
                </span>{' '}
                {commentPlainText(root.text) ? (
                  <EmojiText text={root.text} size={COMMENT_EMOJI_SIZE_COMPACT} className={overlay ? 'text-white/90' : 'text-zinc-300'} />
                ) : null}
                {root.mediaUrl && root.mediaType ? (
                  <CommentMediaThumb
                    url={root.mediaUrl}
                    previewUrl={root.mediaType === 'gif' ? null : root.mediaPreviewUrl}
                    kind={root.mediaType}
                    size="preview"
                    onOpen={() =>
                      setMediaViewer({
                        url: root.mediaUrl!,
                        kind: root.mediaType!,
                        previewUrl: root.mediaPreviewUrl,
                      })
                    }
                  />
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {embedded || expanded ? (
        <div className={scrollable && overlay ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'min-w-0'}>
          <ul ref={listRef} className={listClass}>
            {comments.length === 0 ? (
              <li className={`text-[11px] ${overlay ? 'text-white/45' : 'text-zinc-600'}`}>
                Sé el primero en comentar.
              </li>
            ) : (
              visibleThreads.map(({ root, replies }) => (
                <li key={root.id} className="min-w-0 max-w-full">
                  {renderComment(root, root.id, false)}
                  {replies.length > 0 ? (
                    <ul className="mt-2 min-w-0 space-y-2 border-l border-white/10 pl-3 sm:pl-4">
                      {replies.map((reply) => (
                        <li key={reply.id} className="min-w-0 max-w-full">
                          {renderComment(reply, root.id, true)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))
            )}
          </ul>
          <div
            className={`mt-2 flex min-w-0 shrink-0 flex-col gap-1.5 ${scrollable && overlay ? 'pt-2' : ''}`}
          >
            {replyTo ? (
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`min-w-0 truncate rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    overlay ? 'bg-cyan-400/20 text-cyan-200' : 'bg-cyan-500/15 text-cyan-300'
                  }`}
                >
                  Respondiendo a @{replyTo.username}
                </span>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className={`shrink-0 text-[11px] font-semibold ${overlay ? 'text-white/55 hover:text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Cancelar
                </button>
              </div>
            ) : null}
            <CommentComposerBar
              ref={inputRef}
              value={text}
              onChange={setText}
              onPublish={submit}
              disabled={!profile}
              busy={busy}
              overlay={overlay}
              placeholder={
                !profile
                  ? 'Inicia sesión para comentar'
                  : replyTo
                    ? `Responde a @${replyTo.username}…`
                    : 'Escribe un comentario...'
              }
              avatarSrc={profile?.avatarUrl}
              avatarUid={profile?.firebaseUid}
              username={profile?.handle}
              displayName={profile?.displayName}
            />
          </div>
        </div>
      ) : null}
      {error ? (
        <p className={`mt-1.5 text-[11px] ${overlay ? 'text-rose-300' : 'text-fuchsia-400'}`}>{error}</p>
      ) : null}
      <CommentMediaViewer item={mediaViewer} onClose={closeMediaViewer} />
    </div>
  );
}
