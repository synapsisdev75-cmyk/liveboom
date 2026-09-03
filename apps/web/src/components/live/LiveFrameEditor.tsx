import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { LiveAspectRatio } from '../../lib/liveAspectRatio';
import {
  computeFrameRect,
  frameAspectRatio,
  layoutFromRect,
  LIVE_FRAME_MIN_NW,
  normalizeFrameLayout,
  type LiveFrameLayout,
  type PipRectOptions,
} from '../../lib/liveScreenComposer';

type Props = {
  layout: LiveFrameLayout;
  frameAspect: LiveAspectRatio;
  visible: boolean;
  onLayoutChange: (layout: LiveFrameLayout) => void;
  onToggleVisible?: () => void;
  toggleLabel?: { show: string; hide: string };
  /** Aspect ratio intrínseco de la cámara (compartir pantalla). */
  pipAspectRatio?: number;
  rectOptions?: PipRectOptions;
};

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

export function LiveFrameEditor({
  layout,
  frameAspect,
  visible,
  onLayoutChange,
  onToggleVisible,
  toggleLabel,
  pipAspectRatio,
  rectOptions,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<ReturnType<typeof computeFrameRect> | null>(null);
  const dragMode = useRef<DragMode | null>(null);
  const dragStart = useRef({
    px: 0,
    py: 0,
    ox: 0,
    oy: 0,
    ow: 0,
    oh: 0,
    maxX: 0,
    maxY: 0,
    containerW: 0,
    containerH: 0,
  });

  const maxNw = rectOptions?.maxNw;
  const normalized = normalizeFrameLayout(layout, undefined, maxNw ?? undefined);

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

  const applyRect = useCallback(
    (x: number, y: number, width: number, height: number) => {
      const box = rootRef.current?.parentElement;
      if (!box) return;
      onLayoutChange(
        layoutFromRect(
          box.clientWidth,
          box.clientHeight,
          x,
          y,
          width,
          height,
          { maxNw: rectOptions?.maxNw, minWidthPx: rectOptions?.minWidthPx },
        ),
      );
    },
    [onLayoutChange, rectOptions?.maxNw, rectOptions?.minWidthPx],
  );

  const onWindowPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!dragMode.current) return;
      const {
        px,
        py,
        ox,
        oy,
        ow,
        oh,
        maxX,
        maxY,
        containerW,
        containerH,
      } = dragStart.current;
      const dx = event.clientX - px;
      const dy = event.clientY - py;
      const ar = pipAspectRatio ?? frameAspectRatio(frameAspect);
      const minW = Math.max(
        rectOptions?.minWidthPx ?? 0,
        containerW * LIVE_FRAME_MIN_NW,
      );
      const maxW = containerW * (rectOptions?.maxNw ?? 1);

      if (dragMode.current === 'move') {
        const nextX = Math.min(maxX, Math.max(0, ox + dx));
        const nextY = Math.min(maxY, Math.max(0, oy + dy));
        applyRect(nextX, nextY, ow, oh);
        return;
      }

      let newW = ow;
      let newX = ox;
      let newY = oy;

      if (dragMode.current === 'se') {
        newW = Math.min(maxW, Math.max(minW, ow + dx));
      } else if (dragMode.current === 'sw') {
        newW = Math.min(maxW, Math.max(minW, ow - dx));
        newX = ox + (ow - newW);
      } else if (dragMode.current === 'ne') {
        newW = Math.min(maxW, Math.max(minW, ow + dx));
        newY = oy + (oh - newW / ar);
      } else if (dragMode.current === 'nw') {
        newW = Math.min(maxW, Math.max(minW, ow - dx));
        newX = ox + (ow - newW);
        newY = oy + (oh - newW / ar);
      }

      let newH = newW / ar;
      if (newH > containerH) {
        newH = containerH;
        newW = Math.min(maxW, Math.max(minW, newH * ar));
        newH = newW / ar;
      }

      const clampedMaxX = Math.max(0, containerW - newW);
      const clampedMaxY = Math.max(0, containerH - newH);
      newX = Math.min(clampedMaxX, Math.max(0, newX));
      newY = Math.min(clampedMaxY, Math.max(0, newY));

      applyRect(newX, newY, newW, newH);
    },
    [applyRect, pipAspectRatio, frameAspect, rectOptions?.maxNw, rectOptions?.minWidthPx],
  );

  const endDrag = useCallback(() => {
    dragMode.current = null;
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
  }, [onWindowPointerMove]);

  const startDrag = (mode: DragMode, event: React.PointerEvent) => {
    if (!rect) return;
    event.stopPropagation();
    event.preventDefault();
    dragMode.current = mode;
    const box = rootRef.current?.parentElement;
    if (!box) return;
    dragStart.current = {
      px: event.clientX,
      py: event.clientY,
      ox: rect.x,
      oy: rect.y,
      ow: rect.width,
      oh: rect.height,
      maxX: rect.maxX,
      maxY: rect.maxY,
      containerW: box.clientWidth,
      containerH: box.clientHeight,
    };
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  };

  const handleClass =
    'absolute z-10 h-3.5 w-3.5 rounded-full border-2 border-cyan-300 bg-white shadow-md touch-none';

  return (
    <div ref={rootRef} className="lb-live-frame-editor pointer-events-none absolute inset-0 z-[25]">
      {visible && rect ? (
        <div
          className="pointer-events-auto absolute touch-none rounded-2xl border-2 border-dashed border-cyan-400/70 bg-cyan-500/5"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
          }}
          onPointerDown={(event) => startDrag('move', event)}
        >
          <span className="absolute left-1/2 top-1 -translate-x-1/2 text-[9px] font-semibold text-white/75">
            Mover
          </span>
          <button
            type="button"
            className={`${handleClass} -left-1.5 -top-1.5 cursor-nwse-resize`}
            onPointerDown={(event) => startDrag('nw', event)}
            aria-label="Redimensionar esquina superior izquierda"
          />
          <button
            type="button"
            className={`${handleClass} -right-1.5 -top-1.5 cursor-nesw-resize`}
            onPointerDown={(event) => startDrag('ne', event)}
            aria-label="Redimensionar esquina superior derecha"
          />
          <button
            type="button"
            className={`${handleClass} -bottom-1.5 -left-1.5 cursor-nesw-resize`}
            onPointerDown={(event) => startDrag('sw', event)}
            aria-label="Redimensionar esquina inferior izquierda"
          />
          <button
            type="button"
            className={`${handleClass} -bottom-1.5 -right-1.5 cursor-nwse-resize`}
            onPointerDown={(event) => startDrag('se', event)}
            aria-label="Redimensionar esquina inferior derecha"
          />
        </div>
      ) : null}
      <div className="pointer-events-auto absolute bottom-3 left-3 flex flex-wrap gap-2">
        {onToggleVisible && toggleLabel ? (
          <button
            type="button"
            onClick={onToggleVisible}
            className="rounded-lg border border-white/25 bg-black/65 px-2.5 py-1.5 text-[10px] font-semibold text-white backdrop-blur"
          >
            {visible ? toggleLabel.hide : toggleLabel.show}
          </button>
        ) : null}
      </div>
    </div>
  );
}
