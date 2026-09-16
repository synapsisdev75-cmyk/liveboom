import { Capacitor } from '@capacitor/core';
import { isNativeAndroidApp } from './nativeLiveMedia';
import { classifyLayoutSurface } from '../responsive/viewport';

/**
 * Teléfono o tablet: en LiveBoom ambos son “móvil” para LIVE.
 */
export function isPhoneOrTabletLayout(): boolean {
  if (typeof window === 'undefined') return true;
  return classifyLayoutSurface(window.innerWidth) !== 'desktop';
}

/** Android nativo Capacitor (teléfono y tablet). */
export function isAndroidMobileApp(): boolean {
  return isNativeAndroidApp();
}

function isAndroidUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

/**
 * Heurística extra para tablets: Capacitor a veces tarda en reportar native.
 */
export function isAndroidAppShell(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isAndroidUserAgent()) return false;
  const ua = navigator.userAgent || '';
  if (/;\s*wv\)/i.test(ua)) return true;
  const host = String(window.location.hostname || '');
  if (host === 'localhost' || host === '127.0.0.1') return true;
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Compartir pantalla **dentro del LIVE** (botón Compartir / Pantalla).
 * - PC/web: getDisplayMedia
 * - Android APK: MediaProjection (misma Room LiveKit)
 * - iOS: no soportado
 */
export function canUseClassicScreenShare(): boolean {
  if (Capacitor.getPlatform() === 'ios') return false;
  if (isNativeAndroidApp() || isAndroidAppShell()) return true;
  if (isAndroidUserAgent()) return false;
  return true;
}

/**
 * Entrada Espacio Gaming (Crear). Independiente del botón Compartir in-LIVE.
 * No modificar Crear en esta tarea; se mantiene por compatibilidad.
 */
export function canUseGamingSpace(): boolean {
  return isNativeAndroidApp() || isAndroidAppShell();
}

/** Presentar vía sesión gamingSpace (legacy). In-LIVE Compartir ya no lo exige. */
export function canPresentGamingInLive(gamingSpace: boolean | undefined): boolean {
  return Boolean(gamingSpace) && (isNativeAndroidApp() || isAndroidAppShell());
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
