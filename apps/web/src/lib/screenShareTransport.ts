/**
 * Abstracción de transporte Screen Share.
 * Native = MediaProjection → LiveKit Android (preferido).
 * Legacy = JPEG/canvas → WebView LiveKit (fallback).
 */

export type ScreenShareTransportKind = 'native' | 'legacy';

export interface ScreenShareTransport {
  readonly kind: ScreenShareTransportKind;
  /** Preferido cuando el bridge nativo + LiveKit Android están disponibles. */
  isAvailable(): boolean;
}

export class NativeScreenShareTransport implements ScreenShareTransport {
  readonly kind = 'native' as const;
  isAvailable(): boolean {
    try {
      return (
        typeof window !== 'undefined' &&
        !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } })
          .Capacitor?.isNativePlatform?.() &&
        (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() ===
          'android'
      );
    } catch {
      return false;
    }
  }
}

export class LegacyScreenShareTransport implements ScreenShareTransport {
  readonly kind = 'legacy' as const;
  isAvailable(): boolean {
    return true;
  }
}

/** Preferencia interna (dev puede forzar legacy). */
let preferred: ScreenShareTransportKind | 'auto' = 'auto';

export function setScreenShareTransportPreference(mode: ScreenShareTransportKind | 'auto'): void {
  preferred = mode;
}

export function resolveScreenShareTransport(): ScreenShareTransport {
  const native = new NativeScreenShareTransport();
  const legacy = new LegacyScreenShareTransport();
  if (preferred === 'legacy') return legacy;
  if (preferred === 'native') return native;
  return native.isAvailable() ? native : legacy;
}
