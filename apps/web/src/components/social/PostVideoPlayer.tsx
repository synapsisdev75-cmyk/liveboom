import { useBackLayer } from '../../lib/backLayer';
import {
  Globe,
  Lock,
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
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
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
import {
  getExploreFeedMuted,
  playExploreVideo,
  playVideoWithSound,
  setExploreFeedMuted,
  subscribeExploreFeedMuted,
} from '../../lib/exploreFeedMute';
import { useVideoAspect } from '../../lib/videoAspect';
import { useIsDesktop } from '../../hooks/useBreakpoint';
import { GO_HOME_EVENT } from '../../lib/goHome';
import { subscribeFeedVideoWarm, wasFeedVideoWarmed } from '../../lib/feedVideoWarmup';
import { buildPostShareUrl } from '../../lib/shareContent';
import { captureHtmlVideoPoster, TRANSPARENT_VIDEO_POSTER } from '../../lib/videoPoster';
import {
  exploreNavBindPlayer,
  exploreNavCurrentGen,
  exploreNavIsCurrent,
  exploreNavSync,
  exploreNavUnbindPlayer,
} from '../../lib/exploreVideoPool';
import { uploadUserMedia } from '../../lib/storage';
import {
  textStyleProps,
  useTextStyleFonts,
  useTextStyleFontsIn,
  useTextStyleRangesDraft,
  type PostTextStyle,
  type TextStyleRange,
} from '../../lib/postTextStyle';
import { StyledText } from './StyledText';
import { type EmojiInputHandle } from './EmojiInput';
import { CommentComposerBar, type CommentDraftAttachment } from './CommentComposerBar';
import { CommentMediaThumb, commentPlainText } from './CommentMediaThumb';
import { CommentMediaViewer, type CommentMediaViewerItem } from './CommentMediaViewer';
import { CommentBoomReaction } from './CommentBoomButton';
import { PublicationCaption } from './PublicationCaption';
import { StorySegmentBar } from './StorySegmentBar';
import {
  HORIZONTAL_SEEK_THRESHOLD_PX,
  STORY_WHEEL_COOLDOWN_MS,
  STORY_WHEEL_MIN_DELTA,
} from '../../lib/storyAuthorNav';
import { COMMENT_EMOJI_SIZE, COMMENT_EMOJI_SIZE_COMPACT } from '../../lib/liveboomEmojis';
import { PostActionRail } from './PostActionRail';
import { ImmersiveMediaStage, type ImmersivePointerGesture } from './ImmersiveMediaStage';
import { PublicationMedia } from './PublicationMedia';
import { profileHref } from '../../lib/profileFirestore';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';
import { MediaOverlayLayer } from './MediaOverlayLayer';
import type { MediaOverlayItem } from '../../lib/mediaOverlays';

type Visibility = 'public' | 'friends' | 'private' | 'circle';

type Props = {
  src: string;
  postId: string;
  authorUid?: string;
  authorUsername?: string;
  caption?: string | null;
  /** Estilo "Aa" del caption (Boom Clip / Flash Boom). */
  captionTextStyle?: PostTextStyle | null;
  captionTextStyleRanges?: TextStyleRange[] | null;
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
  onRequestExpand?: (info: { time: number }) => void;
  /** Visor: segundo inicial (continuar donde iba la tarjeta). */
  startAtSec?: number;
  /** Visor de Publicaciones de Inicio: contain + blur (sin recortar) también con overlayOnly. */
  containFill?: boolean;
  reelFeed?: boolean;
  reelNavigation?: {
    onNext: () => void;
    onPrev: () => void;
    /** Deslizar encadenado (iOS): vista previa del anterior/siguiente que sigue al dedo. */
    chain?: { prev?: ReactNode | null; next?: ReactNode | null };
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
  /** Explorar: no crear un <video> extra solo para leer metadata. */
  skipRemoteAspectProbe?: boolean;
  /** Explorar: cancelar carga anterior al cambiar src (latest-wins). */
  fastNav?: boolean;
  fastNavPrevUrl?: string | null;
  fastNavNextUrl?: string | null;
  fastNavNext2Url?: string | null;
  onFirstFrame?: () => void;
  /** Acción extra del consumidor en la barra lateral (solo Explorar). */
  railExtra?: ReactNode;
  /** Sin etiqueta de contenido, @autor ni descripción sobre el video (visor de Boom Clip). */
  hideOverlayInfo?: boolean;
  /** Barra de avance del video. Explorar, Publicaciones y Boom Clip. Flash Boom no la usa. */
  durationBar?: boolean;
};

function formatMediaClock(sec: number) {
  const total = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function VideoDurationBar({
  progress,
  currentSec,
  durationSec,
  insetSafe,
  interactive,
  onSeek,
  previewSrc,
  previewRef,
}: {
  progress: number;
  currentSec: number;
  durationSec: number;
  insetSafe?: boolean;
  interactive?: boolean;
  onSeek?: (ratio: number) => void;
  previewSrc?: string | null;
  previewRef?: RefObject<HTMLVideoElement | null>;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);
  const ratio = Math.min(1, Math.max(0, progress));
  const pct = `${ratio * 100}%`;
  const known = durationSec > 0;

  const ratioFromX = (clientX: number) => {
    const node = trackRef.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const seekFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const ratio = ratioFromX(event.clientX);
    if (ratio != null) onSeek?.(ratio);
  };

  const bottomGap = insetSafe
    ? 'calc(var(--lb-safe-bottom, 0px) + clamp(0.9rem, 2.6dvh, 1.45rem))'
    : 'clamp(0.45rem, 1.5dvh, 0.8rem)';

  return (
    <div
      className={`lb-video-duration-bar absolute inset-x-0 z-30 ${interactive ? '' : 'pointer-events-none'}`}
      style={{
        bottom: bottomGap,
        paddingLeft: 'max(0.75rem, var(--lb-safe-left, 0px))',
        paddingRight: 'max(0.75rem, var(--lb-safe-right, 0px))',
      }}
    >
      <div className="relative w-full">
      {previewSrc ? (
        <div
          className="pointer-events-none absolute bottom-full z-[8] mb-1 aspect-[3/4] w-[clamp(3.25rem,14vw,4.75rem)] overflow-hidden rounded-md bg-black shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-1 ring-white/80"
          style={{ left: `clamp(0px, calc(${pct} - clamp(1.625rem, 7vw, 2.375rem)), calc(100% - clamp(3.25rem, 14vw, 4.75rem)))` }}
        >
          <video
            ref={previewRef}
            src={previewSrc}
            muted
            playsInline
            preload="auto"
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}
      {interactive && known ? (
        <p className="pointer-events-none text-[12px] font-semibold leading-none tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
          {formatMediaClock(currentSec)} / {formatMediaClock(durationSec)}
        </p>
      ) : null}
      <div
        ref={trackRef}
        role={interactive ? 'slider' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? 'Duración del video' : undefined}
        aria-valuemin={interactive ? 0 : undefined}
        aria-valuemax={interactive ? Math.max(0, Math.round(durationSec)) : undefined}
        aria-valuenow={interactive ? Math.max(0, Math.round(currentSec)) : undefined}
        aria-hidden={interactive ? undefined : true}
        className={`relative flex w-full items-center ${interactive ? 'mt-1 h-5 cursor-pointer touch-none' : 'h-1'}`}
        onPointerDown={
          interactive
            ? (event) => {
                event.stopPropagation();
                event.preventDefault();
                dragRef.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
                seekFromPointer(event);
              }
            : undefined
        }
        onPointerMove={
          interactive
            ? (event) => {
                if (!dragRef.current) return;
                event.stopPropagation();
                seekFromPointer(event);
              }
            : undefined
        }
        onPointerUp={
          interactive
            ? (event) => {
                dragRef.current = false;
                event.stopPropagation();
              }
            : undefined
        }
        onPointerCancel={interactive ? () => { dragRef.current = false; } : undefined}
        onKeyDown={
          interactive
            ? (event) => {
                const step = durationSec > 0 ? 10 / durationSec : 0.02;
                if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  event.stopPropagation();
                  onSeek?.(Math.min(1, progress + step));
                } else if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  event.stopPropagation();
                  onSeek?.(Math.max(0, progress - step));
                }
              }
            : undefined
        }
      >
        <div className="relative h-1 w-full rounded-full bg-white/35">
          <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: pct }} />
          {interactive ? (
            <div
              className="absolute top-1/2 h-3.5 w-3.5 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
              style={{ left: pct, transform: 'translate(-50%, -50%)' }}
            />
          ) : null}
        </div>
      </div>
      </div>
    </div>
  );
}

