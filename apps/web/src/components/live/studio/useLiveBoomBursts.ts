import { useCallback, useRef, useState } from 'react';

export type BoomBurst = {
  id: string;
  /** Desplazamiento lateral en px dentro del riel derecho */
  lateralPx: number;
  /** Retraso mínimo de animación para taps rápidos */
  delayMs: number;
  rot: number;
};

type Options = {
  maxVisible?: number;
};

/** Booms pequeños en el riel derecho del LIVE — un tap = una subida vertical. */
export function useLiveBoomBursts({ maxVisible = 20 }: Options = {}) {
  const [bursts, setBursts] = useState<BoomBurst[]>([]);
  const laneRef = useRef(0);

  const spawnBoom = useCallback(
    (container: HTMLElement | null) => {
      if (!container) return;
      laneRef.current = (laneRef.current + 1) % 5;
      const lateralPx = (laneRef.current - 2) * 14 + (Math.random() - 0.5) * 18;
      const id = `boom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const rot = (Math.random() - 0.5) * 16;

      setBursts((prev) => [...prev.slice(-(maxVisible - 1)), { id, lateralPx, delayMs: 0, rot }]);
      window.setTimeout(() => {
        setBursts((prev) => prev.filter((b) => b.id !== id));
      }, 1200);
    },
    [maxVisible],
  );

  return { bursts, spawnBoom };
}
