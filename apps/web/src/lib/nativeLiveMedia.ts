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
  audioCapturing?: boolean;
  transport?: 'native' | 'legacy';
};

type ScreenFrameEvent = {
  jpeg: string;
  width: number;
  height: number;
  ts: number;
  sessionId?: number;
};

type ScreenAudioPcmEvent = {
  pcm: string;
  sampleRate: number;
  channels: number;
  sessionId?: number;
};

type LiveMediaPluginApi = {
  prepareWebView: () => Promise<void>;
  checkAvPermissions: () => Promise<AvPermissionResult>;
  requestAvPermissions: () => Promise<AvPermissionResult>;
  checkMicrophonePermission: () => Promise<{ microphone: boolean }>;
  requestMicrophonePermission: () => Promise<{ microphone: boolean }>;
  checkEssentialPermissions: () => Promise<EssentialPermissionResult>;
  requestEssentialPermissions: () => Promise<EssentialPermissionResult>;
  prepareScreenShare: () => Promise<void>;
  requestScreenCapture: () => Promise<ScreenCaptureResult>;
  startNativeScreenCapture: (opts?: {
    maxFps?: number;
    quality?: number;
    allowOverlayCamera?: boolean;
    preferSingleApp?: boolean;
  }) => Promise<ScreenCaptureResult>;
  startNativeLiveKitScreenShare: (opts: {
    serverUrl: string;
    token: string;
    deviceAudioEnabled?: boolean;
  }) => Promise<ScreenCaptureResult>;
  stopNativeLiveKitScreenShare: () => Promise<ScreenCaptureResult>;
  setNativeLiveKitDeviceAudioEnabled: (opts: { enabled: boolean }) => Promise<void>;
  setNativeLiveKitGameAudioGain: (opts: { gain: number }) => Promise<void>;
  stopNativeScreenCapture: () => Promise<ScreenCaptureResult>;
  checkOverlayPermission: () => Promise<{ granted: boolean }>;
  requestOverlayPermission: () => Promise<{ granted: boolean; openedSettings?: boolean }>;
  showScreenShareOverlay: (opts?: {
    allowOverlayCamera?: boolean;
  }) => Promise<{ shown?: boolean; permission?: boolean } | void>;
  hideScreenShareOverlay: () => Promise<void>;
  setPresentationOverlaysVisible: (opts: { visible: boolean }) => Promise<void>;
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
  updatePresentationHudState: (opts: {
    micMuted?: boolean;
    gameMuted?: boolean;
  }) => Promise<void>;
  addListener: (
    event:
      | 'screenFrame'
      | 'cameraFrame'
      | 'screenAudioPcm'
      | 'micPcm'
      | 'screenCaptureStopped'
      | 'stopScreenShareRequested'
      | 'screenShareChatSend'
      | 'presentationHudAction'
      | 'screenShareAudioLimited'
      | 'screenShareOverlaysVisible',
    cb: (
      data:
        | ScreenFrameEvent
        | ScreenAudioPcmEvent
        | { reason?: string }
        | { text?: string }
        | { action?: string }
        | { message?: string }
        | { visible?: boolean },
    ) => void,
  ) => Promise<PluginListenerHandle>;
};

const LiveMedia = registerPlugin<LiveMediaPluginApi>('LiveMedia');

