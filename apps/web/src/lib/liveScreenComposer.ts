import { LocalVideoTrack } from 'livekit-client';

export const LIVE_SCREEN_PIP_WIDTH_RATIO = 0.28;
/** Relación ancho/alto del PiP de cámara (9:16 vertical). */
export const LIVE_SCREEN_PIP_WH_RATIO = 9 / 16;
export const LIVE_SCREEN_MARGIN_PX = 12;
export const LIVE_FRAME_MIN_NW = 0.12;
export const LIVE_FRAME_MAX_NW = 1;
/** PiP en compartir pantalla: máximo ~45% del área LIVE. */
export const LIVE_PIP_MAX_NW = 0.45;
/** PiP en compartir pantalla: mínimo absoluto en px. */
export const LIVE_PIP_MIN_WIDTH_PX = 100;
export const LIVE_FRAME_SIZE_PRESETS = {
  S: 0.18,
  M: 0.28,
  L: 0.42,
  FULL: 1,
} as const;
export const LIVE_SCREEN_OUTPUT_WIDTH = 720;
export const LIVE_SCREEN_OUTPUT_HEIGHT = 1280;
export const LIVE_SCREEN_FPS = 24;
export const SCREEN_ASPECT_THRESHOLD = 1.3;

export type PipNormalizedPos = { nx: number; ny: number; nw?: number };
export type LiveFrameLayout = { nx: number; ny: number; nw: number };
export type ScreenLayoutMode = 'horizontal' | 'vertical' | 'neutral';

export type ScreenTrackDimensions = {
  width: number;
  height: number;
  layout: ScreenLayoutMode;
  settingsWidth: number;
  settingsHeight: number;
  videoWidth: number;
  videoHeight: number;
  displaySurface?: string;
};

function getDisplayMediaImpl(): ((
  constraints?: DisplayMediaStreamOptions,
) => Promise<MediaStream>) | null {
  if (typeof navigator === 'undefined') return null;
  const devices = navigator.mediaDevices;
  if (devices && typeof devices.getDisplayMedia === 'function') {
    return (constraints) => devices.getDisplayMedia(constraints);
  }
  const legacy = (
    navigator as Navigator & {
      getDisplayMedia?: MediaDevices['getDisplayMedia'];
    }
  ).getDisplayMedia;
  if (typeof legacy === 'function') {
    return (constraints) => legacy.call(navigator, constraints);
  }
  return null;
}

export function canUseDisplayMedia(): boolean {
  return getDisplayMediaImpl() != null;
}

