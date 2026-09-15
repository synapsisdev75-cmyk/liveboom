import { Capacitor } from '@capacitor/core';
import { TRANSPARENT_VIDEO_POSTER } from './transparentVideoPoster';

export { TRANSPARENT_VIDEO_POSTER, resolveVideoPoster } from './transparentVideoPoster';

export function isCapacitorAndroid() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

function applyNativeVideoDefaults(video: HTMLVideoElement) {
  if (!video.getAttribute('poster')) {
    video.setAttribute('poster', TRANSPARENT_VIDEO_POSTER);
  }
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  if (!video.hasAttribute('controls')) {
    video.controls = false;
  }
}

/**
 * APK/AAB (Capacitor Android): el WebView pinta un play gris gigante en todo
 * `<video>` sin poster. CSS no lo oculta; hay que forzar poster + overlay nativo.
 */
export function installAndroidWebViewVideoPosterFix() {
  if (typeof document === 'undefined' || !isCapacitorAndroid()) return;
  if (document.documentElement.dataset.lbNative === 'android') return;
  document.documentElement.dataset.lbNative = 'android';

  const origCreate = document.createElement;
  document.createElement = function (this: Document, tagName: string, options?: ElementCreationOptions) {
    const el = origCreate.call(this, tagName, options);
    if (String(tagName).toLowerCase() === 'video') {
      applyNativeVideoDefaults(el as HTMLVideoElement);
    }
    return el;
  } as typeof document.createElement;

  const scan = (root: ParentNode) => {
    if (root instanceof HTMLVideoElement) applyNativeVideoDefaults(root);
    if ('querySelectorAll' in root) {
      root.querySelectorAll('video').forEach((node) => applyNativeVideoDefaults(node));
    }
  };

  scan(document);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'childList') {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLVideoElement) applyNativeVideoDefaults(node);
          else if (node instanceof Element) scan(node);
        });
      } else if (record.type === 'attributes' && record.target instanceof HTMLVideoElement) {
        applyNativeVideoDefaults(record.target);
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['poster'],
  });
}