let essentialRequestInFlight: Promise<EssentialPermissionResult> | null = null;
let essentialRequestedOnce = false;
let nativeScreenHandles: PluginListenerHandle[] = [];
let nativeScreenStream: MediaStream | null = null;
let nativeCameraHandles: PluginListenerHandle[] = [];
let nativeCameraStream: MediaStream | null = null;
let nativeCameraRaf = 0;
let nativeCameraDrawGen = 0;
let nativeAudioHandle: PluginListenerHandle | null = null;
let nativeAudioStream: MediaStream | null = null;
let nativeAudioCtx: AudioContext | null = null;
let nativeAudioProcessor: ScriptProcessorNode | null = null;
let nativeMicHandle: PluginListenerHandle | null = null;
let nativeMicStream: MediaStream | null = null;
let nativeMicCtx: AudioContext | null = null;
let nativeMicProcessor: ScriptProcessorNode | null = null;
let stopShareExternalHandler: (() => void) | null = null;
let lastNativeAudioCapturing = false;
let keepLiveTracksHooked = false;
/** Ruta activa de Screen Share: native (LiveKit Android) | legacy (JPEG/canvas). */
let activeScreenShareTransport: 'native' | 'legacy' | null = null;
/** Preferencia usuario: ganancia juego (0–1). El ducking no la pisa. */
let userGameAudioGain = 0.42;
/** Preferencia usuario: ganancia mic (0–1). */
let userMicGain = 1;
let gameAudioMuted = false;
let micAudioMuted = false;
let voiceOpenUntil = 0;
let lastMicLevel = 0;
let lastGameLevel = 0;
let micPcmPackets = 0;
let gamePcmPackets = 0;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function effectiveGameAudioGain(): number {
  if (gameAudioMuted) return 0;
  const now = performance.now();
  const ducked = userGameAudioGain * 0.3; // ~30% mientras habla (prioridad de voz)
  if (now < voiceOpenUntil) return ducked;
  // Recuperación progresiva (~280 ms) sin corte brusco.
  const releaseMs = 280;
  if (voiceOpenUntil > 0 && now - voiceOpenUntil < releaseMs) {
    const t = (now - voiceOpenUntil) / releaseMs;
    return ducked + (userGameAudioGain - ducked) * t;
  }
  return userGameAudioGain;
}

function effectiveMicGain(): number {
  if (micAudioMuted) return 0;
  return userMicGain;
}

export type NativeAudioMixerState = {
  micVolume: number;
  gameVolume: number;
  micMuted: boolean;
  gameMuted: boolean;
  micLevel: number;
  gameLevel: number;
};

export function getNativeAudioMixerState(): NativeAudioMixerState {
  return {
    micVolume: userMicGain,
    gameVolume: userGameAudioGain,
    micMuted: micAudioMuted,
    gameMuted: gameAudioMuted,
    micLevel: lastMicLevel,
    gameLevel: lastGameLevel,
  };
}

/** Espera PCM del mic FGS (paquetes). Sin paquetes = rama muerta → fallback WebRTC. */
export async function waitForNativeMicSignal(timeoutMs = 2000): Promise<boolean> {
  const startPackets = micPcmPackets;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (micPcmPackets > startPackets + 2) return true;
    await new Promise((r) => window.setTimeout(r, 120));
  }
  return micPcmPackets > startPackets + 2;
}

/** Espera PCM de audio de juego. Sin paquetes = no publicar pista vacía. */
export async function waitForNativeGameAudioSignal(timeoutMs = 2500): Promise<boolean> {
  const startPackets = gamePcmPackets;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (gamePcmPackets > startPackets + 2) return true;
    await new Promise((r) => window.setTimeout(r, 120));
  }
  return gamePcmPackets > startPackets + 2;
}

export async function bindScreenShareOverlaysVisible(
  handler: (visible: boolean) => void,
): Promise<() => void> {
  if (!isNativeAndroidApp()) return () => undefined;
  const handle = await LiveMedia.addListener('screenShareOverlaysVisible', (raw) => {
    const visible = Boolean((raw as { visible?: boolean })?.visible);
    handler(visible);
  });
  return () => {
    void handle.remove();
  };
}

export function setNativeMicVolume(value: number): void {
  userMicGain = clamp01(value);
}

export function setNativeGameVolume(value: number): void {
  userGameAudioGain = clamp01(value);
}

export function setNativeMicMuted(muted: boolean): void {
  micAudioMuted = Boolean(muted);
  void syncPresentationHudState();
}

export function setNativeGameAudioMuted(muted: boolean): void {
  gameAudioMuted = Boolean(muted);
  void syncPresentationHudState();
}

export function toggleNativeMicMuted(): boolean {
  micAudioMuted = !micAudioMuted;
  void syncPresentationHudState();
  return micAudioMuted;
}

export function toggleNativeGameAudioMuted(): boolean {
  gameAudioMuted = !gameAudioMuted;
  void syncPresentationHudState();
  return gameAudioMuted;
}

