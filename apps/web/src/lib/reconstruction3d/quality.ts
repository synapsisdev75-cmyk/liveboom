import type { ReconstructionQualityIssue, ReconstructionQualityResult } from './types';

const MIN_EDGE = 640;
const HASH_SIZE = 8;

let worker: Worker | null = null;
let workerFailed = false;
let requestId = 0;
const pending = new Map<string, (value: { brightness: number; sharpness: number }) => void>();

function getWorker() {
  if (workerFailed || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./quality.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: string; brightness: number; sharpness: number }>) => {
      const resolve = pending.get(event.data.id);
      pending.delete(event.data.id);
      resolve?.(event.data);
    };
    worker.onerror = () => {
      workerFailed = true;
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

function analyzeOnMain(imageData: ImageData) {
  const { width, height, data } = imageData;
  const sample = Math.max(1, Math.floor(Math.min(width, height) / 96));
  let brightness = 0;
  let samples = 0;
  let edge = 0;
  let edges = 0;
  for (let y = 1; y < height - 1; y += sample) {
    for (let x = 1; x < width - 1; x += sample) {
      const i = (y * width + x) * 4;
      const luma = (data[i] ?? 0) * 0.299 + (data[i + 1] ?? 0) * 0.587 + (data[i + 2] ?? 0) * 0.114;
      brightness += luma;
      samples += 1;
      const right = (y * width + x + sample) * 4;
      const down = ((y + sample) * width + x) * 4;
      if (right + 2 < data.length && down + 2 < data.length) {
        const lumaR = (data[right] ?? 0) * 0.299 + (data[right + 1] ?? 0) * 0.587 + (data[right + 2] ?? 0) * 0.114;
        const lumaD = (data[down] ?? 0) * 0.299 + (data[down + 1] ?? 0) * 0.587 + (data[down + 2] ?? 0) * 0.114;
        edge += Math.abs(luma - lumaR) + Math.abs(luma - lumaD);
        edges += 1;
      }
    }
  }
  return {
    brightness: samples ? brightness / samples : 0,
    sharpness: edges ? edge / edges : 0,
  };
}

async function metricsFromBitmap(bitmap: ImageBitmap) {
  const canvas = document.createElement('canvas');
  const size = 128;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { brightness: 128, sharpness: 20 };
  ctx.drawImage(bitmap, 0, 0, size, size);
  const imageData = ctx.getImageData(0, 0, size, size);
  const instance = getWorker();
  if (!instance) return analyzeOnMain(imageData);
  const id = `q${requestId++}`;
  return new Promise<{ brightness: number; sharpness: number }>((resolve) => {
    const timer = window.setTimeout(() => {
      pending.delete(id);
      resolve(analyzeOnMain(imageData));
    }, 1200);
    pending.set(id, (value) => {
      window.clearTimeout(timer);
      resolve(value);
    });
    instance.postMessage(
      { id, width: size, height: size, buffer: imageData.data.buffer },
      [imageData.data.buffer],
    );
  });
}

function averageHash(bitmap: ImageBitmap) {
  const canvas = document.createElement('canvas');
  canvas.width = HASH_SIZE;
  canvas.height = HASH_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0n;
  ctx.drawImage(bitmap, 0, 0, HASH_SIZE, HASH_SIZE);
  const { data } = ctx.getImageData(0, 0, HASH_SIZE, HASH_SIZE);
  let sum = 0;
  const lumas: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const luma = (data[i] ?? 0) * 0.299 + (data[i + 1] ?? 0) * 0.587 + (data[i + 2] ?? 0) * 0.114;
    lumas.push(luma);
    sum += luma;
  }
  const avg = sum / lumas.length;
  let hash = 0n;
  lumas.forEach((luma, index) => {
    if (luma >= avg) hash |= 1n << BigInt(index);
  });
  return hash;
}

function hamming(a: bigint, b: bigint) {
  let x = a ^ b;
  let count = 0;
  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

const recentHashes: bigint[] = [];

export function resetReconstructionQualityMemory() {
  recentHashes.length = 0;
}

export async function inspectReconstructionPhoto(
  file: File,
): Promise<ReconstructionQualityResult & { hash: bigint; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const { brightness, sharpness } = await metricsFromBitmap(bitmap);
  const hash = averageHash(bitmap);
  bitmap.close();

  let issue: ReconstructionQualityIssue | null = null;
  let reason: string | null = null;
  if (width < MIN_EDGE && height < MIN_EDGE) {
    issue = 'lowres';
    reason = 'Resolución insuficiente';
  } else if (sharpness < 6.5) {
    issue = 'blurry';
    reason = 'Muy borrosa';
  } else if (brightness < 28) {
    issue = 'dark';
    reason = 'Muy oscura';
  } else if (brightness > 242) {
    issue = 'overexposed';
    reason = 'Exposición extrema';
  } else if (recentHashes.some((item) => hamming(item, hash) <= 4)) {
    issue = 'duplicate';
    reason = 'Ángulo repetido';
  }

  if (!issue) recentHashes.push(hash);
  if (recentHashes.length > 36) recentHashes.shift();

  return {
    ok: !issue,
    issue,
    reason,
    brightness,
    sharpness,
    hash,
    width,
    height,
  };
}

export function qualityReasonLabel(issue: ReconstructionQualityIssue | null) {
  if (issue === 'blurry') return 'Muy borrosa';
  if (issue === 'dark') return 'Muy oscura';
  if (issue === 'overexposed') return 'Exposición extrema';
  if (issue === 'duplicate') return 'Ángulo repetido';
  if (issue === 'cropped') return 'Sujeto incompleto';
  if (issue === 'lowres') return 'Resolución insuficiente';
  return 'No podemos usar bien esta fotografía.';
}