const SEEK_STEP_SEC = 10;
const CHAIN_COMMIT_MS = 300;
const CHAIN_SPRING_MS = 220;
const CHAIN_EASE = 'cubic-bezier(0.22, 0.8, 0.24, 1)';
/** Publicación expandida: el ícono sigue al <video> vía volumechange, sin mute compartido. */
const SOUND_FALLBACK_LOCAL = { onBlocked: () => undefined, onUnlocked: () => undefined };

function MediaMuteFab({
  muted,
  unmuteLabel,
  muteLabel,
  onToggle,
}: {
  muted: boolean;
  unmuteLabel: string;
  muteLabel: string;
  onToggle: (event: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      className="lb-media-mute-fab"
      aria-label={muted ? unmuteLabel : muteLabel}
    >
      {muted ? <VolumeX size={16} strokeWidth={2.25} /> : <Volume2 size={16} strokeWidth={2.25} />}
    </button>
  );
}

export function PostVideoPlayer({
  src,
  postId,
  authorUid,
  authorUsername,
  authorAvatarUrl,
  caption,
  captionTextStyle = null,
  captionTextStyleRanges = null,
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
  startAtSec,
  containFill = false,
  overlayOnly = false,
  reelFeed = false,
  reelNavigation,
  reelPosition,
  userNavigation,
  storyMode = false,
  itemSideNav = false,
  durationSec: durationSecProp = null,
  embedded = false,
  hideClose = false,
  contentBadge = null,
  actionRailLayout: _actionRailLayout = 'corner',
  immersiveLandscapeLayout = false,
  mediaWidth: mediaWidthProp,
  mediaHeight: mediaHeightProp,
  posterUrl: posterUrlProp = null,
  publicationCaption = false,
  repostByUsername = null,
  originalUsername = null,
  originalHref = null,
  overlays = [],
  skipRemoteAspectProbe = false,
  fastNav = false,
  fastNavPrevUrl = null,
  fastNavNextUrl = null,
  fastNavNext2Url = null,
  onFirstFrame,
  railExtra = null,
  hideOverlayInfo = false,
  durationBar = false,
}: Props) {
  const t = useT();
  const navigate = useNavigate();
  const profile = useAuthStore((state) => state.profile);
  const authReady = useAuthStore((state) => state.ready);
  const reactId = useId();
  const playerId = `post-video-${postId}-${reactId}`;
  const isDesktop = useIsDesktop();
  const [feedWarmed, setFeedWarmed] = useState(() => wasFeedVideoWarmed(src));
  useEffect(() => {
    if (wasFeedVideoWarmed(src)) {
      setFeedWarmed(true);
      return;
    }
    return subscribeFeedVideoWarm(() => {
      if (wasFeedVideoWarmed(src)) setFeedWarmed(true);
    });
  }, [src]);
  const [deviceLandscape, setDeviceLandscape] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clipPreviewRef = useRef<HTMLVideoElement>(null);
  const posterCapturedRef = useRef(false);
  const wheelLockRef = useRef(0);
  const gestureLockRef = useRef(false);
  const onFirstFrameRef = useRef(onFirstFrame);
  onFirstFrameRef.current = onFirstFrame;
  const firstFrameSrcRef = useRef('');
  const playbackSnapshotRef = useRef({
    time: startAtSec && startAtSec > 0 ? startAtSec : 0,
    playing: false,
    muted: true,
    volume: 1,
  });
  const [expanded, setExpanded] = useState(startExpanded || overlayOnly);
  const [runtimePoster, setRuntimePoster] = useState<string | null>(null);
  const expandedRef = useRef(false);
  // Explorar / visores overlay (Boom Clip, Flash Boom): un solo mute compartido para todo el feed.
  const shareExploreMute = Boolean(fastNav) || overlayOnly;
  const [muted, setMuted] = useState(() => (shareExploreMute ? getExploreFeedMuted() : true));
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const railSheetOpen = optionsOpen || shareOpen;
  const railSheetOpenRef = useRef(railSheetOpen);
  railSheetOpenRef.current = railSheetOpen;
  const resumeAfterSheetRef = useRef(false);
  /** src que el usuario pausó: ningún arranque automático lo reanuda hasta que él le dé play. */
  const heldPauseSrcRef = useRef<string | null>(null);

  const closeExpandRef = useRef<() => void>(() => undefined);
  useBackLayer(expanded && !overlayOnly, () => closeExpandRef.current());
  useEffect(() => {
    const onHome = () => closeExpandRef.current();
    window.addEventListener(GO_HOME_EVENT, onHome);
    return () => window.removeEventListener(GO_HOME_EVENT, onHome);
  }, []);
  const [commentCount, setCommentCount] = useState(0);
  const [storyProgress, setStoryProgress] = useState(0);
  const [knownDuration, setKnownDuration] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [seekHint, setSeekHint] = useState<string | null>(null);
  const [playbackFlash, setPlaybackFlash] = useState<'play' | 'pause' | null>(null);
  const playbackFlashTimerRef = useRef<number | null>(null);
  const [mediaSize, setMediaSize] = useState({ width: 0, height: 0 });
  const [frameReady, setFrameReady] = useState(false);
  const shareUrl =
    authorUsername && postId
      ? buildPostShareUrl(authorUsername, postId, authorUid)
      : null;
  const shareTitle = authorUsername ? `@${authorUsername} en LiveBoom` : 'LiveBoom';
  const shareText =
    caption?.trim() ||
    (authorUsername ? `Mira este video de @${authorUsername} en LiveBoom` : 'Mira este video en LiveBoom');
  const videoAspect = useVideoAspect(skipRemoteAspectProbe ? null : src);
  const storyHeld = commentsPanelOpen || giftsOpen || railSheetOpen;
  const captionStyled = textStyleProps(captionTextStyle, captionTextStyleRanges);
  useTextStyleFonts(captionTextStyle, captionTextStyleRanges);

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
    setFrameReady(false);
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

  /** Al rotar (sobre todo landscape), el WebView a veces deja el <video> en pausa/negro. */
  useEffect(() => {
    if (!expanded && !overlayOnly) return;
    const resume = () => {
      const video = videoRef.current;
      if (!video) return;
      window.setTimeout(() => {
        if (heldPauseSrcRef.current === src) return;
        void video.play().catch(() => undefined);
      }, 120);
    };
    window.addEventListener('orientationchange', resume);
    window.visualViewport?.addEventListener('resize', resume);
    return () => {
      window.removeEventListener('orientationchange', resume);
      window.visualViewport?.removeEventListener('resize', resume);
    };
  }, [expanded, overlayOnly, src]);

  useEffect(() => {
    if (!seekHint) return;
    const timer = window.setTimeout(() => setSeekHint(null), 700);
    return () => window.clearTimeout(timer);
  }, [seekHint]);

  useEffect(() => {
    setStoryProgress(0);
    setKnownDuration(0);
    setUserPaused(false);
    setCommentsPanelOpen(false);
    setGiftsOpen(false);
    setSeekHint(null);
  }, [postId, src]);

  useEffect(() => {
    if (!storyMode && !durationBar) return;
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
          setKnownDuration((prev) => (Math.abs(prev - dur) > 0.25 ? dur : prev));
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [storyMode, durationBar, src, postId, durationSecProp]);

  useEffect(() => {
    if (!storyMode) return;
    const video = videoRef.current;
    if (!video) return;
    if (storyHeld) {
      video.pause();
      return;
    }
    if (heldPauseSrcRef.current === src) return;
    void video.play().catch(() => undefined);
  }, [storyHeld, storyMode, src, postId]);

  // Compartir / Más en Boom Clip y Publicaciones: pausa mientras la hoja está abierta (Flash usa storyHeld).
  useEffect(() => {
    if (storyMode || fastNav) return;
    const video = videoRef.current;
    if (!video) return;
    if (railSheetOpen) {
      resumeAfterSheetRef.current = !video.paused;
      video.pause();
      return;
    }
    if (!resumeAfterSheetRef.current) return;
    resumeAfterSheetRef.current = false;
    void video.play().catch(() => undefined);
  }, [railSheetOpen, storyMode, fastNav]);

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
        /* Explorar comparte mute: claimUnmuted no debe silenciar a los demás. */
        if (shareExploreMute) return;
        setMuted(true);
        if (videoRef.current) videoRef.current.muted = true;
      },
    });
  }, [playerId, shareExploreMute]);

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
          // Al pasar de largo en el feed se apaga el sonido; al volver sigue en silencio.
          if (!video.muted) {
            video.muted = true;
            setMuted(true);
          }
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

  useLayoutEffect(() => {
    if (!fastNav || !overlayOnly) return;
    const video = videoRef.current;
    if (!video) return;
    const gen = exploreNavSync({
      currentUrl: src,
      prevUrl: fastNavPrevUrl,
      nextUrl: fastNavNextUrl,
      next2Url: fastNavNext2Url,
    });
    exploreNavBindPlayer(video, src, gen);
    return () => {
      exploreNavUnbindPlayer(video);
    };
  }, [fastNav, overlayOnly, src, fastNavPrevUrl, fastNavNextUrl, fastNavNext2Url]);

  useEffect(() => {
    if (!overlayOnly) return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    const bindGen = exploreNavCurrentGen();
    const kick = () => {
      if (cancelled) return;
      if (heldPauseSrcRef.current === src) return;
      if (fastNav && !exploreNavIsCurrent(bindGen)) return;
      if (railSheetOpenRef.current && !fastNav) return;
      // canplay/canplaythrough vuelven a llegar tras rebuffer: respetar el sonido elegido.
      const preferMuted = shareExploreMute ? getExploreFeedMuted() : mutedRef.current;
      video.muted = preferMuted;
      video.defaultMuted = preferMuted;
      if (preferMuted) video.setAttribute('muted', '');
      else video.removeAttribute('muted');
      if (shareExploreMute) void playExploreVideo(video);
      else void video.play().catch(() => undefined);
    };
    // Varios eventos: en WebView Android loadeddata a veces llega tarde o no basta.
    if (video.readyState >= 2) kick();
    video.addEventListener('loadeddata', kick);
    video.addEventListener('canplay', kick);
    video.addEventListener('canplaythrough', kick);
    const retry = window.setTimeout(kick, 120);
    const retry2 = window.setTimeout(kick, 400);
    return () => {
      cancelled = true;
      video.removeEventListener('loadeddata', kick);
      video.removeEventListener('canplay', kick);
      video.removeEventListener('canplaythrough', kick);
      window.clearTimeout(retry);
      window.clearTimeout(retry2);
      // No pausar en fastNav: el pause deja el overlay play nativo gris del WebView Android.
    };
  }, [overlayOnly, src, postId, fastNav, shareExploreMute]);

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
        heldPauseSrcRef.current = null;
        delete el.dataset.lbHoldPause;
        void el.play().catch(() => undefined);
        flashPlayback('play');
      } else {
        heldPauseSrcRef.current = src;
        el.dataset.lbHoldPause = src;
        el.pause();
        flashPlayback('pause');
      }
    },
    [flashPlayback, src],
  );

  const seekExpanded = useCallback((deltaSec: number, keepPause = false) => {
    const video = videoRef.current;
    if (!video) return;
    const duration =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Number.POSITIVE_INFINITY;
    const next = Math.max(0, Math.min(duration, video.currentTime + deltaSec));
    if (!Number.isFinite(next)) return;
    video.currentTime = next;
    if (Number.isFinite(duration) && duration > 0) {
      setStoryProgress(Math.min(1, next / duration));
      setKnownDuration(duration);
    }
    setSeekHint(deltaSec < 0 ? `-${SEEK_STEP_SEC}s` : `+${SEEK_STEP_SEC}s`);
    if (!keepPause && video.paused) void video.play().catch(() => undefined);
  }, []);

  const seekToRatio = useCallback((ratio: number) => {
    const video = videoRef.current;
    if (!video) return;
    const reported = video.duration;
    const dur =
      Number.isFinite(reported) && reported > 0
        ? reported
        : Number(durationSecProp) > 0
          ? Number(durationSecProp)
          : 0;
    if (!(dur > 0)) return;
    const next = Math.max(0, Math.min(dur, ratio * dur));
    video.currentTime = next;
    setStoryProgress(Math.min(1, next / dur));
    setKnownDuration(dur);
  }, [durationSecProp]);

  useEffect(() => {
    if (!durationBar || !userPaused) return;
    const main = videoRef.current;
    const preview = clipPreviewRef.current;
    if (!main || !preview) return;
    const sync = () => {
      const time = main.currentTime;
      if (!Number.isFinite(time)) return;
      if (Math.abs((preview.currentTime || 0) - time) > 0.04) {
        try {
          preview.currentTime = time;
        } catch {
          /* el corto aún no tiene metadata */
        }
      }
    };
    sync();
    main.addEventListener('seeked', sync);
    preview.addEventListener('loadedmetadata', sync);
    return () => {
      main.removeEventListener('seeked', sync);
      preview.removeEventListener('loadedmetadata', sync);
    };
  }, [durationBar, userPaused, storyProgress, src]);

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
      // Visores con sonido compartido siguen la preferencia común, no el snapshot inicial (mudo).
      const nextMuted = shareExploreMute ? getExploreFeedMuted() : snap.muted;
      video.muted = nextMuted;
      video.volume = snap.volume;
      setMuted(nextMuted);
      if (!shareExploreMute) {
        if (!nextMuted) claimUnmuted(playerId);
        else releaseUnmuted(playerId);
      }
      if (snap.playing) {
        if (nextMuted) void video.play().catch(() => undefined);
        else void playVideoWithSound(video, SOUND_FALLBACK_LOCAL);
      }
    };

    if (video.readyState >= 2) apply();
    else video.addEventListener('loadeddata', apply, { once: true });
  }, [playerId, shareExploreMute]);

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
    if (!shareExploreMute) return;
    return subscribeExploreFeedMuted(setMuted);
  }, [shareExploreMute]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
    el.defaultMuted = muted;
    if (muted) el.setAttribute('muted', '');
    else el.removeAttribute('muted');
    if (shareExploreMute) return;
    if (!muted) claimUnmuted(playerId);
    else releaseUnmuted(playerId);
  }, [muted, playerId, shareExploreMute]);

  // El ícono sigue al <video> real: pool, fallback de autoplay o restore pueden cambiar `muted` por fuera.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const sync = () => {
      setMuted(el.muted);
      if (shareExploreMute) setExploreFeedMuted(el.muted);
    };
    el.addEventListener('volumechange', sync);
    return () => el.removeEventListener('volumechange', sync);
  }, [src, expanded, overlayOnly, shareExploreMute]);

  function toggleMute(event: MouseEvent) {
    event.stopPropagation();
    setMuted((value) => {
      const next = !value;
      if (shareExploreMute) {
        setExploreFeedMuted(next);
        return next;
      }
      if (!next) claimUnmuted(playerId);
      else releaseUnmuted(playerId);
      return next;
    });
  }

  function openExpand(event?: MouseEvent) {
    event?.stopPropagation();
    event?.preventDefault();
    if (onRequestExpand) {
      onRequestExpand({ time: videoRef.current?.currentTime ?? 0 });
      return;
    }
    capturePlaybackSnapshot();
    // Al abrir el video a pantalla completa arranca con sonido.
    playbackSnapshotRef.current.muted = false;
    playbackSnapshotRef.current.playing = true;
    expandedRef.current = true;
    setExpanded(true);
  }

  function closeExpand() {
    if (overlayOnly) {
      onCloseExpand?.();
      return;
    }
    setCommentsPanelOpen(false);
    setGiftsOpen(false);
    if (!expandedRef.current) return;
    capturePlaybackSnapshot();
    expandedRef.current = false;
    setExpanded(false);
    onCloseExpand?.();
  }
  closeExpandRef.current = closeExpand;

  const lockGestureClicks = useCallback(() => {
    gestureLockRef.current = true;
    window.setTimeout(() => {
      gestureLockRef.current = false;
    }, 80);
  }, []);

  const chain = !embedded && reelNavigation?.chain ? reelNavigation.chain : null;
  const chainShellRef = useRef<HTMLDivElement | null>(null);
  const chainPrevRef = useRef<HTMLDivElement | null>(null);
  const chainNextRef = useRef<HTMLDivElement | null>(null);
  const chainBusyRef = useRef(false);
  const chainFrameRef = useRef(0);
  const chainTimerRef = useRef(0);
  const chainDragRef = useRef<Array<{ y: number; t: number }> | null>(null);

  useEffect(
    () => () => {
      cancelAnimationFrame(chainFrameRef.current);
      window.clearTimeout(chainTimerRef.current);
    },
    [],
  );

  /** offset: desplazamiento vertical del video actual (px o %); los vecinos lo siguen pegados. */
  const applyChain = useCallback((offset: string, ms = 0) => {
    const transition = ms > 0 ? `transform ${ms}ms ${CHAIN_EASE}` : 'none';
    const resting = offset === '0px';
    const shell = chainShellRef.current;
    if (shell) {
      shell.style.transition = transition;
      // Sin transform en reposo: un transform permanente cambia el contenedor de los `fixed` internos.
      shell.style.transform = resting ? '' : `translate3d(0, ${offset}, 0)`;
    }
    const prev = chainPrevRef.current;
    if (prev) {
      prev.style.transition = transition;
      prev.style.transform = `translate3d(0, calc(-100% + ${offset}), 0)`;
    }
    const next = chainNextRef.current;
    if (next) {
      next.style.transition = transition;
      next.style.transform = `translate3d(0, calc(100% + ${offset}), 0)`;
    }
  }, []);

  const resetChainDrag = useCallback(() => {
    cancelAnimationFrame(chainFrameRef.current);
    if (!chainDragRef.current) return;
    chainDragRef.current = null;
    applyChain('0px', CHAIN_SPRING_MS);
  }, [applyChain]);

  const handlePointerDrag = useCallback(
    (info: { dx: number; dy: number; axis: 'horizontal' | 'vertical' }) => {
      if (!chain || storyHeld || chainBusyRef.current || info.axis !== 'vertical') return;
      const hasTarget = info.dy < 0 ? Boolean(chain.next) : Boolean(chain.prev);
      const offset = hasTarget ? info.dy : info.dy * 0.28;
      const samples = chainDragRef.current ?? [];
      samples.push({ y: info.dy, t: performance.now() });
      if (samples.length > 6) samples.shift();
      chainDragRef.current = samples;
      cancelAnimationFrame(chainFrameRef.current);
      chainFrameRef.current = requestAnimationFrame(() => applyChain(`${offset}px`));
    },
    [chain, storyHeld, applyChain],
  );

  const chainNavigate = useCallback(
    (dir: 'next' | 'prev') => {
      if (!reelNavigation) return;
      const go = dir === 'next' ? reelNavigation.onNext : reelNavigation.onPrev;
      const target = chain ? (dir === 'next' ? chain.next : chain.prev) : null;
      if (!target) {
        resetChainDrag();
        go();
        return;
      }
      if (chainBusyRef.current) return;
      chainBusyRef.current = true;
      cancelAnimationFrame(chainFrameRef.current);
      chainDragRef.current = null;
      applyChain(dir === 'next' ? '-100%' : '100%', CHAIN_COMMIT_MS);
      window.clearTimeout(chainTimerRef.current);
      chainTimerRef.current = window.setTimeout(() => {
        chainBusyRef.current = false;
        go();
        // Si el visor no se remonta (misma key), vuelve a reposo tras el render.
        chainFrameRef.current = requestAnimationFrame(() => applyChain('0px'));
      }, CHAIN_COMMIT_MS);
    },
    [reelNavigation, chain, applyChain, resetChainDrag],
  );

  const handlePointerGesture = useCallback(
    (info: ImmersivePointerGesture) => {
      if (storyHeld || info.startedOnControl) {
        resetChainDrag();
        return;
      }
      if (info.isTap) {
        resetChainDrag();
        if (itemSideNav && !durationBar) return;
        toggleExpandedPlayback();
        return;
      }
      const absX = Math.abs(info.dx);
      const absY = Math.abs(info.dy);
      if (info.axis === 'horizontal' && absX >= HORIZONTAL_SEEK_THRESHOLD_PX && absX > absY) {
        resetChainDrag();
        lockGestureClicks();
        if (userNavigation) {
          if (info.dx < 0) userNavigation.onNextUser();
          else userNavigation.onPrevUser();
          return;
        }
        seekExpanded(info.dx < 0 ? -SEEK_STEP_SEC : SEEK_STEP_SEC);
        return;
      }
      if (chain && reelNavigation && info.axis === 'vertical') {
        const samples = chainDragRef.current ?? [];
        const last = samples[samples.length - 1];
        const first = samples.find((s) => last && last.t - s.t <= 100) ?? last;
        const velocity =
          first && last && last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
        const flick =
          absY >= 48 && Math.abs(velocity) > 0.35 && Math.sign(velocity) === Math.sign(info.dy);
        if (absY > absX && (absY >= window.innerHeight * 0.2 || flick)) {
          lockGestureClicks();
          chainNavigate(info.dy < 0 ? 'next' : 'prev');
        } else {
          resetChainDrag();
        }
        return;
      }
      if (info.axis === 'vertical' && reelNavigation && absY >= 48 && absY > absX) {
        lockGestureClicks();
        if (info.dy < 0) reelNavigation.onNext();
        else reelNavigation.onPrev();
      }
    },
    [
      storyHeld,
      itemSideNav,
      durationBar,
      userNavigation,
      reelNavigation,
      chain,
      chainNavigate,
      resetChainDrag,
      toggleExpandedPlayback,
      seekExpanded,
      lockGestureClicks,
    ],
  );

  const handleWheelNavigate = useCallback((deltaY: number) => {
    if (!reelNavigation || storyHeld || Math.abs(deltaY) < STORY_WHEEL_MIN_DELTA) return;
    if (storyMode || chain) {
      const now = Date.now();
      if (now - wheelLockRef.current < STORY_WHEEL_COOLDOWN_MS) return;
      wheelLockRef.current = now;
    }
    if (chain) {
      chainNavigate(deltaY > 0 ? 'next' : 'prev');
      return;
    }
    if (deltaY > 0) reelNavigation.onNext();
    else reelNavigation.onPrev();
  }, [reelNavigation, storyHeld, storyMode, chain, chainNavigate]);

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
        if (chain) chainNavigate(storyMode ? 'prev' : 'next');
        else if (storyMode) reelNavigation.onPrev();
        else reelNavigation.onNext();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (chain) chainNavigate(storyMode ? 'next' : 'prev');
        else if (storyMode) reelNavigation.onNext();
        else reelNavigation.onPrev();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, reelNavigation, storyMode, hideClose, chain, chainNavigate]);

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
    <div className="relative h-full w-full bg-zinc-900">
      {resolvedPoster && !frameReady ? (
        <img
          src={resolvedPoster}
          alt=""
          className="lb-post-media__poster pointer-events-none absolute inset-0 z-[1] h-full w-full object-contain"
          draggable={false}
        />
      ) : null}
      {!resolvedPoster && !frameReady ? (
        <div className="pointer-events-none absolute inset-0 z-[1] bg-zinc-900" />
      ) : null}
      {!frameReady ? (
        <div
          className="pointer-events-none absolute inset-0 z-[2] grid place-items-center"
          aria-hidden
        >
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-cyan-300" />
        </div>
      ) : null}
      <video
        ref={videoRef}
        src={src}
        /*
         * APK/AAB (Android WebView): sin atributo poster, el WebView pinta su
         * "default video poster" (play negro gigante) mientras no hay frame.
         * En viewers con autoplay (Explorar / Boom Clip / Flash Boom / expandido)
         * usamos un poster transparente de respaldo; el poster desaparece al
         * iniciar la reproducción. Tarjetas colapsadas del feed quedan igual.
         */
        poster={resolvedPoster || (expanded || overlayOnly ? TRANSPARENT_VIDEO_POSTER : undefined)}
        className={`lb-post-media__video h-full w-full object-contain transition-opacity duration-150 ${
          frameReady ? 'opacity-100' : 'opacity-0'
        }`}
        muted={muted}
        loop={!storyMode}
        playsInline
        preload={expanded || overlayOnly || fastNav || feedWarmed ? 'auto' : 'metadata'}
        autoPlay={overlayOnly || expanded}
        onClick={
          !expanded && !overlayOnly
            ? openExpand
            : undefined
        }
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            setMediaSize({ width: video.videoWidth, height: video.videoHeight });
          }
          if (Number.isFinite(video.duration) && video.duration > 0) setKnownDuration(video.duration);
        }}
        onLoadedData={() => {
          tryCapturePoster();
          if (firstFrameSrcRef.current !== src) {
            firstFrameSrcRef.current = src;
            onFirstFrameRef.current?.();
          }
        }}
        onPlaying={() => {
          setUserPaused(false);
          setFrameReady(true);
          if (firstFrameSrcRef.current !== src) {
            firstFrameSrcRef.current = src;
            onFirstFrameRef.current?.();
          }
        }}
        onPause={() => {
          const video = videoRef.current;
          if (!video || video.ended || !frameReady) return;
          const reported = video.duration;
          const dur =
            Number.isFinite(reported) && reported > 0
              ? reported
              : Number(durationSecProp) > 0
                ? Number(durationSecProp)
                : 0;
          if (dur > 0) {
            setStoryProgress(Math.min(1, video.currentTime / dur));
            setKnownDuration(dur);
          }
          setUserPaused(true);
        }}
        onPlay={(event) => {
          setUserPaused(false);
          heldPauseSrcRef.current = null;
          delete event.currentTarget.dataset.lbHoldPause;
        }}
        onTimeUpdate={(event) => {
          if (!frameReady && event.currentTarget.currentTime > 0.01) {
            setFrameReady(true);
          }
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
          if (chain) chainNavigate('next');
          else reelNavigation.onNext();
        }}
      />
      {durationBar && userPaused && frameReady && !expanded && !overlayOnly ? (
        <VideoDurationBar
          progress={storyProgress}
          currentSec={knownDuration > 0 ? storyProgress * knownDuration : 0}
          durationSec={knownDuration}
          interactive
          onSeek={seekToRatio}
        />
      ) : null}
    </div>
  );

  const immersiveW = pubW || videoAspect.width || 9;
  const immersiveH = pubH || videoAspect.height || 16;
  // PC: rail al lado solo en Publicaciones; Explorar/Clip/Flash van anclados al video
  // para que no se desplacen al abrir/cerrar el menú lateral.
  const useLandscapeAside = isDesktop && !overlayOnly && !reelFeed && !storyMode;
  const parkRailAtDeviceEdge = deviceLandscape;
  const expandedRailLayout = useLandscapeAside ? 'aside' : 'corner';
  /** Publicaciones (feed): contain en fullscreen; Explorar/clips mantienen auto. */
  const publicationFillMode =
    containFill || (!overlayOnly && !immersiveLandscapeLayout) ? 'contain' : 'auto';

  const expandedChrome =
    expanded && (embedded || typeof document !== 'undefined') ? (
      <div
        ref={chainShellRef}
        className={`${
          embedded ? 'absolute inset-0 z-10' : 'fixed inset-0 z-[100] h-[100dvh] max-h-[100dvh]'
        } overflow-hidden overscroll-none bg-black`}
      >
        <ImmersiveMediaStage
          mediaWidth={immersiveW}
          mediaHeight={immersiveH}
          mediaUrl={src}
          mediaKind="video"
          posterUrl={resolvedPoster}
          embedded={embedded}
          landscapeRailAside={useLandscapeAside}
          fillMode={publicationFillMode}
          insets={{
            top: storyMode ? 36 : overlayOnly || reelFeed ? 0 : 40,
            bottom: embedded ? 88 : 112,
            left: 4,
            right: 4,
            actionRail: 56,
          }}
          onPointerGesture={handlePointerGesture}
          onPointerDrag={chain ? handlePointerDrag : undefined}
          onWheel={reelNavigation ? handleWheelNavigate : undefined}
          mediaOverlay={
            <>
              <MediaOverlayLayer overlays={overlays} />
              <MediaMuteFab
                muted={muted}
                unmuteLabel={t('actions.unmute')}
                muteLabel={t('actions.mute')}
                onToggle={toggleMute}
              />
              {seekHint ? (
                <div
                  className={`pointer-events-none absolute inset-y-0 z-[6] flex w-[42%] items-center justify-center ${
                    seekHint.startsWith('-') ? 'left-0' : 'right-0'
                  }`}
                >
                  <span className="rounded-full bg-black/55 px-3 py-1.5 text-sm font-bold tabular-nums text-white/90 backdrop-blur-sm">
                    {seekHint.startsWith('-') ? '← 10 s' : '10 s →'}
                  </span>
                </div>
              ) : null}
              {itemSideNav && reelNavigation && !storyHeld ? (
              <>
                <button
                  type="button"
                  data-lb-gesture-pass=""
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
                  data-lb-gesture-pass=""
                  className="absolute inset-y-0 right-0 z-[4] w-[50%] bg-transparent"
                  aria-label="Siguiente"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (gestureLockRef.current) return;
                    reelNavigation.onNext();
                  }}
                />
                {playbackFlash && frameReady ? (
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
              </>
            ) : (
              <>
                {playbackFlash && frameReady ? (
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
              </>
            )}
            {durationBar && userPaused && !storyHeld && frameReady ? (
              <>
                <div className="pointer-events-none absolute inset-0 z-[9] grid place-items-center">
                  <div className="pointer-events-auto flex items-center gap-[clamp(0.85rem,5vw,1.6rem)]">
                    <button
                      type="button"
                      className="grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white"
                      aria-label="Atrasar 10 segundos"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        seekExpanded(-SEEK_STEP_SEC, true);
                      }}
                    >
                      <span className="relative grid place-items-center">
                        <RotateCcw size={26} strokeWidth={1.75} />
                        <span className="absolute text-[9px] font-bold leading-none">10</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="grid h-14 w-14 place-items-center rounded-full bg-white text-zinc-950 shadow-lg"
                      aria-label="Reproducir"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleExpandedPlayback();
                      }}
                    >
                      <Play size={28} fill="currentColor" className="ml-0.5" />
                    </button>
                    <button
                      type="button"
                      className="grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white"
                      aria-label="Adelantar 10 segundos"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        seekExpanded(SEEK_STEP_SEC, true);
                      }}
                    >
                      <span className="relative grid place-items-center">
                        <RotateCw size={26} strokeWidth={1.75} />
                        <span className="absolute text-[9px] font-bold leading-none">10</span>
                      </span>
                    </button>
                  </div>
                </div>
              </>
            ) : null}
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
              onToggleComments={() => {
                if (!authReady) return;
                if (!profile) {
                  navigate('/login');
                  return;
                }
                setCommentsPanelOpen((value) => !value);
              }}
              shareUrl={shareUrl}
              shareTitle={shareTitle}
              shareText={shareText}
              mediaUrl={src}
              mediaType="video"
              commentsPanelOpen={commentsPanelOpen}
              onGiftsOpenChange={setGiftsOpen}
              onOptionsOpenChange={setOptionsOpen}
              onShareOpenChange={setShareOpen}
              anchor="media"
              layout={expandedRailLayout}
              giftLayoutContext={storyMode ? 'flash_boom' : reelFeed ? 'boom_clip' : 'publicaciones'}
              extraAction={railExtra}
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
            className={`pointer-events-none flex shrink-0 items-start justify-between gap-3 p-3 ${
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
              <span className="inline-flex h-11 w-11 shrink-0" aria-hidden />
            ) : (
              <button
                type="button"
                onClick={closeExpand}
                className="lb-explore-exit pointer-events-auto inline-grid h-10 w-10 rounded-full bg-black/50 text-white backdrop-blur-sm"
                aria-label="Cerrar"
              >
                <X size={17} strokeWidth={2.4} aria-hidden />
              </button>
            )}
            <div className="pointer-events-none flex items-center gap-2">
              {/* Contador numérico solo fuera de Flash Boom / Boom Clip (storyMode / reelFeed). */}
              {reelPosition && !embedded && !storyMode && !reelFeed ? (
                <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white/80 backdrop-blur-sm">
                  {reelPosition.current}/{reelPosition.total}
                </span>
              ) : null}
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
                <p className="text-sm font-semibold text-white">{t('comments.title')}</p>
                <button
                  type="button"
                  onClick={() => setCommentsPanelOpen(false)}
                  className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white"
                  aria-label={t('comments.close')}
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
            className={`pointer-events-none relative z-20 mt-auto min-w-0 max-w-full shrink-0 space-y-2 px-3 ${
              embedded || overlayOnly
                ? 'pb-[max(0.75rem,var(--lb-safe-bottom))] pl-[4.25rem] sm:pl-[4.75rem] lg:pl-3'
                : 'pb-[max(0.75rem,var(--lb-safe-bottom))] pl-[3.5rem]'
            }`}
            style={{
              paddingRight: 'max(0.75rem, var(--lb-safe-right, 0px))',
              ...(durationBar && userPaused && frameReady && !storyHeld
                ? { paddingBottom: 'calc(var(--lb-safe-bottom, 0px) + clamp(3.2rem, 8dvh, 4.25rem))' }
                : null),
            }}
          >
            <div className="pointer-events-auto space-y-2">
            {hideOverlayInfo ? null : (
            <>
            {contentBadge ? (
              <span className="lb-post-overlay__badge inline-flex rounded-md bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-200 ring-1 ring-white/15">
                {contentBadge}
              </span>
            ) : null}
            {repostByUsername ? (
              <p className="text-[11px] font-semibold text-fuchsia-200 drop-shadow">
                @{repostByUsername} reposteó
              </p>
            ) : null}
            {!overlayOnly ? null : originalUsername ? (
              <Link
                to={originalHref || profileHref(originalUsername)}
                className="lb-post-overlay__author inline-block text-sm font-bold text-white drop-shadow hover:text-cyan-300"
              >
                @{originalUsername}
              </Link>
            ) : authorUsername ? (
              <Link
                to={profileHref(authorUsername, authorUid)}
                className="lb-post-overlay__author inline-block text-sm font-bold text-white drop-shadow hover:text-cyan-300"
              >
                @{authorUsername}
              </Link>
            ) : null}
            {caption ? (
              publicationCaption ? (
                <PublicationCaption
                  caption={caption}
                  variant="overlay"
                  textStyle={captionTextStyle}
                  textStyleRanges={captionTextStyleRanges}
                />
              ) : (
                <p
                  className={`line-clamp-3 text-sm font-medium text-white/90 drop-shadow ${captionStyled.className}`}
                  style={captionStyled.style}
                >
                  <StyledText
                    text={caption}
                    textStyle={captionTextStyle}
                    textStyleRanges={captionTextStyleRanges}
                    size={COMMENT_EMOJI_SIZE}
                  />
                </p>
              )
            ) : null}
            </>
            )}

            {canChangeVisibility ? (
              <div className="flex flex-wrap items-center gap-1.5">
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
                    className={
                      publicationCaption
                        ? `lb-tab-chip${visibility === value ? ' is-on' : ''}`
                        : `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold backdrop-blur-sm ${
                            visibility === value
                              ? 'bg-emerald-400 text-zinc-950'
                              : 'bg-white/15 text-white'
                          }`
                    }
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
                    className={
                      publicationCaption
                        ? 'lb-action-pill lb-action-pill--edit'
                        : 'rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-cyan-100 backdrop-blur-sm'
                    }
                  >
                    Editar
                  </button>
                ) : null}
                {canDelete ? (
                  <button
                    type="button"
                    onClick={onDelete}
                    className={
                      publicationCaption
                        ? 'lb-action-pill lb-action-pill--delete'
                        : 'rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-rose-200 backdrop-blur-sm'
                    }
                  >
                    Eliminar
                  </button>
                ) : null}
              </div>
            ) : null}
            </div>
          </div>
          ) : null}
        </div>
        {durationBar && userPaused && frameReady && !storyHeld ? (
          <VideoDurationBar
            progress={storyProgress}
            currentSec={knownDuration > 0 ? storyProgress * knownDuration : 0}
            durationSec={knownDuration}
            insetSafe
            interactive
            onSeek={seekToRatio}
            previewSrc={src}
            previewRef={clipPreviewRef}
          />
        ) : null}
      </div>
    ) : null;

  const chainPeekClass =
    'pointer-events-none fixed inset-0 z-[100] h-[100dvh] max-h-[100dvh] overflow-hidden bg-black';
  const chainedChrome =
    expandedChrome && chain && !embedded ? (
      <>
        {chain.prev ? (
          <div
            ref={chainPrevRef}
            aria-hidden
            className={chainPeekClass}
            style={{ transform: 'translate3d(0, -100%, 0)' }}
          >
            {chain.prev}
          </div>
        ) : null}
        {expandedChrome}
        {chain.next ? (
          <div
            ref={chainNextRef}
            aria-hidden
            className={chainPeekClass}
            style={{ transform: 'translate3d(0, 100%, 0)' }}
          >
            {chain.next}
          </div>
        ) : null}
      </>
    ) : (
      expandedChrome
    );

  return (
    <>
      {overlayOnly ? (
        embedded ? (
          <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-black">
            {expandedChrome}
          </div>
        ) : (
          chainedChrome
        )
      ) : (
        <>
          {expanded ? (
            <div className="relative w-full min-w-0 lb-feed-media-frame" style={{ aspectRatio: pubW && pubH ? `${pubW} / ${pubH}` : '4 / 5', maxHeight: 'min(720px, 72dvh)' }} aria-hidden />
          ) : null}
          <div ref={wrapRef} className="relative w-full min-w-0 cursor-pointer" onClick={openExpand}>
            {!expanded ? (
              <PublicationMedia
                src={src}
                mediaKind="video"
                width={pubW}
                height={pubH}
                posterUrl={resolvedPoster}
                overlay={
                  <MediaMuteFab
                    muted={muted}
                    unmuteLabel={t('actions.unmute')}
                    muteLabel={t('actions.mute')}
                    onToggle={toggleMute}
                  />
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
            ? createPortal(chainedChrome, document.body)
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
  const t = useT();
  const profile = useAuthStore((state) => state.profile);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [text, setText] = useState('');
  const [textStyle, setTextStyle] = useState<PostTextStyle | null>(null);
  const [textStyleRanges, setTextStyleRanges] = useTextStyleRangesDraft(text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(defaultOpen);
  const [replyTo, setReplyTo] = useState<CommentReplyTarget | null>(null);
  const [mediaViewer, setMediaViewer] = useState<CommentMediaViewerItem | null>(null);
  const closeMediaViewer = useCallback(() => setMediaViewer(null), []);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<EmojiInputHandle>(null);

  const threads = useMemo(() => buildCommentThreads(comments), [comments]);
  useTextStyleFontsIn(comments);

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
      setError(t('comments.loginToComment'));
      throw new Error(t('comments.loginToComment'));
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
      } else if (attachment?.kind === 'sticker' && attachment.stickerUrl) {
        media = { mediaUrl: attachment.stickerUrl, mediaType: 'sticker' };
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
        text,
        replyTo
          ? {
              parentId: replyTo.parentId,
              replyToUid: replyTo.uid,
              replyToUsername: replyTo.username,
            }
          : null,
        media,
        textStyle,
        textStyleRanges,
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
  const cardClass = overlay ? 'rounded-xl bg-white/10 px-2.5 py-2' : 'rounded-xl px-2.5 py-2';

  function renderComment(comment: PostComment, rootId: string, isReply: boolean) {
    const canRemove =
      Boolean(profile) &&
      (profile!.firebaseUid === comment.authorUid ||
        (authorUid && profile!.firebaseUid === authorUid));
    const styled = textStyleProps(comment.textStyle, comment.textStyleRanges);
    return (
      <div className={`lb-comment-card min-w-0 max-w-full ${cardClass} ${isReply ? 'rounded-lg' : ''}`}>
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
          <p className={`mt-0.5 min-w-0 break-words text-xs ${bodyClass} ${styled.className}`} style={styled.style}>
            <StyledText
              text={comment.text}
              textStyle={comment.textStyle}
              textStyleRanges={comment.textStyleRanges}
              size={COMMENT_EMOJI_SIZE}
            />
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
            {t('actions.reply')}
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
            ? `lb-comments lb-comments--overlay flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden ${embedded ? 'px-3 pb-3' : 'px-3 py-2.5'}`
            : embedded
              ? 'lb-comments lb-comments--overlay min-w-0 overflow-x-hidden px-3 pb-3'
              : 'lb-comments lb-comments--overlay min-w-0 overflow-x-hidden px-3 py-2.5'
          : 'lb-comments lb-comments--feed min-w-0 overflow-x-hidden border-t border-white/5 px-3 py-3'
      }
      {...(overlay ? { 'data-lb-surface': 'dark' as const } : {})}
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
          <span className="truncate">{t('comments.title')}</span>
          {comments.length > 0 ? (
            <span className={overlay ? 'text-white/50' : 'text-zinc-400'}>{comments.length}</span>
          ) : null}
          {threads.length > 2 ? (
            <span className={`normal-case ${overlay ? 'text-cyan-300' : 'text-cyan-400'}`}>
              {expanded ? `· ${t('common.hide')}` : `· ${t('common.seeAll')}`}
            </span>
          ) : null}
        </button>
        {!expanded && profile ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={`shrink-0 text-[11px] font-semibold ${overlay ? 'text-cyan-300' : 'text-cyan-400'}`}
          >
            {t('actions.commentEllipsis')}
          </button>
        ) : null}
      </div>
      ) : null}

      {!embedded && !expanded && threads.length > 0 ? (
        <ul className={`min-w-0 space-y-1.5 ${threads.length > 2 ? 'opacity-70' : ''}`}>
          {preview.map(({ root }) => (
            <li
              key={root.id}
              className={
                overlay
                  ? 'lb-comment-card rounded-lg bg-white/10 px-2 py-1.5'
                  : 'lb-comment-card rounded-lg px-2 py-1.5'
              }
            >
              <p className={`flex min-w-0 items-center gap-2 text-[11px] ${overlay ? 'text-white/90' : 'text-zinc-300'}`}>
                <span className={overlay ? 'font-semibold text-cyan-300' : 'font-semibold text-cyan-400'}>
                  @{root.username}
                </span>{' '}
                {commentPlainText(root.text) ? (
                  <span
                    className={`contents ${textStyleProps(root.textStyle, root.textStyleRanges).className}`}
                    style={textStyleProps(root.textStyle, root.textStyleRanges).style}
                  >
                    <StyledText
                      text={root.text}
                      textStyle={root.textStyle}
                      textStyleRanges={root.textStyleRanges}
                      size={COMMENT_EMOJI_SIZE_COMPACT}
                      className={overlay ? 'text-white/90' : 'text-zinc-300'}
                    />
                  </span>
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
                {t('comments.first')}
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
                  {t('comments.replyingTo', { name: replyTo.username })}
                </span>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className={`shrink-0 text-[11px] font-semibold ${overlay ? 'text-white/55 hover:text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  {t('common.cancel')}
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
                  ? t('comments.loginToComment')
                  : replyTo
                    ? t('comments.replyTo', { name: replyTo.username })
                    : t('comments.write')
              }
              avatarSrc={profile?.avatarUrl}
              avatarUid={profile?.firebaseUid}
              username={profile?.handle}
              displayName={profile?.displayName}
              textStyle={textStyle}
              onTextStyleChange={setTextStyle}
              textStyleRanges={textStyleRanges}
              onTextStyleRangesChange={setTextStyleRanges}
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
