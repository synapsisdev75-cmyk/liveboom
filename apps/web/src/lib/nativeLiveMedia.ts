import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

type AvPermissionResult = {
  camera: boolean;
  microphone: boolean;
};

type EssentialPermissionResult = AvPermissionResult & {
  notifications: boolean;
  media: boolean;
  bluetooth: boolean;
  overlay?: boolean;
};

type ScreenCaptureResult = {
  granted: boolean;
  active?: boolean;
  sessionId?: number;
  foregroundReady?: boolean;
};

type ScreenFrameEvent = {
  jpeg: string;
  width: number;
  height: number;
  ts: number;
  sessionId?: number;
};

type LiveMediaPluginApi = {
  prepareWebView: () => Promise<void>;
  checkAvPermissions: () => Promise<AvPermissionResult>;
  requestAvPermissions: () => Promise<AvPermissionResult>;
  checkEssentialPermissions: () => Promise<EssentialPermissionResult>;
  requestEssentialPermissions: () => Promise<EssentialPermissionResult>;
  prepareScreenShare: () => Promise<void>;
  requestScreenCapture: () => Promise<ScreenCaptureResult>;
  startNativeScreenCapture: (opts?: {
    maxFps?: number;
    quality?: number;
    allowOverlayCamera?: boolean;
  }) => Promise<ScreenCaptureResult>;
  stopNativeScreenCapture: () => Promise<ScreenCaptureResult>;
  checkOverlayPermission: () => Promise<{ granted: boolean }>;
  requestOverlayPermission: () => Promise<{ granted: boolean; openedSettings?: boolean }>;
  showScreenShareOverlay: (opts?: {
    allowOverlayCamera?: boolean;
  }) => Promise<{ shown?: boolean; permission?: boolean } | void>;
  hideScreenShareOverlay: () => Promise<void>;
  updateScreenShareChatHud: (opts: {
    lines?: string[];
  }) => Promise<void>;
  showNotification: (opts: {
    title: string;
    body: string;
    channel?: 'calls' | 'messages' | 'friends' | 'general';
    id?: number;
  }) => Promise<{ id: number }>;
  cancelNotification: (opts: { id: number }) => Promise<void>;
  addListener: (
    event:
      | 'screenFrame'
      | 'screenCaptureStopped'
      | 'stopScreenShareRequested'
      | 'screenShareChatSend',
    cb: (data: ScreenFrameEvent | { reason?: string } | { text?: string }) => void,
  ) => Promise<PluginListenerHandle>;
};

const LiveMedia = registerPlugin<LiveMediaPluginApi>('LiveMedia');

let essentialRequestInFlight: Promise<EssentialPermissionResult> | null = null;
let essentialRequestedOnce = false;
let nativeScreenHandles: PluginListenerHandle[] = [];
let nativeScreenStream: MediaStream | null = null;
let stopShareExternalHandler: (() => void) | null = null;

export function isNativeAndroidApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function prepareNativeLiveWebView(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LiveMedia.prepareWebView();
  } catch {
    /* ignore */
  }
}

export async function ensureNativeLiveAvPermissions(): Promise<AvPermissionResult> {
  if (!Capacitor.isNativePlatform()) {
    return { camera: true, microphone: true };
  }
  await prepareNativeLiveWebView();
  try {
    const current = await LiveMedia.checkAvPermissions();
    if (current.camera && current.microphone) return current;
    return await LiveMedia.requestAvPermissions();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || '');
    throw new Error(
      message ||
        'Activa cámara y micrófono en Ajustes → Apps → LiveBoom → Permisos.',
    );
  }
}

export async function ensureNativeEssentialPermissions(
  options: { force?: boolean } = {},
): Promise<EssentialPermissionResult> {
  if (!isNativeAndroidApp()) {
    return {
      camera: true,
      microphone: true,
      notifications: true,
      media: true,
      bluetooth: true,
      overlay: true,
    };
  }
  await prepareNativeLiveWebView();
  if (!options.force && essentialRequestedOnce) {
    try {
      return await LiveMedia.checkEssentialPermissions();
    } catch {
      /* fall through */
    }
  }
  if (essentialRequestInFlight) return essentialRequestInFlight;

  essentialRequestInFlight = (async () => {
    try {
      const current = await LiveMedia.checkEssentialPermissions();
      const needsPrompt =
        options.force ||
        !current.camera ||
        !current.microphone ||
        !current.notifications ||
        !current.media ||
        !current.bluetooth;
      if (!needsPrompt) {
        essentialRequestedOnce = true;
        return current;
      }
      const next = await LiveMedia.requestEssentialPermissions();
      essentialRequestedOnce = true;
      return next;
    } finally {
      essentialRequestInFlight = null;
    }
  })();

  return essentialRequestInFlight;
}

