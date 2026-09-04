import { Maximize2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  listenPostComments,
  listenPostReactions,
  setPostReaction,
  type PostReactionUser,
} from '../../lib/socialFirestore';
import { profileHref } from '../../lib/profileFirestore';
import { buildPostShareUrl } from '../../lib/shareContent';
import { useIsDesktop } from '../../hooks/useBreakpoint';
import { useAuthStore } from '../../store/authStore';
import { PostActionRail } from './PostActionRail';
import { ImmersiveMediaStage } from './ImmersiveMediaStage';
import { PublicationMedia } from './PublicationMedia';
import { PostComments } from './PostVideoPlayer';
import { ShareContentButton } from './ShareContentButton';
import { PublicationCaptionOverlay } from './PublicationCaption';
import { StorySegmentBar } from './StorySegmentBar';
import { STORY_PHOTO_DURATION_SEC } from '../../lib/storyLifecycle';
import {
  classifyStoryGesture,
  STORY_WHEEL_COOLDOWN_MS,
  STORY_WHEEL_MIN_DELTA,
} from '../../lib/storyAuthorNav';

type Props = {
  src: string;
  caption?: string | null;
  /** Abrir expandido al montar. */
  startExpanded?: boolean;
  onCloseExpand?: () => void;
  onExpandChange?: (expanded: boolean) => void;
  /** Solo overlay (sin miniatura inline), p. ej. Explorar. */
  overlayOnly?: boolean;
  /** Fallback de aspect hasta cargar (perfil). Feed usa detección real. */
  aspect?: 'square' | 'video';
  postId?: string;
  authorUsername?: string;
  authorUid?: string;
  authorAvatarUrl?: string | null;
  mediaWidth?: number;
  mediaHeight?: number;
  /** Navegación opcional (p. ej. feed de reels/fotos). */
  navigation?: {
    onNext: () => void;
    onPrev: () => void;
  };
  /** Flash Boom / Boom Clip: swipe horizontal o flechas para cambiar de usuario. */
  userNavigation?: {
    onNextUser: () => void;
    onPrevUser: () => void;
  };
  position?: { current: number; total: number };
  /** Explorar / Flash Boom: layout horizontal con rail fijo al lado. */
  immersiveLandscapeLayout?: boolean;
  /** Publicación: descripción con Ver más / Ver menos. Default false (Boom Clip / Flash / Explorar). */
  publicationCaption?: boolean;
  /** Flash Boom / Boom Clip: barra de progreso + auto-avance (5 s en foto). */
  storyMode?: boolean;
  repostByUsername?: string | null;
  originalUsername?: string | null;
  originalHref?: string | null;
};

/**
 * Visor unificado de fotos — misma barra de acciones que video/reels.
 */
