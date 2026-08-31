import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  listenPostReactions,
  setPostReaction,
  type PostReactionUser,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import { PostVideoPlayer } from '../social/PostVideoPlayer';
import { X, ChevronDown, ChevronUp } from 'lucide-react';

export type ReelFeedItem = {
  id: string;
  username: string;
  authorUid: string;
  caption: string;
  mediaUrl: string;
  mediaType?: 'photo' | 'video';
};

type Props = {
  reels: ReelFeedItem[];
  initialIndex: number;
  onClose: () => void;
  /** Flash Boom: auto-avance al terminar cada video. */
  storyMode?: boolean;
};

function reelPositionLabel(total: number, index: number) {
  if (total <= 0) return null;
  return (
    <span className="text-xs font-semibold text-zinc-400">
      {index + 1} / {total}
    </span>
  );
}

export function ReelFeedViewer({ reels, initialIndex, onClose, storyMode = false }: Props) {
  useBodyScrollLock(true);
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
        onClose();
        return current;
      });
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [index, storyMode, reel?.id, reel?.mediaType, reels.length, onClose]);

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
      onClose();
      return;
    }
    setToast('¡Es todo! No hay más reels por ahora.');
  }

  function goPrev() {
    if (index > 0) {
      setIndex((value) => value - 1);
      return;
    }
    setToast('Este es el primer reel.');
  }

  const swipeRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });

  function onPhotoTouchStart(clientX: number, clientY: number) {
    swipeRef.current = { x: clientX, y: clientY, active: true };
  }

  function onPhotoTouchEnd(clientX: number, clientY: number) {
    if (!swipeRef.current.active) return;
    swipeRef.current.active = false;
    const dx = clientX - swipeRef.current.x;
    const dy = clientY - swipeRef.current.y;
    if (Math.abs(dy) < 48 || Math.abs(dy) < Math.abs(dx) * 1.15) return;
    if (dy < 0) goNext();
    else goPrev();
  }

  useEffect(() => {
    if (reel?.mediaType === 'video') return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        goNext();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        goPrev();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, reel?.mediaType, reels.length, storyMode]);

  const content = (
    <>
      {reel.mediaType === 'photo' ? (
        <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden overscroll-none bg-black">
          <div
            className="flex shrink-0 items-center justify-between px-4 py-3"
            style={{ paddingTop: 'max(0.75rem, var(--lb-safe-top))' }}
          >
            <p className="text-sm font-semibold text-white">@{reel.username}</p>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
          <div
            className="relative flex flex-1 items-center justify-center px-2"
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (!touch) return;
              onPhotoTouchStart(touch.clientX, touch.clientY);
            }}
            onTouchEnd={(event) => {
              const touch = event.changedTouches[0];
              if (!touch) return;
              onPhotoTouchEnd(touch.clientX, touch.clientY);
            }}
          >
            <button
              type="button"
              className="absolute inset-x-0 top-0 z-10 h-[22%] md:hidden"
              onClick={goNext}
              aria-label="Siguiente"
            />
            <button
              type="button"
              onClick={goNext}
              className="absolute right-[4.75rem] top-[42%] z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/15 text-white/30 opacity-70 transition hover:bg-black/35 hover:text-white/60 hover:opacity-100 lg:right-[5.25rem] lg:h-12 lg:w-12"
              aria-label="Flash siguiente"
            >
              <ChevronUp size={26} strokeWidth={2.25} />
            </button>
            <img src={reel.mediaUrl} alt="" className="max-h-full max-w-full object-contain" />
            <button
              type="button"
              onClick={goPrev}
              className="absolute right-[4.75rem] top-[58%] z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/15 text-white/30 opacity-70 transition hover:bg-black/35 hover:text-white/60 hover:opacity-100 lg:right-[5.25rem] lg:h-12 lg:w-12"
              aria-label="Flash anterior"
            >
              <ChevronDown size={26} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              className="absolute inset-x-0 bottom-0 z-10 h-[22%] md:hidden"
              onClick={goPrev}
              aria-label="Anterior"
            />
          </div>
          {reel.caption ? (
            <p className="px-4 pb-2 text-center text-sm text-zinc-300">{reel.caption}</p>
          ) : null}
          <div
            className="flex shrink-0 items-center justify-between px-4 py-3"
            style={{ paddingBottom: 'max(1rem, var(--lb-safe-bottom))' }}
          >
            <button type="button" onClick={goPrev} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/15 text-white/30 opacity-70">
              <ChevronDown size={20} strokeWidth={2.25} />
            </button>
            {reelPositionLabel(reels.length, index)}
            <button type="button" onClick={goNext} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/15 text-white/30 opacity-70">
              <ChevronUp size={20} strokeWidth={2.25} />
            </button>
          </div>
        </div>
      ) : (
        <PostVideoPlayer
          key={reel.id}
          src={reel.mediaUrl}
          postId={reel.id}
          authorUid={reel.authorUid}
          authorUsername={reel.username}
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
          reelNavigation={{ onNext: goNext, onPrev: goPrev }}
          reelPosition={{ current: index + 1, total: reels.length }}
          storyMode={storyMode}
          onCloseExpand={onClose}
        />
      )}
      {toast && typeof document !== 'undefined'
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 top-[max(4.5rem,var(--lb-safe-top))] z-[80] flex justify-center px-4">
              <p className="rounded-full border border-white/15 bg-zinc-900/95 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-xl backdrop-blur-md">
                {toast}
              </p>
            </div>,
            document.body,
          )
        : null}
    </>
  );

  if (typeof document === 'undefined') return content;
  return createPortal(content, document.body);
}
