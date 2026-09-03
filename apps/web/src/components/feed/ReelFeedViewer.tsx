import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  listenPostReactions,
  setPostReaction,
  type PostReactionUser,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import { PostPhotoViewer } from '../social/PostPhotoViewer';
import { PostVideoPlayer } from '../social/PostVideoPlayer';

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
};

type Props = {
  reels: ReelFeedItem[];
  initialIndex: number;
  onClose?: () => void;
  /** Flash Boom: auto-avance al terminar cada video. */
  storyMode?: boolean;
  /** Embebido en página (Explorar): sin portal ni botón cerrar. */
  embedded?: boolean;
  /** Explorar / Flash Boom: layout horizontal con rail fijo al lado. */
  immersiveLandscapeLayout?: boolean;
  onIndexChange?: (index: number) => void;
};

export function ReelFeedViewer({
  reels,
  initialIndex,
  onClose,
  storyMode = false,
  embedded = false,
  immersiveLandscapeLayout = false,
  onIndexChange,
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

  useEffect(() => {
    setIndex((current) => Math.min(Math.max(current, 0), Math.max(reels.length - 1, 0)));
  }, [reels.length]);

  useEffect(() => {
    onIndexChange?.(index);
  }, [index, onIndexChange]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!reel || !profile) return;
    return listenPostReactions(reel.id, profile.firebaseUid, (stats) => {
      setLikes(stats.likes);
      setDislikes(stats.dislikes);
      setViewerReaction(stats.viewerReaction);
      setLikers(stats.likers);
      setDislikers(stats.dislikers);
    });
  }, [reel?.id, profile?.firebaseUid]);

  useEffect(() => {
    if (!storyMode || !reel || reel.mediaType !== 'photo') return;
    const timer = window.setTimeout(() => {
      setIndex((current) => {
        if (current < reels.length - 1) return current + 1;
        onClose?.();
        return current;
      });
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [index, storyMode, reel?.id, reel?.mediaType, reels.length, onClose]);

  // Precarga URL del siguiente video
  useEffect(() => {
    const next = reels[index + 1];
    if (!next?.mediaUrl || next.mediaType === 'photo') return;
    const el = document.createElement('video');
    el.preload = 'auto';
    el.muted = true;
    el.src = next.mediaUrl;
    return () => {
      el.removeAttribute('src');
      el.load();
    };
  }, [index, reels]);

  if (!reel) return null;

  async function react(reaction: 'like' | 'dislike') {
    if (!profile || !reel) return;
    setBusy(true);
    try {
      await setPostReaction(
        reel.id,
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

  const player = (
    <>
      {reel.mediaType === 'photo' ? (
        <PostPhotoViewer
          key={reel.id}
          src={reel.mediaUrl}
          caption={reel.caption}
          postId={reel.id}
          authorUid={reel.authorUid}
          authorUsername={reel.username}
          authorAvatarUrl={reel.authorAvatarUrl}
          overlayOnly
          startExpanded
          onCloseExpand={onClose}
          navigation={{ onNext: goNext, onPrev: goPrev }}
          position={{ current: index + 1, total: reels.length }}
          immersiveLandscapeLayout={immersiveLandscapeLayout}
        />
      ) : (
        <PostVideoPlayer
          key={reel.id}
          src={reel.mediaUrl}
          postId={reel.id}
          authorUid={reel.authorUid}
          authorUsername={reel.username}
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
          reelPosition={{ current: index + 1, total: reels.length }}
          storyMode={storyMode}
          onCloseExpand={onClose}
          immersiveLandscapeLayout={immersiveLandscapeLayout}
        />
      )}
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
