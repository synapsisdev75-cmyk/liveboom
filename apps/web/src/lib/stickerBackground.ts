/**
 * Quitar fondo en el navegador con MediaPipe (se carga desde CDN solo al usarlo).
 * - Automático: segmentación de personas (selfie multiclase).
 * - Tocar objeto: segmentación interactiva (cualquier objeto / mascota) en el punto tocado.
 */

const MP_VERSION = '0.10.21';
const MP_BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const SELFIE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';
const MAGIC_TOUCH_MODEL =
  'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite';

type MpMask = { width: number; height: number; getAsFloat32Array: () => Float32Array };
type MpResult = { confidenceMasks?: MpMask[] };
type MpSegmenter = {
  segment: (...args: unknown[]) => void;
  close: () => void;
};
type MpModule = {
  FilesetResolver: { forVisionTasks: (path: string) => Promise<unknown> };
  ImageSegmenter: { createFromOptions: (fileset: unknown, options: unknown) => Promise<MpSegmenter> };
  InteractiveSegmenter: { createFromOptions: (fileset: unknown, options: unknown) => Promise<MpSegmenter> };
};

export type AlphaMask = { width: number; height: number; data: Float32Array };

let filesetTask: Promise<{ mp: MpModule; fileset: unknown }> | null = null;
let selfieTask: Promise<MpSegmenter> | null = null;
let touchTask: Promise<MpSegmenter> | null = null;

function loadFileset() {
  if (!filesetTask) {
    filesetTask = (async () => {
      const mp = (await import(/* @vite-ignore */ MP_BUNDLE)) as MpModule;
      const fileset = await mp.FilesetResolver.forVisionTasks(MP_WASM);
      return { mp, fileset };
    })().catch((err) => {
      filesetTask = null;
      throw err;
    });
  }
  return filesetTask;
}

async function createWithFallback(
  factory: (delegate: 'GPU' | 'CPU') => Promise<MpSegmenter>,
): Promise<MpSegmenter> {
  try {
    return await factory('GPU');
  } catch {
    return factory('CPU');
  }
}

function selfieSegmenter() {
  if (!selfieTask) {
    selfieTask = loadFileset()
      .then(({ mp, fileset }) =>
        createWithFallback((delegate) =>
          mp.ImageSegmenter.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: SELFIE_MODEL, delegate },
            runningMode: 'IMAGE',
            outputCategoryMask: false,
            outputConfidenceMasks: true,
          }),
        ),
      )
      .catch((err) => {
        selfieTask = null;
        throw err;
      });
  }
  return selfieTask;
}

function touchSegmenter() {
  if (!touchTask) {
    touchTask = loadFileset()
      .then(({ mp, fileset }) =>
        createWithFallback((delegate) =>
          mp.InteractiveSegmenter.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MAGIC_TOUCH_MODEL, delegate },
            outputCategoryMask: false,
            outputConfidenceMasks: true,
          }),
        ),
      )
      .catch((err) => {
        touchTask = null;
        throw err;
      });
  }
  return touchTask;
}

function friendlyError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err || '');
  if (/fetch|network|import|load/i.test(raw)) {
    return new Error('No se pudo cargar la herramienta para quitar fondo. Revisa tu conexión e inténtalo de nuevo.');
  }
  return new Error('No se pudo quitar el fondo de esta foto.');
}

/** Personas: alpha = 1 − probabilidad de fondo (clase 0). */
export async function maskPeople(image: HTMLCanvasElement): Promise<AlphaMask> {
  try {
    const segmenter = await selfieSegmenter();
    return await new Promise<AlphaMask>((resolve, reject) => {
      segmenter.segment(image, (result: MpResult) => {
        const bg = result.confidenceMasks?.[0];
        if (!bg) {
          reject(new Error('sin máscara'));
          return;
        }
        const src = bg.getAsFloat32Array();
        const data = new Float32Array(src.length);
        for (let i = 0; i < src.length; i++) data[i] = 1 - (src[i] ?? 1);
        resolve({ width: bg.width, height: bg.height, data });
      });
    });
  } catch (err) {
    throw friendlyError(err);
  }
}

/** Objeto en el punto tocado (coordenadas normalizadas 0‥1 de la imagen). */
export async function maskAtPoint(image: HTMLCanvasElement, x: number, y: number): Promise<AlphaMask> {
  try {
    const segmenter = await touchSegmenter();
    return await new Promise<AlphaMask>((resolve, reject) => {
      segmenter.segment(image, { keypoint: { x, y } }, (result: MpResult) => {
        const masks = result.confidenceMasks ?? [];
        const mask = masks.length > 1 ? masks[1] : masks[0];
        if (!mask) {
          reject(new Error('sin máscara'));
          return;
        }
        const src = mask.getAsFloat32Array();
        const px = Math.min(mask.width - 1, Math.max(0, Math.round(x * (mask.width - 1))));
        const py = Math.min(mask.height - 1, Math.max(0, Math.round(y * (mask.height - 1))));
        const invert = masks.length === 1 && (src[py * mask.width + px] ?? 0) < 0.5;
        const data = new Float32Array(src.length);
        for (let i = 0; i < src.length; i++) {
          const v = src[i] ?? 0;
          data[i] = invert ? 1 - v : v;
        }
        resolve({ width: mask.width, height: mask.height, data });
      });
    });
  } catch (err) {
    throw friendlyError(err);
  }
}

/** Porcentaje de píxeles que quedan visibles (para avisar si la detección automática falló). */
export function maskCoverage(mask: AlphaMask): number {
  let on = 0;
  for (let i = 0; i < mask.data.length; i++) if ((mask.data[i] ?? 0) > 0.5) on++;
  return on / Math.max(1, mask.data.length);
}

/** Aplica la máscara como canal alfa (bordes suaves) sobre una copia de la imagen. */
export function applyMask(image: HTMLCanvasElement, mask: AlphaMask): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = image.width;
  out.height = image.height;
  const ctx = out.getContext('2d');
  if (!ctx) return image;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, out.width, out.height);
  const sx = mask.width / out.width;
  const sy = mask.height / out.height;
  for (let y = 0; y < out.height; y++) {
    const my = Math.min(mask.height - 1, Math.floor(y * sy));
    for (let x = 0; x < out.width; x++) {
      const mx = Math.min(mask.width - 1, Math.floor(x * sx));
      const p = mask.data[my * mask.width + mx] ?? 0;
      const a = p <= 0.3 ? 0 : p >= 0.7 ? 1 : (p - 0.3) / 0.4;
      const o = (y * out.width + x) * 4 + 3;
      pixels.data[o] = Math.round((pixels.data[o] ?? 0) * a);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return out;
}
