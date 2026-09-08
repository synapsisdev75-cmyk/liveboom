import { useEffect, useState } from 'react';
import {
  classifyLiveViewport,
  type LiveViewportOrientation,
  type LiveViewportState,
  type LiveViewportSurface,
} from '../lib/liveViewport';

export type { LiveViewportOrientation, LiveViewportState, LiveViewportSurface };

function readLiveViewport(): LiveViewportState {
  if (typeof window === 'undefined') {
    return { orientation: 'portrait', surface: 'desktop' };
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  const orientation: LiveViewportOrientation = window.matchMedia('(orientation: portrait)')
    .matches
    ? 'portrait'
    : 'landscape';
  return classifyLiveViewport({
    width,
    height,
    orientation,
    coarse: window.matchMedia('(pointer: coarse)').matches,
    fineHover: window.matchMedia('(hover: hover) and (pointer: fine)').matches,
  });
}

/** Orientación y superficie del viewport para adaptar el stage LIVE sin cambiar el formato de transmisión. */
export function useLiveViewport(): LiveViewportState {
  const [viewport, setViewport] = useState<LiveViewportState>(() => readLiveViewport());

  useEffect(() => {
    const update = () => setViewport(readLiveViewport());
    const portraitMq = window.matchMedia('(orientation: portrait)');
    const landscapeMq = window.matchMedia('(orientation: landscape)');
    const coarseMq = window.matchMedia('(pointer: coarse)');
    portraitMq.addEventListener('change', update);
    landscapeMq.addEventListener('change', update);
    coarseMq.addEventListener('change', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    const visual = window.visualViewport;
    visual?.addEventListener('resize', update);
    return () => {
      portraitMq.removeEventListener('change', update);
      landscapeMq.removeEventListener('change', update);
      coarseMq.removeEventListener('change', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      visual?.removeEventListener('resize', update);
    };
  }, []);

  return viewport;
}
