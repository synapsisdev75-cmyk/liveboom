export const COVER_WIDTH = 1800;
export const COVER_HEIGHT = 520;
export const COVER_ASPECT = COVER_WIDTH / COVER_HEIGHT;
export const COVER_SAFE_WIDTH = 1400;
export const COVER_SAFE_HEIGHT = 420;
export const COVER_MAX_BYTES = 50 * 1024 * 1024;
export const COVER_DURATION_MIN = 3;
export const COVER_DURATION_MAX = 10;

export type CoverMediaKind = 'image' | 'gif' | 'video';

export type CoverCrop = {
  zoom: number;
  panX: number;
  panY: number;
};

export const DEFAULT_COVER_CROP: CoverCrop = { zoom: 1, panX: 0, panY: 0 };

export const COVER_ACCEPT =
  'image/jpeg,image/jpg,image/png,image/webp,image/gif,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm';

export type CoverProbe = {
  kind: CoverMediaKind;
  width: number;
  height: number;
  durationSec: number | null;
  mime: string;
};

export function isExactCoverSize(width: number, height: number) {
  return Math.abs(width - COVER_WIDTH) <= 1 && Math.abs(height - COVER_HEIGHT) <= 1;
}

export function coverKindFromMime(mime: string, name = ''): CoverMediaKind | null {
  const type = mime.toLowerCase();
  const file = name.toLowerCase();
  if (type === 'image/gif' || file.endsWith('.gif')) return 'gif';
  if (type.startsWith('video/') || file.endsWith('.mp4') || file.endsWith('.webm')) return 'video';
  if (
    type === 'image/jpeg' ||
    type === 'image/jpg' ||
    type === 'image/png' ||
    type === 'image/webp' ||
    file.endsWith('.jpg') ||
    file.endsWith('.jpeg') ||
    file.endsWith('.png') ||
    file.endsWith('.webp')
  ) {
    return 'image';
  }
  return null;
}

export function clampCoverCrop(crop: CoverCrop): CoverCrop {
  return {
    zoom: Math.min(3, Math.max(1, Number(crop.zoom) || 1)),
    panX: Math.min(1, Math.max(-1, Number(crop.panX) || 0)),
    panY: Math.min(1, Math.max(-1, Number(crop.panY) || 0)),
  };
}

export function coverDrawRect(srcW: number, srcH: number, crop: CoverCrop) {
  const next = clampCoverCrop(crop);
  const cover = Math.max(COVER_WIDTH / srcW, COVER_HEIGHT / srcH) * next.zoom;
  const drawW = srcW * cover;
  const drawH = srcH * cover;
  const maxPanX = Math.max(0, (drawW - COVER_WIDTH) / 2);
  const maxPanY = Math.max(0, (drawH - COVER_HEIGHT) / 2);
  return {
    drawW,
    drawH,
    x: (COVER_WIDTH - drawW) / 2 + next.panX * maxPanX,
    y: (COVER_HEIGHT - drawH) / 2 + next.panY * maxPanY,
  };
}

export async function probeCoverFile(file: File): Promise<CoverProbe> {
  if (file.size > COVER_MAX_BYTES) {
    throw new Error('La portada debe pesar menos de 50 MB.');
  }
  const mime = file.type || '';
  const kind = coverKindFromMime(mime, file.name);
  if (!kind) {
    throw new Error('Usa JPG, PNG, WebP, GIF, MP4 o WebM.');
  }
  if (kind === 'video') return probeVideo(file, mime);
  return probeImage(file, kind, mime);
}

function probeImage(file: File, kind: CoverMediaKind, mime: string): Promise<CoverProbe> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      URL.revokeObjectURL(url);
      if (!width || !height) {
        reject(new Error('No se pudo leer la imagen.'));
        return;
      }
      resolve({ kind, width, height, durationSec: null, mime: mime || file.type });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen.'));
    };
    img.src = url;
  });
}

function probeVideo(file: File, mime: string): Promise<CoverProbe> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const durationSec = Number.isFinite(video.duration) ? video.duration : null;
      URL.revokeObjectURL(url);
      video.src = '';
      if (!width || !height) {
        reject(new Error('No se pudo leer el video.'));
        return;
      }
      resolve({ kind: 'video', width, height, durationSec, mime: mime || file.type });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer el video.'));
    };
    video.src = url;
  });
}

export async function bakeCoverStill(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  crop: CoverCrop,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo recortar la portada.');
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);
  const rect = coverDrawRect(srcW, srcH, crop);
  ctx.drawImage(source, rect.x, rect.y, rect.drawW, rect.drawH);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (next) => (next ? resolve(next) : reject(new Error('No se pudo exportar la portada.'))),
      'image/jpeg',
      0.92,
    );
  });
  return blob;
}

export async function loadCoverImage(file: File): Promise<{ source: HTMLImageElement; width: number; height: number; url: string }> {
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    image.src = url;
  });
  return {
    source: img,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    url,
  };
}

