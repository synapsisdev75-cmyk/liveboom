import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

type Options = {
  containerRef: RefObject<HTMLElement | null>;
  onRefresh: () => void;
  enabled?: boolean;
  /** Distancia en px para disparar recarga */
  threshold?: number;
};

/** Pull-to-refresh en contenedor con scroll — solo activo con scrollTop ≈ 0. */
export function usePullToRefresh({
  containerRef,
  onRefresh,
  enabled = true,
  threshold = 72,
}: Options) {
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const pullPxRef = useRef(0);
  const refreshingRef = useRef(false);

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const resetPull = () => {
      pullingRef.current = false;
      pullPxRef.current = 0;
      setPullPx(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (el.scrollTop > 4) return;
      const touch = e.touches[0];
      if (!touch) return;
      startYRef.current = touch.clientY;
      pullingRef.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || refreshingRef.current) return;
      if (el.scrollTop > 4) {
        resetPull();
        return;
      }
      const touch = e.touches[0];
      if (!touch) return;
      const dy = touch.clientY - startYRef.current;
      if (dy <= 0) {
        pullPxRef.current = 0;
        setPullPx(0);
        return;
      }
      const px = Math.min(dy * 0.6, 128);
      pullPxRef.current = px;
      setPullPx(px);
      if (px > 8) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      if (pullPxRef.current >= threshold) {
        setRefreshing(true);
        setPullPx(threshold);
        onRefreshRef.current();
      } else {
        resetPull();
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [containerRef, enabled, threshold]);

  const ready = pullPx >= threshold;

  return { pullPx, refreshing, ready };
}

export function useAppReload() {
  return useCallback(() => {
    window.location.reload();
  }, []);
}
