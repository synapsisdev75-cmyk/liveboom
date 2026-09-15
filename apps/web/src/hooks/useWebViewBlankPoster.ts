import { Capacitor } from '@capacitor/core';
import { useCallback, useState } from 'react';

/** GIF 1x1 transparente (sobre fondo negro = nada visible). */
export const WEBVIEW_BLANK_VIDEO_POSTER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

let nativeCache: boolean | null = null;

/** APK/AAB (Capacitor). En navegador (PWA / web) siempre false. */
export function isNativeWebView(): boolean {
  if (nativeCache === null) {
    try {
      nativeCache = Capacitor.isNativePlatform();
    } catch {
      nativeCache = false;
    }
  }
  return nativeCache;
}

/**
 * Android WebView pinta un poster por defecto del sistema (fondo gris + círculo con play)
 * en cualquier `<video>` sin atributo `poster` hasta que decodifica el primer frame. En el
 * navegador esto no ocurre, así que:
 *
 * - En nativo devuelve un poster transparente mientras `src` no haya emitido `loadeddata`.
 * - Tras el primer frame (`markFirstFrame`) devuelve `undefined` → mismo comportamiento que web.
 * - En web devuelve siempre `undefined` (sin cambios).
 *
 * Si el consumidor ya tiene poster real, debe preferirlo: `poster={real || blankPoster}`.
 */
export function useWebViewBlankPoster(src: string | null | undefined) {
  const [readySrc, setReadySrc] = useState<string | null>(null);
  const native = isNativeWebView();
  const blankPoster = native && src && readySrc !== src ? WEBVIEW_BLANK_VIDEO_POSTER : undefined;
  const markFirstFrame = useCallback(() => {
    if (!native || !src) return;
    setReadySrc(src);
  }, [native, src]);
  return { blankPoster, markFirstFrame };
}
