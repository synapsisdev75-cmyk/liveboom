import { VideoTrack, type TrackReference } from '@livekit/components-react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { LiveAspectRatio } from '../../lib/liveAspectRatio';
import {
  computeFrameRect,
  normalizeFrameLayout,
  type LiveFrameLayout,
  type PipRectOptions,
} from '../../lib/liveScreenComposer';

type Props = {
  trackRef: TrackReference;
  layout: LiveFrameLayout;
  frameAspect: LiveAspectRatio;
  visible?: boolean;
  mirrored?: boolean;
  pipAspectRatio?: number;
  rectOptions?: PipRectOptions;
};

/** Video en un recuadro con posición/tamaño normalizado (host y espectadores). */
export function LiveFramedVideo({
  trackRef,
  layout,
  frameAspect,
  visible = true,
  mirrored = false,
  pipAspectRatio,
  rectOptions,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<ReturnType<typeof computeFrameRect> | null>(null);
  const normalized = normalizeFrameLayout(layout, undefined, rectOptions?.maxNw);
  const measure = useCallback(() => {
    const box = rootRef.current?.parentElement;
    if (!box) return;
    setRect(
      computeFrameRect(box.clientWidth, box.clientHeight, normalized, frameAspect, {
        ...rectOptions,
        pipAspect: pipAspectRatio,
      }),
    );
  }, [
    normalized.nx,
    normalized.ny,
    normalized.nw,
    frameAspect,
    pipAspectRatio,
    rectOptions?.maxNw,
    rectOptions?.minWidthPx,
  ]);

  useLayoutEffect(() => {
    measure();
    const box = rootRef.current?.parentElement;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(box);
    return () => ro.disconnect();
  }, [measure]);

  const isFullFrame = normalized.nw >= 0.99;

  if (!visible || !rect) {
    return <div ref={rootRef} className="pointer-events-none absolute inset-0" />;
  }

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0">
      <div
        className={`lb-live-framed-pip absolute overflow-hidden ${
          isFullFrame
            ? 'rounded-none border-0 shadow-none ring-0'
            : 'rounded-2xl border-2 border-white/30 shadow-lg ring-1 ring-black/40'
        } ${mirrored ? 'lb-live-mirror-on' : ''}`}
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        }}
      >
        <VideoTrack
          trackRef={trackRef}
          className={`h-full w-full [&_video]:h-full [&_video]:w-full ${
            isFullFrame
              ? 'object-contain [&_video]:object-contain'
              : 'object-cover [&_video]:object-cover'
          }`}
        />
      </div>
    </div>
  );
}
