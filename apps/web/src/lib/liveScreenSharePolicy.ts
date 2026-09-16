import { isNativeAndroidApp } from './nativeLiveMedia';

/**
 * Compartir pantalla clásico (botón Pantalla en el LIVE):
 * solo escritorio / web. En Android nativo se usa Espacio Gaming.
 */
export function canUseClassicScreenShare(): boolean {
  return !isNativeAndroidApp();
}

/** Entrada Espacio Gaming (Crear + studio móvil). */
export function canUseGamingSpace(): boolean {
  return isNativeAndroidApp();
}

/** Presentar juego dentro del LIVE iniciado vía Espacio Gaming. */
export function canPresentGamingInLive(gamingSpace: boolean | undefined): boolean {
  return Boolean(gamingSpace) && isNativeAndroidApp();
}

const GAMING_SPACE_KEY = 'liveboom.gamingSpace.v1';

export function rememberGamingSpaceSession(active: boolean): void {
  try {
    if (active) sessionStorage.setItem(GAMING_SPACE_KEY, '1');
    else sessionStorage.removeItem(GAMING_SPACE_KEY);
  } catch {
    /* ignore */
  }
}

export function isGamingSpaceSessionActive(launchFlag?: boolean): boolean {
  if (launchFlag) return true;
  try {
    return sessionStorage.getItem(GAMING_SPACE_KEY) === '1';
  } catch {
    return false;
  }
}