function isMobileCaptureClient(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function classifyScreenLayout(width: number, height: number): ScreenLayoutMode {
  if (!width || !height) return 'neutral';
  const ratio = width / height;
  if (ratio >= SCREEN_ASPECT_THRESHOLD) return 'horizontal';
  if (height / width >= SCREEN_ASPECT_THRESHOLD) return 'vertical';
  return 'neutral';
}

/** Lee dimensiones reales del track (settings + video element). */
export function readScreenTrackDimensions(
  track: MediaStreamTrack,
  video?: HTMLVideoElement | null,
): ScreenTrackDimensions {
  const settings = track.getSettings?.() ?? {};
  const settingsWidth = Math.floor(Number(settings.width) || 0);
  const settingsHeight = Math.floor(Number(settings.height) || 0);
  const videoWidth = Math.floor(video?.videoWidth || 0);
  const videoHeight = Math.floor(video?.videoHeight || 0);
  const width = videoWidth || settingsWidth;
  const height = videoHeight || settingsHeight;
  const displaySurface =
    typeof settings.displaySurface === 'string' ? settings.displaySurface : undefined;
  return {
    width,
    height,
    layout: classifyScreenLayout(width, height),
    settingsWidth,
    settingsHeight,
    videoWidth,
    videoHeight,
    displaySurface,
  };
}

/**
 * Nombre legible de la fuente si el navegador lo expone (label / displaySurface).
 * No depende de URLs privadas; puede devolver null por privacidad del navegador.
 */
export function formatScreenShareSourceLabel(track: MediaStreamTrack): string | null {
  const raw = String(track.label || '').trim();
  if (raw) {
    const cleaned = raw
      .replace(/^chrome\s+tab\s*[-–:]\s*/i, '')
      .replace(/^pestana\s+de\s+/i, '')
      .replace(/\s*[-–|]\s*google chrome$/i, '')
      .replace(/\s*[-–|]\s*microsoft edge$/i, '')
      .trim();
    if (cleaned) {
      const short = cleaned.split(/\s*[-–|]\s*/)[0]?.trim() || cleaned;
      if (short.length > 0) {
        return short.length > 48 ? `${short.slice(0, 48)}…` : short;
      }
    }
  }

  const surface = track.getSettings?.().displaySurface;
  if (surface === 'monitor') return 'Pantalla completa';
  if (surface === 'window') return 'Ventana';
  if (surface === 'browser') return 'Pestaña';
  return null;
}

export async function requestScreenCaptureStream(): Promise<MediaStream> {
  const getDisplay = getDisplayMediaImpl();
  if (!getDisplay) {
    throw new Error(
      'Este navegador no permite compartir pantalla. Abre LiveBoom en Chrome (Android) o Safari (iOS 16.4+).',
    );
  }

  const attempts: DisplayMediaStreamOptions[] = isMobileCaptureClient()
    ? [{ video: true, audio: true }, { video: true }]
    : [
        {
          video: { frameRate: { ideal: LIVE_SCREEN_FPS, max: 30 } },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          } as MediaTrackConstraints,
        },
        { video: true, audio: true },
        { video: true },
      ];

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      return await getDisplay(constraints);
    } catch (err) {
      lastError = err;
      const name = (err as { name?: string })?.name;
      if (name === 'AbortError' || name === 'NotAllowedError') throw err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('No se pudo capturar la pantalla');
}

export function screenShareAudioStatusMessage(hasAudio: boolean): string {
  return hasAudio
    ? 'Audio de pantalla activo. Si no se escucha, marca "Compartir audio" en el diálogo del navegador.'
    : 'Sin audio de pantalla. En el diálogo del navegador activa "Compartir audio de la pestaña".';
}

export function screenShareStatusMessage(track: MediaStreamTrack, dims?: ScreenTrackDimensions): string {
  const label = formatScreenShareSourceLabel(track);
  if (label) return `Compartiendo: ${label}`;
  const layout = dims?.layout ?? readScreenTrackDimensions(track).layout;
  if (layout === 'horizontal') return 'Compartiendo pantalla horizontal';
  if (layout === 'vertical') return 'Compartiendo pantalla vertical';
  return 'Compartiendo pantalla en vivo';
}

export function frameAspectRatio(ratio: '16:9' | '9:16') {
  return ratio === '16:9' ? 16 / 9 : 9 / 16;
}

/** Lee aspect ratio intrínseco de la cámara desde el MediaStreamTrack. */
export function readCameraTrackAspect(
  track: MediaStreamTrack | null | undefined,
  fallback = 9 / 16,
): number {
  if (!track) return fallback;
  const settings = track.getSettings?.() ?? {};
  const w = Number(settings.width) || 0;
  const h = Number(settings.height) || 0;
  if (w > 0 && h > 0) return w / h;
  return fallback;
}

export type PipRectOptions = {
  /** Relación ancho/alto del PiP (cámara). Si no se pasa, usa el aspect del LIVE. */
  pipAspect?: number;
  maxNw?: number;
  minWidthPx?: number;
};

export const SCREEN_SHARE_PIP_OPTS: PipRectOptions = {
  maxNw: LIVE_PIP_MAX_NW,
  minWidthPx: LIVE_PIP_MIN_WIDTH_PX,
};