export async function exportCoverFile(file: File, probe: CoverProbe, crop: CoverCrop): Promise<{ blob: Blob; kind: CoverMediaKind; ext: string }> {
  if (isExactCoverSize(probe.width, probe.height) && crop.zoom === 1 && crop.panX === 0 && crop.panY === 0) {
    return { blob: file, kind: probe.kind, ext: extFromFile(file, probe.kind) };
  }
  if (probe.kind === 'video') {
    const blob = await bakeCoverMotion(file, probe, crop, 'video');
    return { blob, kind: 'video', ext: 'webm' };
  }
  if (probe.kind === 'gif') {
    try {
      const blob = await bakeCoverMotion(file, probe, crop, 'gif');
      return { blob, kind: 'video', ext: 'webm' };
    } catch {
      const loaded = await loadCoverImage(file);
      try {
        const still = await bakeCoverStill(loaded.source, loaded.width, loaded.height, crop);
        return { blob: still, kind: 'image', ext: 'jpg' };
      } finally {
        URL.revokeObjectURL(loaded.url);
      }
    }
  }
  const loaded = await loadCoverImage(file);
  try {
    const still = await bakeCoverStill(loaded.source, loaded.width, loaded.height, crop);
    return { blob: still, kind: 'image', ext: 'jpg' };
  } finally {
    URL.revokeObjectURL(loaded.url);
  }
}

function extFromFile(file: File, kind: CoverMediaKind) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.png')) return 'png';
  if (name.endsWith('.webp')) return 'webp';
  if (name.endsWith('.gif')) return 'gif';
  if (name.endsWith('.webm')) return 'webm';
  if (name.endsWith('.mp4')) return 'mp4';
  if (kind === 'gif') return 'gif';
  if (kind === 'video') return file.type.includes('webm') ? 'webm' : 'mp4';
  return 'jpg';
}

async function bakeCoverMotion(
  file: File,
  probe: CoverProbe,
  crop: CoverCrop,
  mode: 'video' | 'gif',
): Promise<Blob> {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined') {
    throw new Error('Este navegador no puede recortar video. Usa un archivo de 1800 × 520.');
  }
  const url = URL.createObjectURL(file);
  const canvas = document.createElement('canvas');
  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    URL.revokeObjectURL(url);
    throw new Error('No se pudo recortar la portada.');
  }

  const stream = canvas.captureStream(24);
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3_500_000 });
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };

  try {
    if (mode === 'video') {
      await recordVideoToCanvas(url, probe, crop, ctx, recorder);
    } else {
      await recordGifToCanvas(url, probe, crop, ctx, recorder);
    }
  } finally {
    URL.revokeObjectURL(url);
    stream.getTracks().forEach((track) => track.stop());
  }

  if (!chunks.length) throw new Error('No se pudo exportar la portada.');
  return new Blob(chunks, { type: 'video/webm' });
}

function recordVideoToCanvas(
  url: string,
  probe: CoverProbe,
  crop: CoverCrop,
  ctx: CanvasRenderingContext2D,
  recorder: MediaRecorder,
) {
  return new Promise<void>((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const limit = Math.min(
      COVER_DURATION_MAX,
      Math.max(COVER_DURATION_MIN, Number(probe.durationSec) || COVER_DURATION_MAX),
    );
    let raf = 0;
    function draw() {
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);
      const rect = coverDrawRect(probe.width, probe.height, crop);
      ctx.drawImage(video, rect.x, rect.y, rect.drawW, rect.drawH);
      raf = window.requestAnimationFrame(draw);
    }
    video.onended = () => {
      window.cancelAnimationFrame(raf);
      if (recorder.state !== 'inactive') recorder.stop();
    };
    recorder.onstop = () => {
      window.cancelAnimationFrame(raf);
      video.pause();
      video.src = '';
      resolve();
    };
    recorder.onerror = () => reject(new Error('No se pudo exportar el video de portada.'));
    video.onerror = () => reject(new Error('No se pudo leer el video.'));
    video.onloadeddata = () => {
      void video.play().then(() => {
        recorder.start(120);
        draw();
        window.setTimeout(() => {
          if (recorder.state !== 'inactive') recorder.stop();
        }, limit * 1000);
      }, reject);
    };
    video.src = url;
  });
}

function recordGifToCanvas(
  url: string,
  probe: CoverProbe,
  crop: CoverCrop,
  ctx: CanvasRenderingContext2D,
  recorder: MediaRecorder,
) {
  return new Promise<void>((resolve, reject) => {
    const img = new Image();
    let raf = 0;
    function draw() {
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);
      const rect = coverDrawRect(probe.width, probe.height, crop);
      ctx.drawImage(img, rect.x, rect.y, rect.drawW, rect.drawH);
      raf = window.requestAnimationFrame(draw);
    }
    recorder.onstop = () => {
      window.cancelAnimationFrame(raf);
      resolve();
    };
    recorder.onerror = () => reject(new Error('No se pudo exportar el GIF de portada.'));
    img.onload = () => {
      recorder.start(120);
      draw();
      window.setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, COVER_DURATION_MAX * 1000);
    };
    img.onerror = () => reject(new Error('No se pudo leer el GIF.'));
    img.src = url;
  });
}