async function syncPresentationHudState(): Promise<void> {
  if (!isNativeAndroidApp()) return;
  try {
    await LiveMedia.updatePresentationHudState({
      micMuted: micAudioMuted,
      gameMuted: gameAudioMuted,
    });
  } catch {
    /* ignore */
  }
}

function ensureKeepLiveTracksHook() {
  if (keepLiveTracksHooked || typeof window === 'undefined') return;
  keepLiveTracksHooked = true;
  (window as unknown as { __lbKeepLiveTracks?: () => void }).__lbKeepLiveTracks = () => {
    try {
      nativeScreenStream?.getVideoTracks().forEach((t) => {
        (t as MediaStreamTrack & { requestFrame?: () => void }).requestFrame?.();
      });
      nativeCameraStream?.getVideoTracks().forEach((t) => {
        (t as MediaStreamTrack & { requestFrame?: () => void }).requestFrame?.();
      });
    } catch {
      /* ignore */
    }
  };
}

export function wasNativeScreenAudioCapturing(): boolean {
  return lastNativeAudioCapturing;
}

export function isNativeAndroidApp(): boolean {
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      return true;
    }
  } catch {
    /* ignore */
  }
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (!/Android/i.test(ua)) return false;
  // WebView de APK (teléfono y tablet): UA suele incluir "; wv)".
  if (/;\s*wv\)/i.test(ua)) return true;
  const host = String(window.location.hostname || '');
  if (host === 'localhost' || host === '127.0.0.1') return true;
  try {
    const cap = (
      window as unknown as {
        Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
      }
    ).Capacitor;
    if (cap?.isNativePlatform?.() && cap?.getPlatform?.() === 'android') return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Capacitor iOS (o futuro shell nativo). Safari iOS sigue siendo web compartida. */
export function isNativeIosApp(): boolean {
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') return true;
  } catch {
    /* ignore */
  }
  if (typeof window === 'undefined') return false;
  try {
    const cap = (
      window as unknown as {
        Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
      }
    ).Capacitor;
    if (cap?.isNativePlatform?.() && cap?.getPlatform?.() === 'ios') return true;
  } catch {
    /* ignore */
  }
  return false;
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

/**
 * Permisos exclusivos de Screen Share / Mobile Gaming.
 * NUNCA solicita CAMERA. Solo micrófono (si hace falta) + prep FGS/WebView.
 */
export async function ensureNativeScreenSharePermissions(opts?: {
  microphoneEnabled?: boolean;
}): Promise<{ microphone: boolean }> {
  if (!isNativeAndroidApp()) {
    return { microphone: true };
  }
  await prepareNativeLiveWebView();
  await prepareNativeScreenShareService();
  if (opts?.microphoneEnabled === false) {
    return { microphone: true };
  }
  try {
    const current = await LiveMedia.checkMicrophonePermission();
    if (current.microphone) return current;
    return await LiveMedia.requestMicrophonePermission();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || '');
    throw new Error(
      message ||
        'Activa el micrófono en Ajustes → Apps → LiveBoom → Permisos para presentar con audio.',
    );
  }
}

/**
 * Permisos al abrir la app (notificaciones, galería, bluetooth).
 * NO pide cámara ni micrófono: eso solo al transmitir, Sala Boom o llamadas.
 */
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
      // Viewer / uso normal: no exigir ni solicitar CAMERA / RECORD_AUDIO.
      const needsPrompt =
        options.force ||
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
  if (!ok) {
    console.warn('[SCREEN SHARE] sin permiso SYSTEM_ALERT_WINDOW → chat flotante no puede mostrarse');
    return false;
  }
  try {
    // Por defecto sin cámara PiP durante presentación de juego.
    const res = await LiveMedia.showScreenShareOverlay({
      allowOverlayCamera: opts?.allowOverlayCamera === true,
    });
    if (res && typeof res === 'object' && 'shown' in res) {
      return Boolean(res.shown);
    }
    return true;
  } catch {
    return false;
  }
}

