/**
 * Tokens de layout solo para móvil y tablet (< lg / 1024px).
 * PC usa otros caminos (sidebar, rail aside escritorio); no mezclar aquí.
 *
 * Breakpoints oficiales (Tailwind, `apps/web/tailwind.config.js`):
 * sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536
 * Referencia de producto: 320–374 / 375–430 / 431–767 / 768–1024 / 1024–1440 / 1440+
 */

/** Ancho máximo tratado como móvil/tablet (Tailwind `lg`). */
export const MOBILE_TABLET_MAX_PX = 1023;

/** Explorar — teléfono/tablet en landscape. */
export const exploreLandscape = {
  /** Distancia del rail de acciones al borde izquierdo (acercarlo al 9:16). */
  actionRailRight: 'clamp(4.75rem, 16vw, 8.5rem)',
  /** Reserva horizontal del media para no solapar el rail (lado izquierdo). */
  mediaRightReservePx: 56,
  /** Insets mínimos del stage cuando el chrome de app está oculto. */
  stageInsetTopPx: 4,
  stageInsetBottomPx: 4,
  stageInsetLeftPx: 2,
} as const;

export function isMobileTabletViewport(widthPx: number): boolean {
  return widthPx <= MOBILE_TABLET_MAX_PX;
}
