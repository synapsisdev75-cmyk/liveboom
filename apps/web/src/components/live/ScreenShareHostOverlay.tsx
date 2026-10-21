import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  computePipRect,
  type PipNormalizedPos,
} from '../../lib/liveScreenComposer';

type Props = {
  pipVisible: boolean;
  pipPos: PipNormalizedPos;
  onPipPosChange: (pos: PipNormalizedPos) => void;
  onTogglePip: () => void;
};

export function ScreenShareHostOverlay({
  pipVisible,
  pipPos,
  onPipPosChange,
  onTogglePip,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<ReturnType<typeof computePipRect> | null>(null);
  const dragging = useRef(false);
  const dragStart = useRef({ px: 0, py: 0, ox: 0, oy: 0, maxX: 0, maxY: 0 });

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

  const clampDrag = useCallback(
    (x: number, y: number, maxX: number, maxY: number): PipNormalizedPos => ({
      nx: maxX > 0 ? Math.min(1, Math.max(0, x / maxX)) : 0,
      ny: maxY > 0 ? Math.min(1, Math.max(0, y / maxY)) : 0,
    }),
    [],
  );

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[25]">
      {pipVisible && rect ? (
        <div
          className="pointer-events-auto absolute touch-none rounded-2xl border-2 border-dashed border-white/55 bg-transparent shadow-none"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            dragStart.current = {
              px: event.clientX,
              py: event.clientY,
              ox: rect.x,
              oy: rect.y,
              maxX: rect.maxX,
              maxY: rect.maxY,
            };
          }}
          onPointerMove={(event) => {
            if (!dragging.current) return;
            const dx = event.clientX - dragStart.current.px;
            const dy = event.clientY - dragStart.current.py;
            const nextX = Math.min(
              dragStart.current.maxX,
              Math.max(0, dragStart.current.ox + dx),
            );
            const nextY = Math.min(
              dragStart.current.maxY,
              Math.max(0, dragStart.current.oy + dy),
            );
            onPipPosChange(clampDrag(nextX, nextY, dragStart.current.maxX, dragStart.current.maxY));
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
        >
          <span className="absolute inset-x-0 bottom-1 text-center text-[9px] font-semibold text-white/80">
            Arrastra
          </span>
        </div>
      ) : null}
      <div className="pointer-events-auto absolute bottom-3 left-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onTogglePip}
          className="rounded-lg border border-white/25 bg-black/65 px-2.5 py-1.5 text-[10px] font-semibold text-white backdrop-blur"
        >
          {pipVisible ? 'Ocultar cámara' : 'Mostrar cámara'}
        </button>
      </div>
    </div>
  );
}
