/** Un toque en el logo o en Inicio: volver a la pantalla principal, arriba. */
export const GO_HOME_EVENT = 'liveboom:go-home';

export function requestGoHome() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(GO_HOME_EVENT));
}
