import { useBackLayer } from '../../lib/backLayer';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  listenPostReactions,
  setPostReaction,
  type PostReactionUser,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import {
  authorLocalPosition,
  nextAuthorIndex,
  prevAuthorIndex,
} from '../../lib/storyAuthorNav';
import { PostPhotoViewer } from '../social/PostPhotoViewer';
import { PostVideoPlayer } from '../social/PostVideoPlayer';
import { originalPostPath } from '../social/RepostPostCard';
import type { MediaOverlayItem } from '../../lib/mediaOverlays';
import type { PostTextStyle, TextStyleRange } from '../../lib/postTextStyle';
import {
  exploreNavMarkGesture,
  exploreNavRecordFrame,
  exploreNavRecordUi,
  exploreNavRelease,
} from '../../lib/exploreVideoPool';
import { TRANSPARENT_VIDEO_POSTER } from '../../lib/videoPoster';
import { isTouchPortraitViewport } from '../../responsive/viewport';
import { enterExploreWithSound } from '../../lib/exploreFeedMute';

export type ReelFeedItem = {
  id: string;
  username: string;
  authorUid: string;
  caption: string;
  mediaUrl: string;
  mediaType?: 'photo' | 'video';
  authorAvatarUrl?: string | null;
  /** Miniatura vertical para Boom Clip */
  thumbUrl?: string | null;
  /** Boom Clip / Publicación */
  contentBadge?: string | null;
  durationSec?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  sharedFromPostId?: string | null;
  sharedFromAuthorUid?: string | null;
  sharedFromUsername?: string | null;
  overlays?: MediaOverlayItem[];
  /** Estilo del texto ("Aa") y fragmentos con estilo propio. */
  textStyle?: PostTextStyle | null;
  textStyleRanges?: TextStyleRange[];
};

type Props = {
  reels: ReelFeedItem[];
  initialIndex: number;
  onClose?: () => void;
  /** Flash Boom: auto-avance al terminar cada video. */
  storyMode?: boolean;
  /** Boom Clip / Flash Boom: Ver más / Ver menos en la descripción. */
  collapsibleCaption?: boolean;
  /** Embebido en página (Explorar): sin portal ni botón cerrar. */
  embedded?: boolean;
  /** Explorar / Boom Clip / Flash: cover en móvil. El rail aside en PC es independiente. */
  immersiveLandscapeLayout?: boolean;
  onIndexChange?: (index: number) => void;
  /** Explorar: mantiene el video actual si la cola se reordena o crece. */
  activeId?: string | null;
  /** Explorar: latest-wins, pool de prefetch y sin remount del reproductor. */
  exploreFastNav?: boolean;
  /** Solo Explorar: plaza (presencia, hilo, puerta al LIVE). Apagada en el resto. */
  plaza?: ReactNode;
  /** Solo Explorar: acción "Chat del video" en la barra lateral. */
  railExtra?: ReactNode;
  /** Visor de Boom Clip: sin etiqueta, @autor ni descripción sobre el video. */
  hideMediaInfo?: boolean;
  /** Barra de avance del video. No usarla en Flash Boom. */
  durationBar?: boolean;
  /** Boom Clip / Publicaciones: deslizar encadenado (el siguiente video sigue al dedo). */
  chainSwipe?: boolean;
  /** Segundo inicial del primer video (continuar desde la tarjeta del feed). */
  initialStartSec?: number;
  /** Publicaciones de Inicio: video completo (contain + blur), sin recorte en móvil vertical. */
  containMedia?: boolean;
};

/** Igual que ImmersiveMediaStage en modo `auto`: celular/tablet en vertical llena la pantalla. */
function chainPeekCovers(containMedia: boolean) {
  if (containMedia || typeof window === 'undefined') return false;
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  return portrait && (window.innerWidth < 1024 || isTouchPortraitViewport());
}

function ReelChainPeek({ item, cover }: { item: ReelFeedItem; cover: boolean }) {
  const fit = cover ? 'object-cover' : 'object-contain';
  const still = item.mediaType === 'photo' ? item.mediaUrl : item.thumbUrl;
  if (still) {
    return (
      <img
        src={still}
        alt=""
        className={`h-full w-full ${fit}`}
        draggable={false}
        decoding="async"
      />
    );
  }
  return (
    <video
      src={`${item.mediaUrl}#t=0.1`}
      poster={TRANSPARENT_VIDEO_POSTER}
      className={`h-full w-full ${fit}`}
      muted
      playsInline
      preload="auto"
    />
  );
}