/** Meet-like: overlays solo fuera de LiveBoom; dentro de la app se ocultan. */
export async function setNativePresentationOverlaysVisible(visible: boolean): Promise<void> {
  if (!isNativeAndroidApp()) return;
  try {
    await LiveMedia.setPresentationOverlaysVisible({ visible });
  } catch {
    /* ignore */
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

export function getActiveScreenShareTransport(): 'native' | 'legacy' | null {
  return activeScreenShareTransport;
}

/**
 * Ruta preferente: MediaProjection → LiveKit Android (sin JPEG/canvas).
 * El participante técnico publica screen en la misma sala.
 */
export async function startNativeLiveKitScreenShare(opts: {
  serverUrl: string;
  token: string;
  deviceAudioEnabled?: boolean;
}): Promise<{ transport: 'native'; sessionId?: number }> {
  if (!isNativeAndroidApp()) {
    throw new Error('Screen Share nativo solo en Android');
  }
  ensureKeepLiveTracksHook();
  await prepareNativeLiveWebView();
  await prepareNativeScreenShareService();
  // No arrancar JPEG legacy en paralelo.
  if (activeScreenShareTransport === 'legacy') {
    await stopNativeScreenShareStream();
  }
  const started = await LiveMedia.startNativeLiveKitScreenShare({
    serverUrl: opts.serverUrl,
    token: opts.token,
    deviceAudioEnabled: opts.deviceAudioEnabled !== false,
  });
  activeScreenShareTransport = 'native';
  void showScreenShareOverlayIfAllowed({ allowOverlayCamera: false });
  return {
    transport: 'native',
    sessionId: Number(started?.sessionId || 0) || undefined,
  };
}

export async function stopNativeLiveKitScreenShare(): Promise<void> {
  if (!isNativeAndroidApp()) return;
  try {
    await LiveMedia.stopNativeLiveKitScreenShare();
  } catch {
    /* ignore */
  }
  if (activeScreenShareTransport === 'native') {
    activeScreenShareTransport = null;
  }
  try {
    await LiveMedia.hideScreenShareOverlay();
  } catch {
    /* ignore */
  }
}

export async function setNativeLiveKitDeviceAudioEnabled(enabled: boolean): Promise<void> {
  if (!isNativeAndroidApp()) return;
  try {
    await LiveMedia.setNativeLiveKitDeviceAudioEnabled({ enabled: Boolean(enabled) });
  } catch {
    /* ignore */
  }
}

export async function bindScreenShareAudioLimited(
  handler: (message: string) => void,
): Promise<() => void> {
  if (!isNativeAndroidApp()) return () => undefined;
  const handle = await LiveMedia.addListener('screenShareAudioLimited', (raw) => {
    const msg = String((raw as { message?: string })?.message || '').trim();
    if (msg) handler(msg);
  });
  return () => {
    void handle.remove();
  };
}

export async function startNativeScreenShareStream(opts?: {
  allowOverlayCamera?: boolean;
  preferSingleApp?: boolean;
}): Promise<MediaStream> {
  if (!isNativeAndroidApp()) {
    throw new Error('Captura nativa solo en Android');
  }
  ensureKeepLiveTracksHook();
  await stopNativeScreenShareStream();
  await prepareNativeLiveWebView();
  await prepareNativeScreenShareService();
  // Overlay NO bloquea el inicio (Settings rompe el flujo). Se pide después.

  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 1280;
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
  let firstSettled = false;
  const firstFrame = new Promise<void>((resolve) => {
    resolveFirst = () => {
      if (firstSettled) return;
      firstSettled = true;
      resolve();
    };
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
      const srcW = Math.max(2, data.width || 720);
      const srcH = Math.max(2, data.height || 1280);
      let tw = srcW;
      let th = srcH;
      const longEdge = Math.max(tw, th);
      if (longEdge > 1280) {
        const s = 1280 / longEdge;
        tw = Math.max(2, Math.round(tw * s));
        th = Math.max(2, Math.round(th * s));
      }
      const bitmap = await createImageBitmap(blob, {
        resizeWidth: tw,
        resizeHeight: th,
        resizeQuality: 'high',
      });
      if (gen !== nativeDrawGen) {
        bitmap.close();
        return;
      }
      const iw = bitmap.width || tw;
      const ih = bitmap.height || th;
      if (iw > 0 && ih > 0 && (canvas.width !== iw || canvas.height !== ih)) {
        canvas.width = iw;
        canvas.height = ih;
      }
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      bumpTrack();
      frameCount += 1;
      realFrameCount += 1;

      if (frameCount >= 1) {
        resolveFirst?.();
        resolveFirst = null;
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
      maxFps: 30,
      quality: 72,
      allowOverlayCamera: false,
      preferSingleApp: Boolean(opts?.preferSingleApp),
    });
    boundSessionId = Number(started?.sessionId || 0);
    console.log('[SCREEN SHARE] legacy capture started', {
      sessionId: boundSessionId,
      active: started?.active,
      foregroundReady: started?.foregroundReady,
      audioCapturing: started?.audioCapturing,
    });
    lastNativeAudioCapturing = Boolean(started?.audioCapturing);
    activeScreenShareTransport = 'legacy';
    // Al elegir una app (juego), los frames llegan cuando esa app está al frente.
    // No tumbar la captura por timeout: publicar ya y seguir recibiendo frames.
    await Promise.race([
      firstFrame,
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          console.log('[SCREEN SHARE] firstFrame soft-timeout; publishing anyway');
          resolveFirst?.();
          resolveFirst = null;
          resolve();
        }, 1200);
      }),
    ]);
    // En Android no adjuntar preview DOM (ensucia el LIVE al volver a la app).
    if (!isNativeAndroidApp()) {
      attachLocalPreview(stream);
    }
    void showScreenShareOverlayIfAllowed({
      allowOverlayCamera: false,
    });
  } catch (err) {
    await stopNativeScreenShareStream();
    throw err;
  }

  return stream;
}

