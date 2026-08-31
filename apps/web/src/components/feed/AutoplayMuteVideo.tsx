import { useEffect, useId, useRef } from 'react';
import {
  claimExclusivePlayback,
  isExclusiveHeldByOther,
  registerFeedVideo,
  releaseExclusivePlayback,
} from '../../lib/videoPlayback';

/** Video que se reproduce solo (muted) al entrar en pantalla. */
export function AutoplayMuteVideo({
  src,
  className,
  onActivate,
}: {
  src: string;
  className?: string;
  onActivate?: () => void;
}) {
  const reactId = useId();
  const id = `autoplay-${reactId}`;
  const ref = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return registerFeedVideo({
      id,
      pause: () => ref.current?.pause(),
      mute: () => {
        if (ref.current) ref.current.muted = true;
      },
    });
  }, [id]);

  useEffect(() => {
    const host = wrapRef.current;
    const video = ref.current;
    if (!host || !video) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (isExclusiveHeldByOther(id)) {
          video.pause();
          return;
        }
        if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
          video.muted = true;
          void video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: [0, 0.4, 0.7] },
    );
    io.observe(host);
    return () => {
      io.disconnect();
      video.pause();
      releaseExclusivePlayback(id);
    };
  }, [src, id]);

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <video
        ref={ref}
        src={src}
        className={className}
        muted
        loop
        playsInline
        preload="metadata"
        onClick={() => {
          claimExclusivePlayback(id);
          onActivate?.();
        }}
      />
    </div>
  );
}
