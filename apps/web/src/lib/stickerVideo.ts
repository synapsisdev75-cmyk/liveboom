import { GIFEncoder, applyPalette, quantize } from 'gifenc';

export const ANIM_MAX_SECONDS = 4;
export const ANIM_MIN_SECONDS = 1;
export const ANIM_MAX_FRAMES = 40;
export const ANIM_FPS = 10;
const FRAME_MAX_EDGE = 384;

function waitFor(target: EventTarget, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      target.removeEventListener(event, done);
      reject(new Error('timeout'));
    }, timeoutMs);
    function done() {
      window.clearTimeout(timer);
      target.removeEventListener(event, done);
      resolve();
    }
    target.addEventListener(event, done, { once: true });
  });
}

async function seek(video: HTMLVideoElement, time: number) {
  if (Math.abs(video.currentTime - time) < 0.002 && video.readyState >= 2) return;
  const wait = waitFor(video, 'seeked', 4000);
  video.currentTime = time;
  await wait;
}

/** Fotogramas del tramo elegido, a `fps`, como canvases (máx. 384 px de lado). */
export async function extractVideoFrames(
  video: HTMLVideoElement,
  start: number,
  length: number,
  fps: number,
  onProgress?: (done: number, total: number) => void,
): Promise<HTMLCanvasElement[]> {
  if (video.readyState < 2) await waitFor(video, 'loadeddata', 8000);
  video.pause();
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error('No se pudo leer el video.');
  const scale = Math.min(1, FRAME_MAX_EDGE / Math.max(vw, vh));
  const w = Math.max(1, Math.round(vw * scale));
  const h = Math.max(1, Math.round(vh * scale));
  const duration = Number.isFinite(video.duration) ? video.duration : start + length;
  const total = Math.max(2, Math.min(ANIM_MAX_FRAMES, Math.round(length * fps)));
  const frames: HTMLCanvasElement[] = [];
  for (let i = 0; i < total; i++) {
    const t = Math.min(Math.max(0, duration - 0.05), start + i / fps);
    await seek(video, t);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Tu navegador no permite editar video.');
    ctx.drawImage(video, 0, 0, w, h);
    frames.push(canvas);
    onProgress?.(i + 1, total);
  }
  return frames;
}

/** Orden de reproducción: normal o rebote (ida y vuelta). */
export function frameSequence(count: number, bounce: boolean): number[] {
  const forward = Array.from({ length: count }, (_, i) => i);
  if (!bounce || count < 3) return forward;
  return [...forward, ...forward.slice(1, -1).reverse()];
}

/** GIF animado con transparencia (1 bit) y bucle infinito. */
export function encodeTransparentGif(frames: ImageData[], delayMs: number): Blob {
  const gif = GIFEncoder();
  for (const frame of frames) {
    const palette = quantize(frame.data, 256, { format: 'rgba4444', oneBitAlpha: true });
    const index = applyPalette(frame.data, palette, 'rgba4444');
    const transparentIndex = palette.findIndex((color) => (color[3] ?? 255) === 0);
    gif.writeFrame(index, frame.width, frame.height, {
      palette,
      delay: delayMs,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
      dispose: 2,
    });
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