/** Cámara del globo nativo → MediaStream para publicar a LiveKit (espectadores). */
export async function startNativeOverlayCameraStream(): Promise<MediaStream> {
  if (!isNativeAndroidApp()) {
    throw new Error('Cámara nativa solo en Android');
  }
  await stopNativeOverlayCameraStream();

  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 320;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:1';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    canvas.remove();
    throw new Error('Sin canvas de cámara');
  }
  ctx.fillStyle = '#101018';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const stream = canvas.captureStream(0);
  const videoTrack = stream.getVideoTracks()[0] as MediaStreamTrack & {
    requestFrame?: () => void;
  };
  if (!videoTrack) {
    canvas.remove();
    throw new Error('Sin pista de cámara nativa');
  }

  let drawPending = false;
  const bump = () => {
    try {
      videoTrack.requestFrame?.();
    } catch {
      /* ignore */
    }
  };
  const pump = () => {
    bump();
    nativeCameraRaf = requestAnimationFrame(pump);
  };
  nativeCameraRaf = requestAnimationFrame(pump);

  const frameHandle = await LiveMedia.addListener('cameraFrame', (raw) => {
    const data = raw as ScreenFrameEvent;
    if (!data?.jpeg || drawPending) return;
    const gen = ++nativeCameraDrawGen;
    drawPending = true;
    void (async () => {
      try {
        const bytes = Uint8Array.from(atob(data.jpeg), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        const bitmap = await createImageBitmap(blob, {
          resizeWidth: 320,
          resizeHeight: 320,
          resizeQuality: 'high',
        });
        if (gen !== nativeCameraDrawGen) {
          bitmap.close();
          return;
        }
        if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
        }
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        bump();
      } catch {
        /* drop */
      } finally {
        drawPending = false;
      }
    })();
  });

  nativeCameraHandles = [frameHandle];
  nativeCameraStream = stream;
  (stream as MediaStream & { __lbCamCanvas?: HTMLCanvasElement }).__lbCamCanvas = canvas;
  return stream;
}

