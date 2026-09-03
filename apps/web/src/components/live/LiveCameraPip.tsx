import { VideoTrack, type TrackReference } from '@livekit/components-react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { computePipRect, type PipNormalizedPos } from '../../lib/liveScreenComposer';

type Props = {
  trackRef: TrackReference;
  pipPos: PipNormalizedPos;
  visible: boolean;
  mirrored?: boolean;
};

/** Cámara flotante sobre pantalla/juego (preview local o remoto). */
export function LiveCameraPip({ trackRef, pipPos, visible, mirrored = false }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<ReturnType<typeof computePipRect> | null>(null);

  const measure = useCallback(() => {
    const box = rootRef.current?.parentElement;
    if (!box) return;
    setRect(computePipRect(box.clientWidth, box.clientHeight, pipPos.nx, pipPos.ny));
  }, [pipPos.nx, pipPos.ny]);

  useLayoutEffect(() => {
    measure();
    const box = rootRef.current?.parentElement;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(box);
    return () => ro.disconnect();
  }, [measure]);

  if (!visible || !rect) {
    return <div ref={rootRef} className="pointer-events-none absolute inset-0" />;
  }

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[15]">
      <div
        className={`absolute overflow-hidden rounded-2xl border-2 border-white/35 shadow-lg ring-1 ring-black/40 ${
          mirrored ? 'lb-live-mirror-on' : ''
        }`}
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        }}
      >
        <VideoTrack
          trackRef={trackRef}
          className="h-full w-full object-cover [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
        />
      </div>
    </div>
  );
}