export async function prepareNativeScreenShareService(): Promise<void> {
  if (!isNativeAndroidApp()) return;
  try {
    await LiveMedia.prepareScreenShare();
  } catch {
    /* ignore */
  }
}

export async function ensureOverlayPermission(): Promise<boolean> {
  if (!isNativeAndroidApp()) return true;
  try {
    const cur = await LiveMedia.checkOverlayPermission();
    if (cur.granted) return true;
    await LiveMedia.requestOverlayPermission();
    const again = await LiveMedia.checkOverlayPermission();
    return again.granted;
  } catch {
    return false;
  }
}

/** Solo consulta; NO abre Ajustes (abrir Settings durante el LIVE lo mata). */
export async function hasOverlayPermission(): Promise<boolean> {
  if (!isNativeAndroidApp()) return true;
  try {
    const cur = await LiveMedia.checkOverlayPermission();
    return Boolean(cur.granted);
  } catch {
    return false;
  }
}

export async function showScreenShareOverlayIfAllowed(opts?: {
  allowOverlayCamera?: boolean;
}): Promise<boolean> {
  if (!isNativeAndroidApp()) return false;
  const ok = await hasOverlayPermission();
  if (!ok) return false;
  try {
    const res = await LiveMedia.showScreenShareOverlay({
      allowOverlayCamera: opts?.allowOverlayCamera !== false,
    });
    if (res && typeof res === 'object' && 'shown' in res) {
      return Boolean(res.shown);
    }
    return true;
  } catch {
    return false;
  }
}

/** Escucha “Dejar de compartir” desde overlay / notificación nativa. */
export async function bindNativeStopScreenShare(handler: () => void): Promise<() => void> {
  stopShareExternalHandler = handler;
  if (!isNativeAndroidApp()) return () => undefined;
  const handle = await LiveMedia.addListener('stopScreenShareRequested', () => {
    stopShareExternalHandler?.();
  });
  return async () => {
    stopShareExternalHandler = null;
    try {
      await handle.remove();
    } catch {
      /* ignore */
    }
  };
}

/**
 * Captura nativa MediaProjection → canvas.captureStream (Meet-like en WebView).
 * El canvas DEBE componerse en pantalla: offscreen (-9999 / opacity:0) = track negro en Android WebView.
 */
let nativeScreenCanvasEl: HTMLCanvasElement | null = null;
let nativeScreenPreviewEl: HTMLVideoElement | null = null;
let nativeScreenRaf = 0;
let nativeDrawGen = 0;

function detachNativeScreenCanvas() {
  if (nativeScreenRaf) {
    try {
      cancelAnimationFrame(nativeScreenRaf);
    } catch {
      /* ignore */
    }
    nativeScreenRaf = 0;
  }
  try {
    nativeScreenPreviewEl?.remove();
  } catch {
    /* ignore */
  }
  nativeScreenPreviewEl = null;
  try {
    nativeScreenCanvasEl?.remove();
  } catch {
    /* ignore */
  }
  nativeScreenCanvasEl = null;
}

function attachCompositedCanvas(canvas: HTMLCanvasElement) {
  // Invisible para el ojo, pero en el árbol de composición del WebView (crítico).
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = [
    'position:fixed',
    'right:0',
    'bottom:0',
    'width:4px',
    'height:4px',
    'opacity:0.02',
    'pointer-events:none',
    'z-index:1',
    'transform:translateZ(0)',
  ].join(';');
  document.body.appendChild(canvas);
}

function attachLocalPreview(stream: MediaStream) {
  // Preview local tipo Meet: el host ve lo que está compartiendo.
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.setAttribute('aria-hidden', 'true');
  video.style.cssText = [
    'position:fixed',
    'right:max(8px, env(safe-area-inset-right))',
    'bottom:max(72px, calc(env(safe-area-inset-bottom) + 64px))',
    'width:min(28vw, 120px)',
    'aspect-ratio:9/16',
    'object-fit:contain',
    'border-radius:12px',
    'border:2px solid rgba(34,211,238,0.85)',
    'box-shadow:0 8px 24px rgba(0,0,0,0.45)',
    'background:#000',
    'z-index:60',
    'pointer-events:none',
  ].join(';');
  video.srcObject = stream;
  document.body.appendChild(video);
  void video.play().catch(() => undefined);
  nativeScreenPreviewEl = video;
}