export async function stopNativeOverlayCameraStream(): Promise<void> {
  nativeCameraDrawGen += 1;
  if (nativeCameraRaf) {
    try {
      cancelAnimationFrame(nativeCameraRaf);
    } catch {
      /* ignore */
    }
    nativeCameraRaf = 0;
  }
  for (const handle of nativeCameraHandles) {
    try {
      await handle.remove();
    } catch {
      /* ignore */
    }
  }
  nativeCameraHandles = [];
  try {
    const canvas = (nativeCameraStream as MediaStream & { __lbCamCanvas?: HTMLCanvasElement } | null)
      ?.__lbCamCanvas;
    canvas?.remove();
  } catch {
    /* ignore */
  }
  try {
    nativeCameraStream?.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
  nativeCameraStream = null;
}

/**
 * Audio de juego/presentación (AudioPlaybackCapture) → MediaStream.
 * Devuelve null si el entorno no está capturando audio (juego bloquea o API no disponible).
 */
export async function startNativeScreenAudioStream(): Promise<MediaStream | null> {
  if (!isNativeAndroidApp()) return null;
  await stopNativeScreenAudioStream();

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  const ctx = new AudioCtx({ sampleRate: 44100 });
  try {
    await ctx.resume();
  } catch {
    /* ignore */
  }
  const dest = ctx.createMediaStreamDestination();
  const queue: Float32Array[] = [];
  let queueSamples = 0;
  const maxQueue = 44100; // ~1s

  const processor = ctx.createScriptProcessor(2048, 1, 1);
  processor.onaudioprocess = (ev) => {
    const out = ev.outputBuffer.getChannelData(0);
    let offset = 0;
    let energy = 0;
    const gain = effectiveGameAudioGain();
    while (offset < out.length) {
      const next = queue[0];
      if (!next) {
        out.fill(0, offset);
        break;
      }
      const need = out.length - offset;
      if (next.length <= need) {
        for (let i = 0; i < next.length; i++) {
          const sample = (next[i] ?? 0) * gain;
          out[offset + i] = sample;
          energy += Math.abs(sample);
        }
        offset += next.length;
        queue.shift();
        queueSamples -= next.length;
      } else {
        for (let i = 0; i < need; i++) {
          const sample = (next[i] ?? 0) * gain;
          out[offset + i] = sample;
          energy += Math.abs(sample);
        }
        queue[0] = next.subarray(need);
        queueSamples -= need;
        offset = out.length;
      }
    }
    lastGameLevel = Math.min(1, (energy / Math.max(1, out.length)) * 4);
  };
  processor.connect(dest);
  // Mantener el grafo vivo.
  const silent = ctx.createGain();
  silent.gain.value = 0;
  processor.connect(silent);
  silent.connect(ctx.destination);

  const handle = await LiveMedia.addListener('screenAudioPcm', (raw) => {
    const data = raw as ScreenAudioPcmEvent;
    if (!data?.pcm) return;
    gamePcmPackets += 1;
    try {
      const bin = atob(data.pcm);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const samples = new Float32Array(bytes.length / 2);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = view.getInt16(i * 2, true) / 32768;
      }
      queue.push(samples);
      queueSamples += samples.length;
      while (queueSamples > maxQueue && queue.length > 1) {
        const dropped = queue.shift();
        if (dropped) queueSamples -= dropped.length;
      }
    } catch {
      /* drop */
    }
  });

  nativeAudioHandle = handle;
  nativeAudioCtx = ctx;
  nativeAudioProcessor = processor;
  nativeAudioStream = dest.stream;
  return dest.stream;
}

