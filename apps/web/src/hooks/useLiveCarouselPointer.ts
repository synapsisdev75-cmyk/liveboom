import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { GESTURE_AXIS_LOCK_PX } from '../lib/storyAuthorNav';

/** Arrastre claro; ignora toques accidentales. */
export const LIVE_CAROUSEL_THRESHOLD_PX = 64;

export function isLiveCarouselControlTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'button, a, input, textarea, select, label, [role="button"], [role="link"], [contenteditable="true"], [data-boom-ignore], .lb-live-chat-float, .lb-live-viewer-hud__actions',
    ),
  );
}

type Axis = 'horizontal' | 'vertical' | null;

type Gesture = {
  id: number;
  x: number;
  y: number;
  axis: Axis;
};

/**
 * Pointer unificado (mouse / touch / stylus) para carrusel de LIVE.
 * Solo dispara si el eje horizontal gana y el umbral se cumple.
 */
export function useLiveCarouselPointer(opts: {
  enabled: boolean;
  onNext: () => void;
  onPrev: () => void;
}) {
  const { enabled, onNext, onPrev } = opts;
  const gestureRef = useRef<Gesture | null>(null);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return false;
      if (event.button != null && event.button !== 0) return false;
      if (isLiveCarouselControlTarget(event.target)) {
        gestureRef.current = null;
        return false;
      }
      gestureRef.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        axis: null,
      };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      return true;
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (!enabled || !gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (!gesture.axis) {
        if (absX < GESTURE_AXIS_LOCK_PX && absY < GESTURE_AXIS_LOCK_PX) return;
        gesture.axis = absX > absY ? 'horizontal' : 'vertical';
      }
      if (gesture.axis === 'horizontal') event.preventDefault();
    },
    [enabled],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.id !== event.pointerId) return false;
      gestureRef.current = null;
      if (!enabled) return false;
      if (gesture.axis === 'vertical') return false;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX < LIVE_CAROUSEL_THRESHOLD_PX || absX <= absY) return false;
      if (dx < 0) onNext();
      else onPrev();
      return true;
    },
    [enabled, onNext, onPrev],
  );

  const onPointerCancel = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    gestureRef.current = null;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