export async function startNativeScreenShareStream(opts?: {
  allowOverlayCamera?: boolean;
}): Promise<MediaStream> {
  if (!isNativeAndroidApp()) {
    throw new Error('Captura nativa solo en Android');
  }
  await stopNativeScreenShareStream();
  await prepareNativeLiveWebView();
  await prepareNativeScreenShareService();
  // Overlay NO bloquea el inicio (Settings rompe el flujo). Se pide después.

  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 640;
  attachCompositedCanvas(canvas);
  nativeScreenCanvasEl = canvas;

  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
  if (!ctx) {
    detachNativeScreenCanvas();
    throw new Error('No se pudo crear canvas de captura');
  }

  // Placeholder distinto de negro puro para detectar frames reales.
  ctx.fillStyle = '#101018';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // fps 0 + requestFrame: más fiable en WebView Android que captureStream(12).
  const stream = canvas.captureStream(0);
  const videoTrack = stream.getVideoTracks()[0] as MediaStreamTrack & {
    requestFrame?: () => void;
  };
  if (!videoTrack) {
    detachNativeScreenCanvas();
    throw new Error('Sin pista de video nativa');
  }
  try {
    videoTrack.contentHint = 'motion';
  } catch {
    /* ignore */
  }

  let boundSessionId = 0;
  let frameCount = 0;
  let realFrameCount = 0;
  let drawPending = false;
  let resolveFirst: (() => void) | null = null;
  let rejectFirst: ((err: Error) => void) | null = null;
  const firstFrame = new Promise<void>((resolve, reject) => {
    resolveFirst = resolve;
    rejectFirst = reject;
    window.setTimeout(() => {
      if (realFrameCount < 1 && frameCount < 1) {
        rejectFirst?.(
          new Error('No llegaron frames de la pantalla. Acepta el permiso e inténtalo de nuevo.'),
        );
        rejectFirst = null;
        resolveFirst = null;
      } else if (resolveFirst) {
        // Hubo frames aunque el muestreo de luminancia falle (pantalla oscura / juego).
        resolveFirst();
        resolveFirst = null;
        rejectFirst = null;
      }
    }, 12000);
  });

  const bumpTrack = () => {
    try {
      videoTrack.requestFrame?.();
    } catch {
      /* ignore */
    }
  };

  // Mantener el MediaStream vivo aunque el compositor pause.
  const pump = () => {
    bumpTrack();
    nativeScreenRaf = requestAnimationFrame(pump);
  };
  nativeScreenRaf = requestAnimationFrame(pump);

  const drawJpeg = async (data: ScreenFrameEvent) => {
    if (!data?.jpeg || drawPending) return;
    if (boundSessionId > 0 && data.sessionId && data.sessionId !== boundSessionId) return;
    const gen = ++nativeDrawGen;
    drawPending = true;
    try {
      const bytes = Uint8Array.from(atob(data.jpeg), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'image/jpeg' });
      const bitmap = await createImageBitmap(blob, {
        resizeWidth: Math.min(360, data.width || 360),
        resizeHeight: Math.min(640, data.height || 640),
        resizeQuality: 'medium',
      });
      if (gen !== nativeDrawGen) {
        bitmap.close();
        return;
      }
      const iw = bitmap.width || data.width || canvas.width;
      const ih = bitmap.height || data.height || canvas.height;
      if (iw > 0 && ih > 0 && (canvas.width !== iw || canvas.height !== ih)) {
        canvas.width = iw;
        canvas.height = ih;
      }
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      bumpTrack();
      frameCount += 1;

      // Muestreo rápido: un JPEG real casi nunca es negro uniforme.
      try {
        const sample = ctx.getImageData(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          1,
          1,
        ).data;
        const lum = (sample[0] ?? 0) + (sample[1] ?? 0) + (sample[2] ?? 0);
        if (lum > 12 || data.jpeg.length > 800) {
          realFrameCount += 1;
        }
      } catch {
        realFrameCount += 1;
      }

      if (realFrameCount >= 1 || frameCount >= 1) {
        resolveFirst?.();
        resolveFirst = null;
        rejectFirst = null;
      }
      if (frameCount === 1 || frameCount % 60 === 0) {
        console.log('[SCREEN SHARE] frame', {
          n: frameCount,
          real: realFrameCount,
          sessionId: data.sessionId || boundSessionId,
          w: canvas.width,
          h: canvas.height,
        });
      }
    } catch {
      /* drop */
    } finally {
      drawPending = false;
    }
  };

  const frameHandle = await LiveMedia.addListener('screenFrame', (raw) => {
    void drawJpeg(raw as ScreenFrameEvent);
  });

  const stopHandle = await LiveMedia.addListener('screenCaptureStopped', (raw) => {
    const ev = raw as { sessionId?: number; reason?: string };
    if (boundSessionId > 0 && ev?.sessionId && ev.sessionId !== boundSessionId) return;
    console.log('[SCREEN SHARE] native stopped', ev?.reason || 'stopped', ev?.sessionId);
    videoTrack.stop();
    stopShareExternalHandler?.();
  });

  nativeScreenHandles = [frameHandle, stopHandle];
  nativeScreenStream = stream;
  (stream as MediaStream & { __lbCanvas?: HTMLCanvasElement }).__lbCanvas = canvas;

  try {
    const started = await LiveMedia.startNativeScreenCapture({
      maxFps: 15,
      quality: 40,
      allowOverlayCamera: opts?.allowOverlayCamera !== false,
    });
    boundSessionId = Number(started?.sessionId || 0);
    console.log('[SCREEN SHARE] native capture started', {
      sessionId: boundSessionId,
      active: started?.active,
      foregroundReady: started?.foregroundReady,
    });
    await firstFrame;
    attachLocalPreview(stream);
    // Nunca abrir Ajustes aquí: pagehide cerraría el LIVE. Solo overlay si ya hay permiso.
    void showScreenShareOverlayIfAllowed();
  } catch (err) {
    await stopNativeScreenShareStream();
    throw err;
  }

  return stream;
}

