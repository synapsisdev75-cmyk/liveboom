/** Ajustes de foto del compositor. Se previsualizan en vivo y se hornean al aplicar. */

export type PhotoCropAspect = 'free' | '1:1' | '4:5' | '9:16' | '16:9';

export type PhotoEditValues = {
  zoom: number;
  panX: number;
  panY: number;
  rotate: number;
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  warmth: number;
  exposure: number;
  shadows: number;
  highlights: number;
  vignette: number;
  crop: PhotoCropAspect;
};

export const DEFAULT_PHOTO_EDIT: PhotoEditValues = {
  zoom: 100,
  panX: 0,
  panY: 0,
  rotate: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  sharpness: 0,
  warmth: 0,
  exposure: 0,
  shadows: 0,
  highlights: 0,
  vignette: 0,
  crop: 'free',
};

export function isDefaultPhotoEdit(edit: PhotoEditValues) {
  return (
    edit.zoom === 100 &&
    edit.panX === 0 &&
    edit.panY === 0 &&
    edit.rotate === 0 &&
    edit.brightness === 0 &&
    edit.contrast === 0 &&
    edit.saturation === 0 &&
    edit.sharpness === 0 &&
    edit.warmth === 0 &&
    edit.exposure === 0 &&
    edit.shadows === 0 &&
    edit.highlights === 0 &&
    edit.vignette === 0 &&
    edit.crop === 'free'
  );
}

export function cropAspectRatio(crop: PhotoCropAspect): number | null {
  if (crop === '1:1') return 1;
  if (crop === '4:5') return 4 / 5;
  if (crop === '9:16') return 9 / 16;
  if (crop === '16:9') return 16 / 9;
  return null;
}

export function photoCssFilter(edit: PhotoEditValues) {
  const brightness = 1 + edit.brightness / 100 + edit.exposure / 140;
  const contrast = 1 + edit.contrast / 100 + edit.highlights / 220 - edit.shadows / 240 + edit.sharpness / 220;
  const saturate = 1 + edit.saturation / 100;
  const hue = edit.warmth * 0.32;
  const sepia = Math.max(0, edit.warmth) / 420;
  return `brightness(${brightness}) contrast(${Math.max(0.2, contrast)}) saturate(${Math.max(0, saturate)}) hue-rotate(${hue}deg) sepia(${sepia})`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampPan(edit: PhotoEditValues) {
  const extra = Math.max(0, (edit.zoom - 100) / 2 + 8);
  return {
    ...edit,
    panX: clamp(edit.panX, -extra, extra),
    panY: clamp(edit.panY, -extra, extra),
  };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer la foto para editarla.'));
    img.src = src;
  });
}

function applyVignette(ctx: CanvasRenderingContext2D, width: number, height: number, amount: number) {
  if (amount <= 0) return;
  const strength = amount / 100;
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.18,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${0.72 * strength})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function sharpenCanvas(ctx: CanvasRenderingContext2D, width: number, height: number, amount: number) {
  if (amount <= 0) return;
  const mix = Math.min(1, amount / 100);
  const src = ctx.getImageData(0, 0, width, height);
  const copy = new Uint8ClampedArray(src.data);
  const data = src.data;
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        let acc = 0;
        let k = 0;
        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            const j = ((y + ky) * width + (x + kx)) * 4 + c;
            acc += (copy[j] ?? 0) * (kernel[k] || 0);
            k += 1;
          }
        }
        data[i + c] = clamp((copy[i + c] ?? 0) * (1 - mix) + acc * mix, 0, 255);
      }
    }
  }
  ctx.putImageData(src, 0, 0);
}

export async function bakePhotoEdit(file: File, edit: PhotoEditValues): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const rotated = edit.rotate % 180 !== 0;
    const srcW = rotated ? img.naturalHeight : img.naturalWidth;
    const srcH = rotated ? img.naturalWidth : img.naturalHeight;
    const ratio = cropAspectRatio(edit.crop);
    let outW = srcW;
    let outH = srcH;
    if (ratio) {
      if (srcW / srcH > ratio) {
        outW = Math.round(srcH * ratio);
        outH = srcH;
      } else {
        outW = srcW;
        outH = Math.round(srcW / ratio);
      }
    }
    const longEdge = Math.max(outW, outH);
    const scaleDown = longEdge > 1920 ? 1920 / longEdge : 1;
    outW = Math.max(2, Math.round(outW * scaleDown));
    outH = Math.max(2, Math.round(outH * scaleDown));

    const rotatedCanvas = document.createElement('canvas');
    rotatedCanvas.width = srcW;
    rotatedCanvas.height = srcH;
    const rotCtx = rotatedCanvas.getContext('2d');
    if (!rotCtx) throw new Error('No se pudo editar la foto.');
    rotCtx.translate(srcW / 2, srcH / 2);
    rotCtx.rotate((edit.rotate * Math.PI) / 180);
    rotCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo editar la foto.');

    ctx.filter = photoCssFilter(edit);
    ctx.save();
    ctx.translate(outW / 2, outH / 2);
    const zoom = Math.max(1, edit.zoom / 100);
    const cover = Math.max(outW / srcW, outH / srcH) * zoom;
    const drawW = srcW * cover;
    const drawH = srcH * cover;
    const panPx = (edit.panX / 50) * Math.max(0, drawW - outW) * 0.5;
    const panPy = (edit.panY / 50) * Math.max(0, drawH - outH) * 0.5;
    ctx.drawImage(rotatedCanvas, -drawW / 2 + panPx, -drawH / 2 + panPy, drawW, drawH);
    ctx.restore();
    ctx.filter = 'none';
    applyVignette(ctx, outW, outH, edit.vignette);
    sharpenCanvas(ctx, outW, outH, edit.sharpness);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (next) => {
          if (next) resolve(next);
          else reject(new Error('No se pudo guardar la foto editada.'));
        },
        'image/jpeg',
        0.92,
      );
    });
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '-edit.jpg', { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
