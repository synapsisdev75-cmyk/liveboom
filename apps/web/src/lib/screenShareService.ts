import { Capacitor } from '@capacitor/core';
import {
  ensureNativeScreenCapturePermission,
  isNativeAndroidApp,
  startNativeScreenShareStream,
  stopNativeScreenShareStream,
} from './nativeLiveMedia';

/** Evita que pagehide/beforeunload cierren el LIVE mientras el diálogo de MediaProjection está abierto. */
let screenShareLiveGuard = false;

export function setScreenShareLiveGuard(active: boolean) {
  screenShareLiveGuard = active;
}

export function isScreenShareLiveGuardActive() {
  return screenShareLiveGuard;
}

/** Bridge web / nativo para compartir pantalla en LIVE (+ PiP cámara en LiveRoom). */
export type ScreenShareStartResult = {
  stream: MediaStream;
  nativeCanvas?: boolean;
};

export class ScreenShareUnsupportedError extends Error {
  override name = 'ScreenShareUnsupportedError';
  constructor(message?: string) {
    super(
      message ||
        (isNativeAndroidApp()
          ? 'No se pudo capturar la pantalla. Acepta el permiso de Android e inténtalo de nuevo.'
          : 'Tu navegador no permite compartir pantalla desde la web.'),
    );
  }
}

type DisplayCaptureFn = (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;

export function resolveGetDisplayMedia(): DisplayCaptureFn | null {
  if (typeof navigator === 'undefined') return null;
  const devices = navigator.mediaDevices;
  if (devices && typeof devices.getDisplayMedia === 'function') {
    return (constraints) => devices.getDisplayMedia(constraints);
  }
  const legacy = (
    navigator as Navigator & { getDisplayMedia?: MediaDevices['getDisplayMedia'] }
  ).getDisplayMedia;
  if (typeof legacy === 'function') {
    return (constraints) => legacy.call(navigator, constraints);
  }
  return null;
}

export function canShareScreenWeb(): boolean {
  return resolveGetDisplayMedia() != null || isNativeAndroidApp();
}

function logSupport() {
  const hasMediaDevices = Boolean(typeof navigator !== 'undefined' && navigator.mediaDevices);
  const getDisplayType =
    typeof navigator !== 'undefined' ? typeof navigator.mediaDevices?.getDisplayMedia : 'undefined';
  console.log('[SCREEN SHARE SUPPORT]', {
    getDisplayMedia: getDisplayType === 'function',
    nativeAndroid: isNativeAndroidApp(),
  });
  console.log('[SCREEN SHARE]', {
    hasMediaDevices,
    hasGetDisplayMedia: getDisplayType === 'function',
    resolved: resolveGetDisplayMedia() != null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    nativePlatform: Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web',
  });
}

function logStream(stream: MediaStream, nativeCanvas = false) {
  console.log('[SCREEN SHARE] stream received', {
    videoTracks: stream.getVideoTracks().length,
    audioTracks: stream.getAudioTracks().length,
    nativeCanvas,
  });
}

export function screenShareUserMessage(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error || '');
  if (name === 'AbortError') return 'Compartir pantalla cancelado';
  if (name === 'ScreenShareUnsupportedError' || error instanceof ScreenShareUnsupportedError) {
    return error instanceof Error ? error.message : 'No se puede compartir pantalla aquí.';
  }
  if (!resolveGetDisplayMedia() && !isNativeAndroidApp()) {
    return 'Tu navegador no permite compartir pantalla desde la web.';
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return isNativeAndroidApp()
      ? 'Permiso denegado. Acepta “Capturar pantalla” en el diálogo de Android.'
      : 'Permiso denegado. Autoriza capturar pantalla en el navegador.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No hay una fuente de pantalla disponible.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'El sistema no pudo leer la pantalla. Cierra otras apps que la estén usando e inténtalo de nuevo.';
  }
  if (/FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION|Media projections require/i.test(message)) {
    return 'No se pudo activar la captura. Cierra el live, abre LiveBoom de nuevo e intenta compartir pantalla.';
  }
  if (name === 'InvalidStateError') {
    return 'Toca Pantalla otra vez para compartir. Se necesita el toque directo.';
  }
  if (name === 'TypeError' || name === 'NotSupportedError' || name === 'OverconstrainedError') {
    return 'No se pudo iniciar la captura de pantalla en este dispositivo.';
  }
  if (/denegad|cancel/i.test(message)) {
    return 'Captura de pantalla denegada o cancelada';
  }
  return message || 'No se pudo capturar la pantalla';
}

async function tryWebDisplayMedia(getDisplay: DisplayCaptureFn): Promise<MediaStream> {
  try {
    const stream = await getDisplay({ video: true, audio: true });
    logStream(stream);
    return stream;
  } catch (error) {
    const name = error instanceof DOMException || error instanceof Error ? error.name : '';
    if (name === 'AbortError') throw error;
    console.warn('[SCREEN SHARE] video+audio failed, retry video only', {
      name,
      message: error instanceof Error ? error.message : String(error),
    });
    const stream = await getDisplay({ video: true });
    logStream(stream);
    return stream;
  }
}

/**
 * Inicia captura de pantalla.
 * Android app: siempre MediaProjection nativo (getDisplayMedia del WebView falla / no envía imagen).
 */
export async function startScreenShare(opts?: {
  preferSingleApp?: boolean;
}): Promise<ScreenShareStartResult> {
  logSupport();

  if (isNativeAndroidApp()) {
    await ensureNativeScreenCapturePermission();
    try {
      console.log('[SCREEN SHARE] request native MediaProjection');
      const stream = await startNativeScreenShareStream({
        preferSingleApp: Boolean(opts?.preferSingleApp),
      });
      logStream(stream, true);
      return { stream, nativeCanvas: true };
    } catch (error) {
      console.error('[SCREEN SHARE] native failed', error);
      // Último recurso: intentar getDisplayMedia si existe.
      const getDisplay = resolveGetDisplayMedia();
      if (getDisplay) {
        try {
          const stream = await tryWebDisplayMedia(getDisplay);
          return { stream, nativeCanvas: false };
        } catch (webErr) {
          const name = webErr instanceof DOMException || webErr instanceof Error ? webErr.name : '';
          if (name === 'AbortError') throw webErr;
        }
      }
      throw error instanceof Error ? error : new ScreenShareUnsupportedError();
    }
  }

  const getDisplay = resolveGetDisplayMedia();
  if (!getDisplay) {
    throw new ScreenShareUnsupportedError();
  }
  console.log('[SCREEN SHARE] request');
  try {
    const stream = await tryWebDisplayMedia(getDisplay);
    return { stream };
  } catch (retryError) {
    console.error('[SCREEN SHARE]', {
      name: retryError instanceof Error ? retryError.name : 'Error',
      message: retryError instanceof Error ? retryError.message : String(retryError),
    });
    throw retryError;
  }
}

/** Detiene captura nativa si estaba activa (no afecta tracks web del navegador). */
export async function stopNativeScreenShareIfAny(): Promise<void> {
  if (!isNativeAndroidApp()) return;
  await stopNativeScreenShareStream();
}