export async function stopNativeScreenShareStream(): Promise<void> {
  nativeDrawGen += 1;
  for (const handle of nativeScreenHandles) {
    try {
      await handle.remove();
    } catch {
      /* ignore */
    }
  }
  nativeScreenHandles = [];
  try {
    nativeScreenStream?.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
  nativeScreenStream = null;
  detachNativeScreenCanvas();
  if (!isNativeAndroidApp()) return;
  try {
    await LiveMedia.hideScreenShareOverlay();
  } catch {
    /* ignore */
  }
  try {
    await LiveMedia.stopNativeScreenCapture();
  } catch {
    /* ignore */
  }
}

export async function updateScreenShareChatHud(lines: string[]): Promise<void> {
  if (!isNativeAndroidApp()) return;
  try {
    await LiveMedia.updateScreenShareChatHud({ lines: lines.slice(-5) });
  } catch {
    /* ignore */
  }
}

export async function bindScreenShareChatSend(
  handler: (text: string) => void,
): Promise<() => void> {
  if (!isNativeAndroidApp()) return () => undefined;
  const handle = await LiveMedia.addListener('screenShareChatSend', (raw) => {
    const text = String((raw as { text?: string })?.text || '').trim();
    if (text) handler(text);
  });
  return async () => {
    try {
      await handle.remove();
    } catch {
      /* ignore */
    }
  };
}

export async function showNativeSystemNotification(input: {
  title: string;
  body: string;
  channel?: 'calls' | 'messages' | 'friends' | 'general';
  id?: number;
}): Promise<number | null> {
  if (!isNativeAndroidApp()) return null;
  try {
    const res = await LiveMedia.showNotification({
      title: input.title,
      body: input.body,
      channel: input.channel || 'general',
      id: input.id,
    });
    return res.id;
  } catch {
    return null;
  }
}

export async function cancelNativeSystemNotification(id: number): Promise<void> {
  if (!isNativeAndroidApp() || id < 0) return;
  try {
    await LiveMedia.cancelNotification({ id });
  } catch {
    /* ignore */
  }
}

export async function ensureNativeScreenCapturePermission(): Promise<boolean> {
  if (!isNativeAndroidApp()) return true;
  await prepareNativeLiveWebView();
  await prepareNativeScreenShareService();
  return true;
}
