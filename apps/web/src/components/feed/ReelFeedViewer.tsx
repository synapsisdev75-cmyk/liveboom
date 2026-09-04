import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  sharedFromPostId?: string | null;
  sharedFromAuthorUid?: string | null;
  sharedFromUsername?: string | null;
  overlays?: MediaOverlayItem[];
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
};

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
}: Props) {
  useBodyScrollLock(!embedded);
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

  useEffect(() => {
    setIndex((current) => Math.min(Math.max(current, 0), Math.max(reels.length - 1, 0)));
  }, [reels.length]);

  const reelIdsKey = useMemo(() => reels.map((item) => item.id).join('\n'), [reels]);

  useEffect(() => {
    if (!activeId) return;
    const next = reelIdsKey ? reelIdsKey.split('\n').indexOf(activeId) : -1;
    if (next < 0) return;
    setIndex((current) => (current === next ? current : next));
  }, [activeId, reelIdsKey]);

  useEffect(() => {
    onIndexChangeRef.current?.(index);
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
  useEffect(() => {
    const upcoming = [reels[index + 1], reels[index + 2], reels[index + 3]].filter(
      (item): item is ReelFeedItem => Boolean(item?.mediaUrl && item.mediaType !== 'photo'),
    );
    if (upcoming.length === 0) return;
    const els = upcoming.map((item) => {
      const el = document.createElement('video');
      el.preload = 'auto';
      el.muted = true;
      el.src = item.mediaUrl;
      return el;
    });
    return () => {
      for (const el of els) {
        el.removeAttribute('src');
        el.load();
      }
    };
  }, [index, reels]);

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

  function goNext() {
    if (index < reels.length - 1) {
      setIndex((value) => value + 1);
      return;
    }
    if (storyMode) {
      onClose?.();
      return;
    }
    setToast('¡Es todo! Desliza más tarde para nuevos videos.');
  }

  function goPrev() {
    if (index > 0) {
      setIndex((value) => value - 1);
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

  const player = (
    <>
      {reel.mediaType === 'photo' ? (
        <PostPhotoViewer
          key={reel.id}
          src={reel.mediaUrl}
          caption={reel.caption}
          postId={originId}
          authorUid={originUid}
          authorUsername={originUsername}
          authorAvatarUrl={reel.authorAvatarUrl}
          overlayOnly
          startExpanded
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
        />
      ) : (
        <PostVideoPlayer
          key={reel.id}
          src={reel.mediaUrl}
          postId={originId}
          authorUid={originUid}
          authorUsername={originUsername}
          authorAvatarUrl={reel.authorAvatarUrl}
          caption={reel.caption}
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
          reelNavigation={{ onNext: goNext, onPrev: goPrev }}
          userNavigation={userNavigation}
          reelPosition={storyPosition}
          storyMode={storyMode}
          itemSideNav={storyMode}
          durationSec={reel.durationSec}
          onCloseExpand={onClose}
          immersiveLandscapeLayout={immersiveLandscapeLayout}
          publicationCaption={collapsibleCaption}
          repostByUsername={isRepost ? reel.username : null}
          originalUsername={isRepost ? originUsername : null}
          originalHref={originHref}
          overlays={reel.overlays}
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
    return <div className="relative h-full w-full overflow-hidden bg-black">{player}</div>;
  }

  if (typeof document === 'undefined') return player;
  return createPortal(player, document.body);
}