export function normalizeFrameLayout(
  layout: PipNormalizedPos,
  fallbackNw = LIVE_SCREEN_PIP_WIDTH_RATIO,
  maxNw = LIVE_FRAME_MAX_NW,
): LiveFrameLayout {
  const nw = layout.nw ?? fallbackNw;
  return {
    nx: Math.min(1, Math.max(0, layout.nx)),
    ny: Math.min(1, Math.max(0, layout.ny)),
    nw: Math.min(maxNw, Math.max(LIVE_FRAME_MIN_NW, nw)),
  };
}

export function computeFrameRect(
  containerW: number,
  containerH: number,
  layout: LiveFrameLayout,
  frameAspect: '16:9' | '9:16',
  options?: PipRectOptions,
) {
  const ar = options?.pipAspect ?? frameAspectRatio(frameAspect);
  const maxNw = options?.maxNw ?? LIVE_FRAME_MAX_NW;
  const minWidthPx = options?.minWidthPx ?? 0;
  const nw = Math.min(maxNw, Math.max(LIVE_FRAME_MIN_NW, layout.nw));
  const maxW = containerW * maxNw;

  let pipW = Math.max(minWidthPx, containerW * nw);
  if (pipW > maxW) pipW = maxW;
  let pipH = pipW / ar;

  if (nw >= 0.99 && maxNw >= 0.99) {
    pipW = containerW;
    pipH = pipW / ar;
    if (pipH > containerH) {
      pipH = containerH;
      pipW = pipH * ar;
    }
    const x = (containerW - pipW) / 2;
    const y = (containerH - pipH) / 2;
    return {
      x,
      y,
      width: pipW,
      height: pipH,
      maxX: Math.max(0, x),
      maxY: Math.max(0, y),
      nw: pipW / containerW,
    };
  }

  if (pipH > containerH) {
    pipH = containerH;
    pipW = pipH * ar;
    pipW = Math.max(minWidthPx, Math.min(maxW, pipW));
    pipH = pipW / ar;
  }

  const maxX = Math.max(0, containerW - pipW);
  const maxY = Math.max(0, containerH - pipH);
  const x = maxX > 0 ? Math.min(maxX, Math.max(0, layout.nx * maxX)) : (containerW - pipW) / 2;
  const y = maxY > 0 ? Math.min(maxY, Math.max(0, layout.ny * maxY)) : (containerH - pipH) / 2;

  return {
    x,
    y,
    width: pipW,
    height: pipH,
    maxX,
    maxY,
    nw: pipW / containerW,
  };
}

export function layoutFromRect(
  containerW: number,
  containerH: number,
  x: number,
  y: number,
  width: number,
  height: number,
  options?: Pick<PipRectOptions, 'maxNw' | 'minWidthPx'>,
) {
  const maxNw = options?.maxNw ?? LIVE_FRAME_MAX_NW;
  const minWidthPx = options?.minWidthPx ?? 0;
  const maxW = containerW * maxNw;
  const clampedW = Math.min(maxW, Math.max(minWidthPx, width));
  const maxX = Math.max(0, containerW - clampedW);
  const maxY = Math.max(0, containerH - height);
  return {
    nx: maxX > 0 ? Math.min(1, Math.max(0, x / maxX)) : 0,
    ny: maxY > 0 ? Math.min(1, Math.max(0, y / maxY)) : 0,
    nw: Math.min(maxNw, Math.max(LIVE_FRAME_MIN_NW, clampedW / containerW)),
  };
}

export function pipHeightForWidth(pipW: number, frameAspect: '16:9' | '9:16' = '9:16') {
  return pipW / frameAspectRatio(frameAspect);
}

export function computePipRect(
  containerW: number,
  containerH: number,
  nx: number,
  ny: number,
  pipWidthRatio = LIVE_SCREEN_PIP_WIDTH_RATIO,
  frameAspect: '16:9' | '9:16' = '9:16',
) {
  return computeFrameRect(
    containerW,
    containerH,
    { nx, ny, nw: pipWidthRatio },
    frameAspect,
  );
}

