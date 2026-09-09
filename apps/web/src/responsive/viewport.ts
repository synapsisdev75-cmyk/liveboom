/**
 * Fuente única de breakpoints de LiveBoom.
 * Todo se clasifica por CSS px del viewport disponible (no por modelo ni dpr).
 * Los umbrales 768 / 1024 coinciden con Tailwind md/lg y useBreakpoint.
 */

export const VP_MD = 768;
export const VP_LG = 1024;
export const VP_XL = 1280;
export const VP_2XL = 1536;

/** Ancho mínimo de uso previsto. Por debajo: compatibilidad de emergencia. */
export const VP_MIN = 320;

export type ViewportWidthBand =
  | 'micro'
  | 'mobile-xs'
  | 'mobile-s'
  | 'mobile-m'
  | 'mobile-l'
  | 'mobile-xl'
  | 'tablet-compact'
  | 'tablet'
  | 'tablet-expanded'
  | 'laptop-xs'
  | 'laptop-s'
  | 'laptop'
  | 'laptop-m'
  | 'laptop-l'
  | 'desktop'
  | 'qhd'
  | 'ultra';

export type ViewportHeightBand = 'compact' | 'medium' | 'expanded';
export type ViewportOrientation = 'portrait' | 'landscape';

export function classifyWidthBand(width: number): ViewportWidthBand {
  const w = Math.max(0, width);
  if (w < VP_MIN) return 'micro';
  if (w < 360) return 'mobile-xs';
  if (w < 390) return 'mobile-s';
  if (w < 412) return 'mobile-m';
  if (w < 480) return 'mobile-l';
  if (w < 600) return 'mobile-xl';
  if (w < VP_MD) return 'tablet-compact';
  if (w < 840) return 'tablet';
  if (w < VP_LG) return 'tablet-expanded';
  if (w < 1200) return 'laptop-xs';
  if (w < 1366) return 'laptop-s';
  if (w < 1440) return 'laptop';
  if (w < 1600) return 'laptop-m';
  if (w < 1920) return 'laptop-l';
  if (w < 2560) return 'desktop';
  if (w < 3200) return 'qhd';
  return 'ultra';
}

export function classifyHeightBand(height: number): ViewportHeightBand {
  const h = Math.max(0, height);
  if (h < 480) return 'compact';
  if (h < 900) return 'medium';
  return 'expanded';
}

export function classifyOrientation(width: number, height: number): ViewportOrientation {
  return height >= width ? 'portrait' : 'landscape';
}

/** Superficie de layout (misma regla que useBreakpoint). */
export function classifyLayoutSurface(width: number): 'phone' | 'tablet' | 'desktop' {
  if (width >= VP_LG) return 'desktop';
  if (width >= VP_MD) return 'tablet';
  return 'phone';
}