export function PostPhotoViewer({
  src,
  caption,
  startExpanded = false,
  onCloseExpand,
  onExpandChange,
  overlayOnly = false,
  aspect = 'square',
  postId,
  authorUsername,
  authorUid,
  authorAvatarUrl,
  mediaWidth: mediaWidthProp,
  mediaHeight: mediaHeightProp,
  navigation,
  userNavigation,
  position,
  immersiveLandscapeLayout = false,
  publicationCaption = false,
  storyMode = false,
  repostByUsername = null,
  originalUsername = null,
  originalHref = null,
}: Props) {
  const profile = useAuthStore((state) => state.profile);
  const isDesktop = useIsDesktop();
  const [expanded, setExpanded] = useState(startExpanded || overlayOnly);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [viewerReaction, setViewerReaction] = useState<'like' | 'dislike' | null>(null);
  const [likers, setLikers] = useState<PostReactionUser[]>([]);
  const [dislikers, setDislikers] = useState<PostReactionUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [mediaSize, setMediaSize] = useState({
    width: mediaWidthProp && mediaWidthProp > 0 ? mediaWidthProp : 0,
    height: mediaHeightProp && mediaHeightProp > 0 ? mediaHeightProp : 0,
  });
  const swipeRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const [storyProgress, setStoryProgress] = useState(0);
  const photoElapsedRef = useRef(0);
  const photoLastTickRef = useRef<number | null>(null);
  const wheelLockRef = useRef(0);
  const gestureLockRef = useRef(false);
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;

  useEffect(() => {
    setCommentsOpen(false);
    setGiftsOpen(false);
    setStoryProgress(0);
    photoElapsedRef.current = 0;
    photoLastTickRef.current = null;
  }, [src, postId]);

  useEffect(() => {
    if (!storyMode || !expanded) return;
    if (commentsOpen || giftsOpen) {
      photoLastTickRef.current = null;
      return;
    }
    let raf = 0;
    const limitMs = STORY_PHOTO_DURATION_SEC * 1000;
    const tick = (now: number) => {
      const last = photoLastTickRef.current ?? now;
      photoElapsedRef.current += now - last;
      photoLastTickRef.current = now;
      const next = Math.min(1, photoElapsedRef.current / limitMs);
      setStoryProgress(next);
      if (next >= 1) {
        navigationRef.current?.onNext();
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [storyMode, expanded, commentsOpen, giftsOpen, src, postId]);

  const shareUrl =
    authorUsername && postId ? buildPostShareUrl(authorUsername, postId, authorUid) : null;
  const shareTitle = authorUsername ? `@${authorUsername} en LiveBoom` : 'LiveBoom';
  const shareText =
    caption?.trim() ||
    (authorUsername ? `Mira esta foto de @${authorUsername} en LiveBoom` : 'Mira esta foto en LiveBoom');
  const profilePath =
    authorUsername || authorUid ? profileHref(authorUsername || 'user', authorUid) : null;

  useEffect(() => {
    if (startExpanded || overlayOnly) setExpanded(true);
  }, [startExpanded, overlayOnly]);

  useEffect(() => {
    onExpandChange?.(expanded);
  }, [expanded, onExpandChange]);

  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

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

  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.decoding = 'async';
    const onLoad = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setMediaSize({ width: img.naturalWidth, height: img.naturalHeight });
      }
    };
    img.addEventListener('load', onLoad);
    img.src = src;
    return () => img.removeEventListener('load', onLoad);
  }, [src]);

  useEffect(() => {
    if (!expanded) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeExpand();
      } else if (navigation && event.key === 'ArrowUp') {
        event.preventDefault();
        if (storyMode) navigation.onPrev();
        else navigation.onNext();
      } else if (navigation && event.key === 'ArrowDown') {
        event.preventDefault();
        if (storyMode) navigation.onNext();
        else navigation.onPrev();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, navigation, storyMode]);

  function openExpand() {
    setExpanded(true);
  }

  function closeExpand() {
    setCommentsOpen(false);
    if (overlayOnly) {
      onCloseExpand?.();
      return;
    }
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

  const pubW = mediaSize.width > 0 ? mediaSize.width : mediaWidthProp && mediaWidthProp > 0 ? mediaWidthProp : 0;
  const pubH = mediaSize.height > 0 ? mediaSize.height : mediaHeightProp && mediaHeightProp > 0 ? mediaHeightProp : 0;
  const publicationFillMode = !immersiveLandscapeLayout ? 'contain' : 'auto';
  const useLandscapeAside = isDesktop;

  const expandedOverlay =
    expanded && typeof document !== 'undefined' ? (
      <div
        className="fixed inset-0 z-[100] touch-none overflow-hidden overscroll-none bg-black"
        role="dialog"
        aria-modal
        aria-label="Publicación"
      >
        <ImmersiveMediaStage
          mediaWidth={pubW || (aspect === 'video' ? 16 : 1)}
          mediaHeight={pubH || (aspect === 'video' ? 9 : 1)}
          mediaUrl={src}
          mediaKind="image"
          landscapeRailAside
          fillMode={publicationFillMode}
          insets={{ top: 56, bottom: publicationCaption ? 132 : 100, left: 4, right: 4, actionRail: 56 }}
          onSwipeStart={(x, y) => {
            if (!navigation && !userNavigation) return;
            swipeRef.current = { x, y, active: true };
          }}
          onSwipeEnd={(clientX, clientY) => {
            if (!swipeRef.current.active) return;
            swipeRef.current.active = false;
            if (commentsOpen || giftsOpen) return;
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
            if (!navigation) return;
            gestureLockRef.current = true;
            window.setTimeout(() => {
              gestureLockRef.current = false;
            }, 80);
            if (gesture === 'item-next') navigation.onNext();
            else navigation.onPrev();
          }}
          onWheel={
            storyMode && navigation
              ? (deltaY) => {
                  if (commentsOpen || giftsOpen || Math.abs(deltaY) < STORY_WHEEL_MIN_DELTA) return;
                  const now = Date.now();
                  if (now - wheelLockRef.current < STORY_WHEEL_COOLDOWN_MS) return;
                  wheelLockRef.current = now;
                  if (deltaY > 0) navigation.onNext();
                  else navigation.onPrev();
                }
              : undefined
          }
          mediaOverlay={
            storyMode && navigation && !commentsOpen ? (
              <>
                <button
                  type="button"
                  className="absolute inset-y-0 left-0 z-[4] w-[32%] bg-transparent"
                  aria-label="Foto anterior"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (gestureLockRef.current) return;
                    navigation.onPrev();
                  }}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 z-[4] w-[68%] bg-transparent"
                  aria-label="Foto siguiente"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (gestureLockRef.current) return;
                    navigation.onNext();
                  }}
                />
              </>
            ) : null
          }
          sideChrome={
            postId ? (
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
                mediaUrl={src}
                mediaType="photo"
                commentsPanelOpen={commentsOpen}
                onGiftsOpenChange={setGiftsOpen}
                anchor="media"
                layout={useLandscapeAside ? 'aside' : 'corner'}
              />
            ) : null
          }
        >
          <img
            src={src}
            alt=""
            className="lb-post-media__img h-full w-full"
            draggable={false}
            onLoad={(event) => {
              const img = event.currentTarget;
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                setMediaSize({ width: img.naturalWidth, height: img.naturalHeight });
              }
            }}
          />
        </ImmersiveMediaStage>

        <header
          className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col"
        >
          {storyMode && position && position.total > 0 ? (
            <StorySegmentBar total={position.total} current={position.current} progress={storyProgress} />
          ) : null}
          <div
            className="pointer-events-auto flex items-center justify-between gap-3 px-3 pb-1"
            style={{
              paddingTop: storyMode
                ? '0.35rem'
                : 'max(0.75rem, env(safe-area-inset-top, 0px))',
            }}
          >
          {profilePath || originalUsername ? (
            <div className="min-w-0">
              {repostByUsername ? (
                <p className="text-[11px] font-semibold text-fuchsia-200">@{repostByUsername} reposteó</p>
              ) : null}
              <Link
                to={originalHref || profilePath || '#'}
                className="truncate text-sm font-semibold text-white hover:text-cyan-200"
              >
                @{originalUsername || authorUsername || 'user'}
              </Link>
            </div>
          ) : (
            <span className="truncate text-sm font-semibold text-white">
              {authorUsername ? `@${authorUsername}` : 'Foto'}
            </span>
          )}
          <div className="flex items-center gap-2">
            {position ? (
              <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white/80">
                {position.current}/{position.total}
              </span>
            ) : null}
            <button
              type="button"
              onClick={closeExpand}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
          </div>
        </header>

        {caption && !commentsOpen ? (
          publicationCaption ? (
            <PublicationCaptionOverlay caption={caption} />
          ) : (
            <p
              className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 text-sm text-white/90"
              style={{
                paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
                paddingLeft: 'max(4.5rem, env(safe-area-inset-left, 0px))',
              }}
            >
              {caption}
            </p>
          )
        ) : null}

        {commentsOpen && postId ? (
          <div
            className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex max-h-[min(44dvh,calc(100dvh-5rem))] min-w-0 flex-col overflow-x-hidden rounded-t-2xl border border-white/15 bg-zinc-950/95 backdrop-blur-md"
            style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom, 0px))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
              <p className="text-sm font-semibold text-white">Comentarios</p>
              <button
                type="button"
                onClick={() => setCommentsOpen(false)}
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
            />
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <>
      {!overlayOnly ? (
        <button
          type="button"
          onClick={openExpand}
          className="block w-full"
          aria-label="Expandir imagen"
        >
          <PublicationMedia
            src={src}
            mediaKind="image"
            width={pubW}
            height={pubH}
            overlay={
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
                      mediaUrl={src}
                      mediaType="photo"
                      postId={postId}
                      authorUid={authorUid}
                      authorUsername={authorUsername}
                      iconOnly
                    />
                  </span>
                ) : null}
              </>
            }
          >
            <img
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
              className="lb-post-media__img h-full w-full object-contain"
              onLoad={(event) => {
                const img = event.currentTarget;
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  setMediaSize({ width: img.naturalWidth, height: img.naturalHeight });
                }
              }}
            />
          </PublicationMedia>
        </button>
      ) : null}

      {expandedOverlay ? createPortal(expandedOverlay, document.body) : null}
    </>
  );
}