export function defaultPipPosition(
  width: number,
  height: number,
  pipWidthRatio = LIVE_SCREEN_PIP_WIDTH_RATIO,
  frameAspect: '16:9' | '9:16' = '9:16',
): LiveFrameLayout {
  const rect = computeFrameRect(width, height, { nx: 0, ny: 0, nw: pipWidthRatio }, frameAspect);
  const maxX = Math.max(0, width - rect.width);
  const maxY = Math.max(0, height - rect.height);
  if (maxX <= 0 || maxY <= 0) return { nx: 0, ny: 0, nw: pipWidthRatio };
  return {
    nx: Math.max(0, (maxX - LIVE_SCREEN_MARGIN_PX) / maxX),
    ny: Math.max(0, (maxY - LIVE_SCREEN_MARGIN_PX) / maxY),
    nw: pipWidthRatio,
  };
}

export function defaultCameraFrameLayout(_frameAspect: '16:9' | '9:16'): LiveFrameLayout {
  return { nx: 0, ny: 0, nw: LIVE_FRAME_SIZE_PRESETS.FULL };
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.min(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(video, dx, dy, dw, dh);
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(video, dx, dy, dw, dh);
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function videoReady(video: HTMLVideoElement) {
  return video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0;
}

async function waitForVideo(video: HTMLVideoElement, timeoutMs = 10_000) {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Tiempo de espera del video'));
    }, timeoutMs);
    const onReady = () => {
      if (video.videoWidth > 0) {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('resize', onReady);
    };
    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('resize', onReady);
    onReady();
  });
}

function attachVideoTrack(video: HTMLVideoElement, track: MediaStreamTrack) {
  video.srcObject = new MediaStream([track]);
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
}

export type LiveScreenComposerCallbacks = {
  onDimensionsChange?: (dims: ScreenTrackDimensions) => void;
};

