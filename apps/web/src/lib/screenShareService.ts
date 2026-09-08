import { Capacitor } from '@capacitor/core';

/** Bridge web / nativo para compartir pantalla en LIVE. No implementa MediaProjection ni ReplayKit en el navegador. */
export type ScreenShareStartResult = {
  stream: MediaStream;
};

export class ScreenShareUnsupportedError extends Error {
  override name = 'ScreenShareUnsupportedError';
  constructor() {
    super('Tu navegador no permite compartir pantalla desde la web.');
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
  return resolveGetDisplayMedia() != null;
}

function logSupport() {
  const hasMediaDevices = Boolean(typeof navigator !== 'undefined' && navigator.mediaDevices);
  const getDisplayType =
    typeof navigator !== 'undefined' ? typeof navigator.mediaDevices?.getDisplayMedia : 'undefined';
  console.log('[SCREEN SHARE SUPPORT]', {
    getDisplayMedia: getDisplayType === 'function',
  });
  console.log('[SCREEN SHARE]', {
    hasMediaDevices,
    hasGetDisplayMedia: getDisplayType === 'function',
    resolved: resolveGetDisplayMedia() != null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    nativePlatform: Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web',
  });
}

function logStream(stream: MediaStream) {
  console.log('[SCREEN SHARE] stream received', {
    videoTracks: stream.getVideoTracks().length,
    audioTracks: stream.getAudioTracks().length,
  });
}

export function screenShareUserMessage(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error || '');
  if (name === 'AbortError') return 'Compartir pantalla cancelado';
  if (name === 'ScreenShareUnsupportedError' || error instanceof ScreenShareUnsupportedError) {
    return 'Tu navegador no permite compartir pantalla desde la web.';
  }
  if (!resolveGetDisplayMedia()) {
    return 'Tu navegador no permite compartir pantalla desde la web.';
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Permiso denegado. Autoriza capturar pantalla en el navegador.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No hay una fuente de pantalla disponible.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'El sistema no pudo leer la pantalla. Cierra otras apps que la estén usando e inténtalo de nuevo.';
  }
  if (name === 'InvalidStateError') {
    return 'Toca Pantalla otra vez para compartir. El navegador necesita el toque directo.';
  }
  if (name === 'TypeError' || name === 'NotSupportedError' || name === 'OverconstrainedError') {
    return 'Este navegador no pudo iniciar la captura de pantalla.';
  }
  return message || 'No se pudo capturar la pantalla';
}

/**
 * Inicia captura de pantalla.
 * Web: getDisplayMedia en el mismo gesto del usuario.
 * Nativo: reservado para MediaProjection (Android) / ReplayKit (iOS) vía plugin Capacitor.
 */
export async function startScreenShare(): Promise<ScreenShareStartResult> {
  logSupport();
  const getDisplay = resolveGetDisplayMedia();
  if (!getDisplay) {
    throw new ScreenShareUnsupportedError();
  }

  console.log('[SCREEN SHARE] request');

  try {
    const stream = await getDisplay({ video: true, audio: true });
    logStream(stream);
    return { stream };
  } catch (error) {
    const name = error instanceof DOMException || error instanceof Error ? error.name : '';
    if (name === 'AbortError') throw error;
    console.warn('[SCREEN SHARE] video+audio failed, retry video only', {
      name,
      message: error instanceof Error ? error.message : String(error),
    });
    try {
      const stream = await getDisplay({ video: true });
      logStream(stream);
      return { stream };
    } catch (retryError) {
      console.error('[SCREEN SHARE]', {
        name: retryError instanceof Error ? retryError.name : 'Error',
        message: retryError instanceof Error ? retryError.message : String(retryError),
      });
      throw retryError;
    }
  }
}
