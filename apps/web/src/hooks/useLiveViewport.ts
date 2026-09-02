import { useEffect, useState } from 'react';

export type LiveViewportOrientation = 'portrait' | 'landscape';
export type LiveViewportSurface = 'phone' | 'tablet' | 'desktop';

export type LiveViewportState = {
  orientation: LiveViewportOrientation;
  surface: LiveViewportSurface;
};

function readLiveViewport(): LiveViewportState {
  if (typeof window === 'undefined') {
    return { orientation: 'portrait', surface: 'desktop' };
  }
  const width = window.innerWidth;
  const orientation: LiveViewportOrientation =
    window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
  const surface: LiveViewportSurface =
    width >= 1024 ? 'desktop' : width >= 768 ? 'tablet' : 'phone';
  return { orientation, surface };
}

/** Orientación y superficie del viewport para adaptar el stage LIVE sin cambiar el formato de transmisión. */
export function useLiveViewport(): LiveViewportState {
  const [viewport, setViewport] = useState<LiveViewportState>(() => readLiveViewport());

  useEffect(() => {
    const update = () => setViewport(readLiveViewport());
    const portraitMq = window.matchMedia('(orientation: portrait)');
    const landscapeMq = window.matchMedia('(orientation: landscape)');
    portraitMq.addEventListener('change', update);
    landscapeMq.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      portraitMq.removeEventListener('change', update);
      landscapeMq.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return viewport;
}
