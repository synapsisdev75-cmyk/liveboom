import { useEffect, useRef } from 'react';

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
  const ref = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = wrapRef.current;
    const video = ref.current;
    if (!host || !video) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
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
    return () => io.disconnect();
  }, [src]);

  return (
    <div ref={wrapRef} className="relative">
      <video
        ref={ref}
        src={src}
        className={className}
        muted
        loop
        playsInline
        preload="metadata"
        onClick={onActivate}
      />
    </div>
  );
}