export async function stopNativeScreenAudioStream(): Promise<void> {
  try {
    await nativeAudioHandle?.remove();
  } catch {
    /* ignore */
  }
  nativeAudioHandle = null;
  try {
    nativeAudioProcessor?.disconnect();
  } catch {
    /* ignore */
  }
  nativeAudioProcessor = null;
  try {
    await nativeAudioCtx?.close();
  } catch {
    /* ignore */
  }
  nativeAudioCtx = null;
  try {
    nativeAudioStream?.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
  nativeAudioStream = null;
}

/** Micrófono nativo (FGS) → MediaStream mientras se comparte pantalla/juego. */
export async function startNativeMicStream(): Promise<MediaStream | null> {
  if (!isNativeAndroidApp()) return null;
  await stopNativeMicStream();
  ensureKeepLiveTracksHook();

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  const ctx = new AudioCtx({ sampleRate: 44100 });
  try {
    await ctx.resume();
  } catch {
    /* ignore */
  }
  const dest = ctx.createMediaStreamDestination();
  const queue: Float32Array[] = [];
  let queueSamples = 0;
  const maxQueue = 44100;

  const processor = ctx.createScriptProcessor(2048, 1, 1);
  processor.onaudioprocess = (ev) => {
    const out = ev.outputBuffer.getChannelData(0);
    let offset = 0;
    let energy = 0;
    const gain = effectiveMicGain();
    while (offset < out.length) {
      const next = queue[0];
      if (!next) {
        out.fill(0, offset);
        break;
      }
      const need = out.length - offset;
      if (next.length <= need) {
        for (let i = 0; i < next.length; i++) {
          const raw = next[i] ?? 0;
          const sample = raw * gain;
          out[offset + i] = sample;
          energy += Math.abs(raw);
        }
        offset += next.length;
        queue.shift();
        queueSamples -= next.length;
      } else {
        for (let i = 0; i < need; i++) {
          const raw = next[i] ?? 0;
          const sample = raw * gain;
          out[offset + i] = sample;
          energy += Math.abs(raw);
        }
        queue[0] = next.subarray(need);
        queueSamples -= need;
        offset = out.length;
      }
    }
    const rms = energy / Math.max(1, out.length);
    lastMicLevel = Math.min(1, rms * 6);
    const now = performance.now();
    if (rms > 0.028 && !micAudioMuted) {
      // Voz activa: priorizar micrófono frente al juego (ducking temporal).
      voiceOpenUntil = now + 420;
    }
  };
  processor.connect(dest);
  const silent = ctx.createGain();
  silent.gain.value = 0;
  processor.connect(silent);
  silent.connect(ctx.destination);

  const handle = await LiveMedia.addListener('micPcm', (raw) => {
    const data = raw as ScreenAudioPcmEvent;
    if (!data?.pcm) return;
    micPcmPackets += 1;
    try {
      const bin = atob(data.pcm);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const samples = new Float32Array(bytes.length / 2);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = view.getInt16(i * 2, true) / 32768;
      }
      queue.push(samples);
      queueSamples += samples.length;
      while (queueSamples > maxQueue && queue.length > 1) {
        const dropped = queue.shift();
        if (dropped) queueSamples -= dropped.length;
      }
    } catch {
      /* drop */
    }
  });

  nativeMicHandle = handle;
  nativeMicCtx = ctx;
  nativeMicProcessor = processor;
  nativeMicStream = dest.stream;
  return dest.stream;
}

export async function stopNativeMicStream(): Promise<void> {
  try {
    await nativeMicHandle?.remove();
  } catch {
    /* ignore */
  }
  nativeMicHandle = null;
  try {
    nativeMicProcessor?.disconnect();
  } catch {
    /* ignore */
  }
  nativeMicProcessor = null;
  try {
    await nativeMicCtx?.close();
  } catch {
    /* ignore */
  }
  nativeMicCtx = null;
  try {
    nativeMicStream?.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
  nativeMicStream = null;
}

export async function stopNativeScreenShareStream(): Promise<void> {
  nativeDrawGen += 1;
  micAudioMuted = false;
  gameAudioMuted = false;
  lastMicLevel = 0;
  lastGameLevel = 0;
  micPcmPackets = 0;
  gamePcmPackets = 0;
  voiceOpenUntil = 0;
  await stopNativeOverlayCameraStream();
  await stopNativeScreenAudioStream();
  await stopNativeMicStream();
  lastNativeAudioCapturing = false;
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
  if (!isNativeAndroidApp()) {
    activeScreenShareTransport = null;
    return;
  }
  try {
    await LiveMedia.hideScreenShareOverlay();
  } catch {
    /* ignore */
  }
  if (activeScreenShareTransport === 'native') {
    try {
      await LiveMedia.stopNativeLiveKitScreenShare();
    } catch {
      /* ignore */
    }
  }
  try {
    await LiveMedia.stopNativeScreenCapture();
  } catch {
    /* ignore */
  }
  activeScreenShareTransport = null;
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

/** HUD nativo sobre el juego: mic / audio / salir. */
export async function bindPresentationHudAction(
  handler: (action: 'mic' | 'gameAudio' | 'exit') => void,
): Promise<() => void> {
  if (!isNativeAndroidApp()) return () => undefined;
  const handle = await LiveMedia.addListener('presentationHudAction', (raw) => {
    const action = String((raw as { action?: string })?.action || '');
    if (action === 'mic' || action === 'gameAudio' || action === 'exit') {
      handler(action);
    }
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
