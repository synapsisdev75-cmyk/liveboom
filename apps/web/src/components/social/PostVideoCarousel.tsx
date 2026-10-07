import { useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Hasta 3 videos de una Publicación: un reproductor a la vez, flechas + swipe horizontal. */
export function PostVideoCarousel({
  sources,
  renderVideo,
}: {
  sources: string[];
  renderVideo: (src: string, index: number) => ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const count = sources.length;
  const current = Math.min(index, Math.max(0, count - 1));
  const src = sources[current];
  if (!src) return null;

  function go(next: number) {
    setIndex(Math.max(0, Math.min(count - 1, next)));
  }

  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    touchRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function onTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchRef.current;
    touchRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    go(current + (dx < 0 ? 1 : -1));
  }

  return (
    <div className="relative min-w-0" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div key={`${current}-${src}`}>{renderVideo(src, current)}</div>
      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label="Video anterior"
            disabled={current <= 0}
            onClick={(event) => {
              event.stopPropagation();
              go(current - 1);
            }}
            className="absolute left-1 top-1/2 z-[12] grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            aria-label="Video siguiente"
            disabled={current >= count - 1}
            onClick={(event) => {
              event.stopPropagation();
              go(current + 1);
            }}
            className="absolute right-1 top-1/2 z-[12] grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronRight size={20} />
          </button>
          <p className="pointer-events-none absolute left-1/2 top-2 z-[12] -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            {current + 1}/{count}
          </p>
        </>
      ) : null}
    </div>
  );
}

/** Videos de una Publicación con varios clips; Boom Clip / Flash Boom y legacy devuelven solo `mediaUrl`. */
export function postVideoUrls(post: {
  type?: string | null;
  mediaUrl?: string | null;
  mediaUrls?: string[] | null;
  postFormat?: string | null;
}): string[] {
  if (post.type !== 'video' || !post.mediaUrl) return [];
  if (!post.postFormat && post.mediaUrls && post.mediaUrls.length > 1) {
    return post.mediaUrls.filter(Boolean).slice(0, 3);
  }
  return [post.mediaUrl];
}
