import { useCallback, useRef, type PointerEvent, type MouseEvent } from 'react';

const DOUBLE_TAP_MS = 320;
const SWIPE_THRESHOLD = 48;

type Options = {
  onBoom: (x: number, y: number) => void;
  disabled?: boolean;
  /** LIVE: cada tap dispara Boom al instante (sin esperar doble tap). */
  singleTap?: boolean;
};

/**
 * Tap en superficie libre. Por defecto doble tap; con `singleTap` un solo tap.
 * Swipe vertical no se interpreta como Boom.
 */
export function useBoomGesture({ onBoom, disabled, singleTap = false }: Options) {
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const tryBoom = useCallback(
    (clientX: number, clientY: number, target: EventTarget | null) => {
      if (disabled) return;
      const el = target as HTMLElement | null;
      if (el?.closest('[data-boom-ignore]')) return;

      if (singleTap) {
        onBoom(clientX, clientY);
        return;
      }

      const now = Date.now();
      const prev = lastTapRef.current;
      if (
        prev &&
        now - prev.t <= DOUBLE_TAP_MS &&
        Math.hypot(clientX - prev.x, clientY - prev.y) < 36
      ) {
        lastTapRef.current = null;
        onBoom(clientX, clientY);
        return;
      }
      lastTapRef.current = { t: now, x: clientX, y: clientY };
    },
    [disabled, onBoom, singleTap],
  );

  const onPointerDown = useCallback((e: PointerEvent) => {
    if (disabled || e.pointerType === 'mouse') return;
    touchStartRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }, [disabled]);

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      if (disabled || e.pointerType === 'mouse') return;
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;
      const dy = e.clientY - start.y;
      const dx = e.clientX - start.x;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absY > SWIPE_THRESHOLD && absY > absX) {
        lastTapRef.current = null;
        return;
      }
      if (absX > SWIPE_THRESHOLD && absX > absY) {
        lastTapRef.current = null;
        return;
      }
      tryBoom(e.clientX, e.clientY, e.target);
    },
    [disabled, tryBoom],
  );

  const onDoubleClick = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      tryBoom(e.clientX, e.clientY, e.target);
    },
    [tryBoom],
  );

  return {
    boomGestureProps: {
      onPointerDown,
      onPointerUp,
      onDoubleClick,
    },
  };
}
