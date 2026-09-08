export type LiveViewportOrientation = 'portrait' | 'landscape';
export type LiveViewportSurface = 'phone' | 'tablet' | 'desktop';

export type LiveViewportState = {
  orientation: LiveViewportOrientation;
  surface: LiveViewportSurface;
};

export type LiveViewportInput = {
  width: number;
  height: number;
  orientation?: LiveViewportOrientation;
  /** `pointer: coarse` — touch primario. */
  coarse: boolean;
  /** `hover: hover` + `pointer: fine` — ratón/trackpad de escritorio. */
  fineHover: boolean;
};

/**
 * Superficie por capacidades reales (viewport + pointer/hover), no por userAgent.
 * Teléfono en landscape no es tablet; tablet en landscape no es desktop.
 */
export function classifyLiveViewport(input: LiveViewportInput): LiveViewportState {
  const width = Math.max(0, input.width);
  const height = Math.max(0, input.height);
  const orientation: LiveViewportOrientation =
    input.orientation || (height >= width ? 'portrait' : 'landscape');
  const shortest = Math.min(width, height);

  let surface: LiveViewportSurface;
  if (shortest < 500 && (input.coarse || width < 768)) {
    surface = 'phone';
  } else if (input.coarse && shortest >= 500) {
    surface = 'tablet';
  } else if (width >= 1024 && input.fineHover) {
    surface = 'desktop';
  } else if (width >= 768) {
    surface = 'tablet';
  } else {
    surface = 'phone';
  }

  return { orientation, surface };
}
