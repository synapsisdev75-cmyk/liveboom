import { Capacitor } from '@capacitor/core';
import { isNativeAndroidApp } from './nativeLiveMedia';
import { classifyLayoutSurface } from '../responsive/viewport';

/**
 * Teléfono o tablet: en LiveBoom ambos son “móvil” para LIVE / Espacio Gaming.
 * No usar solo `phone` — las tablets Android (≥768px, a menudo ≥1024 en landscape)
 * deben recibir la misma política que el móvil.
 */
export function isPhoneOrTabletLayout(): boolean {
  if (typeof window === 'undefined') return true;
  return classifyLayoutSurface(window.innerWidth) !== 'desktop';
}

/** Android nativo Capacitor (teléfono y tablet: misma app). */
export function isAndroidMobileApp(): boolean {
  return isNativeAndroidApp();
}

function isAndroidUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

/**
 * Compartir pantalla clásico (botón Pantalla en el LIVE):
 * solo PC / web de escritorio.
 * En Android (app o WebView, móvil y tablet) se usa Espacio Gaming.
 */
export function canUseClassicScreenShare(): boolean {
  if (isNativeAndroidApp()) return false;
  if (isAndroidUserAgent() && Capacitor.getPlatform() !== 'ios') return false;
  return true;
}

/**
 * Entrada Espacio Gaming (Crear + wizard).
 * App Android nativa / WebView APK: teléfono y tablet por igual.
 */
export function canUseGamingSpace(): boolean {
  return isNativeAndroidApp() || isAndroidAppShell();
}

/**
 * Heurística extra para tablets: a veces Capacitor tarda en reportar native
 * pero el shell ya es el WebView del APK.
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

/** Presentar juego dentro del LIVE iniciado vía Espacio Gaming. */
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