export function ReelFeedViewer({
  reels,
  initialIndex,
  onClose,
  storyMode = false,
  embedded = false,
  immersiveLandscapeLayout = true,
  collapsibleCaption = false,
  onIndexChange,
  activeId,
  exploreFastNav = false,
  plaza = null,
  railExtra = null,
  hideMediaInfo = false,
  durationBar = false,
  chainSwipe = false,
  initialStartSec,
  containMedia = false,
}: Props) {
  useBodyScrollLock(!embedded);
  useBackLayer(!embedded, onClose);
  // Boom Clip / Flash Boom: cada apertura del visor arranca con sonido (Explorar lo hace en ExploreView).
  const [leaveViewerSound] = useState(() => (exploreFastNav ? null : enterExploreWithSound()));
  useEffect(() => leaveViewerSound ?? undefined, [leaveViewerSound]);
  const profile = useAuthStore((state) => state.profile);
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), Math.max(reels.length - 1, 0)),
  );
  const [toast, setToast] = useState<string | null>(null);
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [viewerReaction, setViewerReaction] = useState<'like' | 'dislike' | null>(null);
  const [likers, setLikers] = useState<PostReactionUser[]>([]);
  const [dislikers, setDislikers] = useState<PostReactionUser[]>([]);
  const [busy, setBusy] = useState(false);

  const reel = reels[index];
  const [startOnce, setStartOnce] = useState(() => {
    const first = reels[Math.min(Math.max(initialIndex, 0), Math.max(reels.length - 1, 0))];
    return first && initialStartSec && initialStartSec > 0
      ? { id: first.id, sec: initialStartSec }
      : null;
  });
  useEffect(() => {
    if (startOnce && reel && reel.id !== startOnce.id) setStartOnce(null);
  }, [startOnce, reel]);
  const originId = reel ? reel.sharedFromPostId || reel.id : '';
  const originUid = reel ? reel.sharedFromAuthorUid || reel.authorUid : '';
  const originUsername = reel ? reel.sharedFromUsername || reel.username : '';
  const isRepost = Boolean(reel?.sharedFromPostId && reel?.sharedFromUsername);
  const originHref =
    isRepost && reel?.sharedFromUsername && reel.sharedFromPostId
      ? originalPostPath(reel.sharedFromUsername, reel.sharedFromPostId, reel.sharedFromAuthorUid)
      : null;

  const onIndexChangeRef = useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;
  const gestureAtRef = useRef(0);
  const desiredIdRef = useRef<string | null>(null);
  const indexRef = useRef(index);
  const reelsRef = useRef(reels);
  reelsRef.current = reels;

  useLayoutEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    setIndex((current) => Math.min(Math.max(current, 0), Math.max(reels.length - 1, 0)));
  }, [reels.length]);

  const reelIdsKey = useMemo(() => reels.map((item) => item.id).join('\n'), [reels]);

  useEffect(() => {
    if (!activeId) return;
    if (desiredIdRef.current && desiredIdRef.current !== activeId) return;
    const next = reelIdsKey ? reelIdsKey.split('\n').indexOf(activeId) : -1;
    if (next < 0) return;
    if (desiredIdRef.current === activeId) desiredIdRef.current = null;
    setIndex((current) => (current === next ? current : next));
  }, [activeId, reelIdsKey]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      onIndexChangeRef.current?.(index);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [index]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!originId || !profile) return;
    return listenPostReactions(originId, profile.firebaseUid, (stats) => {
      setLikes(stats.likes);
      setDislikes(stats.dislikes);
      setViewerReaction(stats.viewerReaction);
      setLikers(stats.likers);
      setDislikers(stats.dislikers);
    });
  }, [originId, profile?.firebaseUid]);

  // Precarga los siguientes videos de ESTA cola (evita pantalla vacía al deslizar).
  // Clave por URL: el arreglo `reels` cambia de identidad con cada actualización del pool y eso
  // cancelaba y reiniciaba las mismas descargas.
  const upcomingUrlsKey = exploreFastNav
    ? ''
    : [reels[index + 1], reels[index + 2], reels[index + 3]]
        .filter((item): item is ReelFeedItem => Boolean(item?.mediaUrl && item.mediaType !== 'photo'))
        .map((item) => item.mediaUrl)
        .join('\n');
  useEffect(() => {
    if (!upcomingUrlsKey) return;
    const els = upcomingUrlsKey.split('\n').map((url) => {
      const el = document.createElement('video');
      el.preload = 'auto';
      el.muted = true;
      el.src = url;
      return el;
    });
    return () => {
      for (const el of els) {
        el.removeAttribute('src');
        el.load();
      }
    };
  }, [upcomingUrlsKey]);

  const explorePrevUrl = exploreFastNav
    ? reels[index - 1]?.mediaType === 'photo'
      ? null
      : reels[index - 1]?.mediaUrl || null
    : null;
  const exploreNextUrl = exploreFastNav
    ? reels[index + 1]?.mediaType === 'photo'
      ? null
      : reels[index + 1]?.mediaUrl || null
    : null;
  const exploreNext2Url = exploreFastNav
    ? reels[index + 2]?.mediaType === 'photo'
      ? null
      : reels[index + 2]?.mediaUrl || null
    : null;

  useLayoutEffect(() => {
    if (!exploreFastNav) return;
    if (gestureAtRef.current > 0) exploreNavRecordUi(gestureAtRef.current);
  }, [exploreFastNav, index]);

  useEffect(() => {
    if (!exploreFastNav) return;
    return () => exploreNavRelease();
  }, [exploreFastNav]);

  const storyPosition = useMemo(
    () => (storyMode ? authorLocalPosition(reels, index) : { current: index + 1, total: reels.length }),
    [storyMode, reels, index],
  );

  useEffect(() => {
    if (!storyMode || embedded) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        const next = nextAuthorIndex(reels, index);
        if (next >= 0) setIndex(next);
        else onClose?.();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const prev = prevAuthorIndex(reels, index);
        if (prev >= 0) setIndex(prev);
        else setToast('Este es el primer usuario.');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [storyMode, embedded, index, reels, onClose]);

  if (!reel) return null;

  async function react(reaction: 'like' | 'dislike') {
    if (!profile || !reel) return;
    setBusy(true);
    try {
      await setPostReaction(
        originId,
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

  function markNavGesture() {
    if (!exploreFastNav) return;
    gestureAtRef.current = exploreNavMarkGesture();
  }

  function goNext() {
    markNavGesture();
    const list = reelsRef.current;
    const from = indexRef.current;
    if (from < list.length - 1) {
      const nextIndex = from + 1;
      indexRef.current = nextIndex;
      desiredIdRef.current = list[nextIndex]?.id || null;
      setIndex(nextIndex);
      return;
    }
    if (storyMode) {
      onClose?.();
      return;
    }
    setToast('¡Es todo! Desliza más tarde para nuevos videos.');
  }

  function goPrev() {
    markNavGesture();
    const list = reelsRef.current;
    const from = indexRef.current;
    if (from > 0) {
      const nextIndex = from - 1;
      indexRef.current = nextIndex;
      desiredIdRef.current = list[nextIndex]?.id || null;
      setIndex(nextIndex);
      return;
    }
    setToast('Este es el primer video.');
  }

  function goNextUser() {
    const next = nextAuthorIndex(reels, index);
    if (next >= 0) {
      setIndex(next);
      return;
    }
    if (storyMode) {
      onClose?.();
      return;
    }
    setToast('¡Es todo! Desliza más tarde para nuevos videos.');
  }

  function goPrevUser() {
    const prev = prevAuthorIndex(reels, index);
    if (prev >= 0) {
      setIndex(prev);
      return;
    }
    setToast('Este es el primer usuario.');
  }

  const userNavigation = storyMode ? { onNextUser: goNextUser, onPrevUser: goPrevUser } : undefined;
  const prevReel = index > 0 ? reels[index - 1] : undefined;
  const nextReel = reels[index + 1];
  const peekCover = chainSwipe ? chainPeekCovers(containMedia) : false;

  const player = (
    <>
      {reel.mediaType === 'photo' ? (
        <PostPhotoViewer
          key={reel.id}
          src={reel.mediaUrl}
          caption={reel.caption}
          captionTextStyle={reel.textStyle}
          captionTextStyleRanges={reel.textStyleRanges}
          postId={originId}
          authorUid={originUid}
          authorUsername={originUsername}
          authorAvatarUrl={reel.authorAvatarUrl}
          overlayOnly
          startExpanded
          embedded={embedded}
          onCloseExpand={onClose}
          navigation={{ onNext: goNext, onPrev: goPrev }}
          userNavigation={userNavigation}
          position={storyPosition}
          immersiveLandscapeLayout={immersiveLandscapeLayout}
          publicationCaption={collapsibleCaption}
          storyMode={storyMode}
          repostByUsername={isRepost ? reel.username : null}
          originalUsername={isRepost ? originUsername : null}
          originalHref={originHref}
          overlays={reel.overlays}
          railExtra={railExtra}
        />
      ) : (
        <PostVideoPlayer
          key={exploreFastNav ? 'explore-player' : reel.id}
          src={reel.mediaUrl}
          postId={originId}
          authorUid={originUid}
          authorUsername={originUsername}
          authorAvatarUrl={reel.authorAvatarUrl}
          caption={reel.caption}
          captionTextStyle={reel.textStyle}
          captionTextStyleRanges={reel.textStyleRanges}
          likes={likes}
          dislikes={dislikes}
          viewerReaction={viewerReaction}
          likers={likers}
          dislikers={dislikers}
          busy={busy}
          onReact={(r) => void react(r)}
          overlayOnly
          reelFeed
          startExpanded
          embedded={embedded}
          hideClose={embedded}
          contentBadge={reel.contentBadge}
          reelNavigation={{
            onNext: goNext,
            onPrev: goPrev,
            chain:
              chainSwipe && !embedded && !exploreFastNav
                ? {
                    prev: prevReel ? <ReelChainPeek item={prevReel} cover={peekCover} /> : null,
                    next: nextReel ? <ReelChainPeek item={nextReel} cover={peekCover} /> : null,
                  }
                : undefined,
          }}
          userNavigation={userNavigation}
          reelPosition={storyPosition}
          storyMode={storyMode}
          itemSideNav={storyMode}
          durationBar={durationBar}
          durationSec={reel.durationSec}
          onCloseExpand={onClose}
          immersiveLandscapeLayout={immersiveLandscapeLayout}
          publicationCaption={collapsibleCaption}
          repostByUsername={isRepost ? reel.username : null}
          originalUsername={isRepost ? originUsername : null}
          originalHref={originHref}
          overlays={reel.overlays}
          posterUrl={
            exploreFastNav
              ? reel.thumbUrl || TRANSPARENT_VIDEO_POSTER
              : chainSwipe
                ? reel.thumbUrl || undefined
                : undefined
          }
          mediaWidth={exploreFastNav ? reel.mediaWidth || undefined : undefined}
          mediaHeight={exploreFastNav ? reel.mediaHeight || undefined : undefined}
          startAtSec={startOnce?.id === reel.id ? startOnce.sec : undefined}
          containFill={containMedia}
          skipRemoteAspectProbe={exploreFastNav}
          fastNav={exploreFastNav}
          fastNavPrevUrl={explorePrevUrl}
          fastNavNextUrl={exploreNextUrl}
          fastNavNext2Url={exploreNext2Url}
          onFirstFrame={
            exploreFastNav
              ? () => {
                  if (gestureAtRef.current > 0) exploreNavRecordFrame(gestureAtRef.current);
                }
              : undefined
          }
          railExtra={railExtra}
          hideOverlayInfo={hideMediaInfo}
        />
      )}
      {storyMode && !embedded ? (
        <div className="pointer-events-none fixed inset-0 z-[105] hidden lg:block">
          <button
            type="button"
            className="pointer-events-auto absolute left-[max(0.5rem,var(--lb-safe-left))] top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm"
            aria-label="Usuario anterior"
            onClick={(event) => {
              event.stopPropagation();
              goPrevUser();
            }}
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            className="pointer-events-auto absolute right-[max(0.5rem,var(--lb-safe-right))] top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm"
            aria-label="Siguiente usuario"
            onClick={(event) => {
              event.stopPropagation();
              goNextUser();
            }}
          >
            <ChevronRight size={22} />
          </button>
        </div>
      ) : null}
      {toast && typeof document !== 'undefined'
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 top-[max(4.5rem,var(--lb-safe-top))] z-[110] flex justify-center px-4">
              <p className="rounded-full border border-white/15 bg-zinc-900/95 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-xl backdrop-blur-md">
                {toast}
              </p>
            </div>,
            document.body,
          )
        : null}
    </>
  );

  if (embedded) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-black">
        {player}
        {plaza}
      </div>
    );
  }

  if (typeof document === 'undefined') return player;
  return createPortal(player, document.body);
}