export class LiveScreenComposer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly screenVideo: HTMLVideoElement;
  private readonly cameraVideo: HTMLVideoElement;
  private readonly width: number;
  private readonly height: number;
  private readonly fps: number;
  private rafId = 0;
  private pipVisible = true;
  private pipMirrored = false;
  private pipPos: PipNormalizedPos;
  private screenLayout: ScreenLayoutMode = 'neutral';
  private screenTrack: MediaStreamTrack | null = null;
  private onDimensionsChange?: (dims: ScreenTrackDimensions) => void;
  private lastDimsKey = '';
  private localVideoTrack: LocalVideoTrack | null = null;

  constructor(
    options: {
      width?: number;
      height?: number;
      fps?: number;
    } = {},
  ) {
    this.width = options.width ?? LIVE_SCREEN_OUTPUT_WIDTH;
    this.height = options.height ?? LIVE_SCREEN_OUTPUT_HEIGHT;
    this.fps = options.fps ?? LIVE_SCREEN_FPS;
    this.pipPos = defaultPipPosition(this.width, this.height);

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D no disponible');
    this.ctx = ctx;

    this.screenVideo = document.createElement('video');
    this.cameraVideo = document.createElement('video');
  }

  getScreenLayout() {
    return this.screenLayout;
  }

  getPipPosition(): PipNormalizedPos {
    return { ...this.pipPos };
  }

  setPipPosition(nx: number, ny: number) {
    this.pipPos = {
      nx: Math.min(1, Math.max(0, nx)),
      ny: Math.min(1, Math.max(0, ny)),
    };
  }

  setPipVisible(visible: boolean) {
    this.pipVisible = visible;
  }

  setPipMirrored(mirrored: boolean) {
    this.pipMirrored = mirrored;
  }

  isPipVisible() {
    return this.pipVisible;
  }

  async start(
    screenTrack: MediaStreamTrack,
    cameraTrack: MediaStreamTrack,
    callbacks?: LiveScreenComposerCallbacks,
  ): Promise<LocalVideoTrack> {
    this.screenTrack = screenTrack;
    this.onDimensionsChange = callbacks?.onDimensionsChange;

    attachVideoTrack(this.screenVideo, screenTrack);
    attachVideoTrack(this.cameraVideo, cameraTrack);

    this.screenVideo.addEventListener('resize', this.handleScreenResize);

    await Promise.all([
      this.screenVideo.play().catch(() => undefined),
      this.cameraVideo.play().catch(() => undefined),
    ]);

    await waitForVideo(this.screenVideo).catch(() => undefined);
    await waitForVideo(this.cameraVideo).catch(() => undefined);

    this.emitDimensionsIfChanged();

    const stream = this.canvas.captureStream(this.fps);
    const outputTrack = stream.getVideoTracks()[0];
    if (!outputTrack) throw new Error('No se pudo crear el track compuesto');

    this.localVideoTrack = new LocalVideoTrack(outputTrack, undefined, true);
    this.loop();
    return this.localVideoTrack;
  }

  private handleScreenResize = () => {
    this.emitDimensionsIfChanged();
  };

  private emitDimensionsIfChanged() {
    if (!this.screenTrack) return;
    const dims = readScreenTrackDimensions(this.screenTrack, this.screenVideo);
    const key = `${dims.width}x${dims.height}:${dims.layout}`;
    if (key === this.lastDimsKey) return;
    this.lastDimsKey = key;
    this.screenLayout = dims.layout;
    this.onDimensionsChange?.(dims);
  }

  private loop = () => {
    this.drawFrame();
    this.rafId = window.requestAnimationFrame(this.loop);
  };

  private drawScreen() {
    const { ctx, width, height, screenVideo } = this;
    if (!videoReady(screenVideo)) return;

    const dims = this.screenTrack
      ? readScreenTrackDimensions(this.screenTrack, screenVideo)
      : {
          width: screenVideo.videoWidth,
          height: screenVideo.videoHeight,
          layout: classifyScreenLayout(screenVideo.videoWidth, screenVideo.videoHeight),
        };
    this.screenLayout = dims.layout;

    const key = `${dims.width}x${dims.height}:${dims.layout}`;
    if (key !== this.lastDimsKey) {
      this.lastDimsKey = key;
      this.onDimensionsChange?.(dims as ScreenTrackDimensions);
    }

    // El canvas ya tiene el aspecto elegido por el host; el contenido se adapta dentro sin cambiar formato.
    drawContain(ctx, screenVideo, 0, 0, width, height);
  }

  private drawFrame() {
    const { ctx, width, height } = this;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    this.drawScreen();

    if (this.pipVisible && videoReady(this.cameraVideo)) {
      const pipW = width * LIVE_SCREEN_PIP_WIDTH_RATIO;
      const pipH = pipHeightForWidth(pipW);
      const maxX = Math.max(0, width - pipW);
      const maxY = Math.max(0, height - pipH);
      const px = maxX > 0 ? this.pipPos.nx * maxX : 0;
      const py = maxY > 0 ? this.pipPos.ny * maxY : 0;

      ctx.save();
      roundRectPath(ctx, px, py, pipW, pipH, 18);
      ctx.clip();
      if (this.pipMirrored) {
        ctx.translate(px + pipW, py);
        ctx.scale(-1, 1);
        drawCover(ctx, this.cameraVideo, 0, 0, pipW, pipH);
      } else {
        drawCover(ctx, this.cameraVideo, px, py, pipW, pipH);
      }
      ctx.restore();

      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 3;
      roundRectPath(ctx, px + 1.5, py + 1.5, pipW - 3, pipH - 3, 16);
      ctx.stroke();
    }
  }

  stop() {
    window.cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.screenVideo.removeEventListener('resize', this.handleScreenResize);
    this.screenVideo.pause();
    this.cameraVideo.pause();
    this.screenVideo.srcObject = null;
    this.cameraVideo.srcObject = null;
    this.screenTrack = null;
    this.onDimensionsChange = undefined;
    this.lastDimsKey = '';
    if (this.localVideoTrack) {
      this.localVideoTrack.stop();
      this.localVideoTrack = null;
    }
  }
}
