import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { analyzeImageData, type ImageAnalysis } from './contrast';

export const CHAT_BG_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';

const MAX_INPUT_BYTES = 30 * 1024 * 1024;
const MAX_PIXELS = 60_000_000;

/** Lado largo máximo por variante. */
const VARIANTS = { thumb: 320, medium: 1280, full: 2160 } as const;
type VariantName = keyof typeof VARIANTS;

export type ProcessedBackground = {
  id: string;
  width: number;
  height: number;
  mime: 'image/webp' | 'image/jpeg';
  blobs: Record<VariantName, Blob>;
  urls: Record<VariantName, string>;
} & ImageAnalysis;

export class ChatBackgroundError extends Error {}

type Kind = 'jpeg' | 'png' | 'webp' | 'heic';

/** Formato real por cabecera (no por nombre ni MIME declarado). */
export function sniffImageKind(bytes: Uint8Array): Kind | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  const ascii = (start: number, end: number) => String.fromCharCode(...Array.from(bytes.slice(start, end)));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(ascii(8, 12))) return 'heic';
  return null;
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      /* algunos navegadores no aceptan opciones o HEIC: probar con <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new ChatBackgroundError('No se pudo leer la imagen.');
  }
}

let webpSupport: boolean | null = null;
function supportsWebp() {
  if (webpSupport !== null) return webpSupport;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    webpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new ChatBackgroundError('No se pudo procesar la imagen.'))), mime, quality);
  });
}

function drawScaled(source: CanvasImageSource, width: number, height: number, longSide: number) {
  const scale = Math.min(1, longSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ChatBackgroundError('Tu navegador no pudo procesar la imagen.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return { canvas, ctx, w, h };
}

/**
 * Valida y re-codifica la foto del usuario. Volver a dibujar en canvas elimina EXIF/GPS y
 * cualquier dato ajeno a los píxeles; el archivo original del usuario no se modifica.
 */
export async function processChatBackground(file: File): Promise<ProcessedBackground> {
  if (!file || file.size <= 0) throw new ChatBackgroundError('Archivo vacío.');
  if (file.size > MAX_INPUT_BYTES) throw new ChatBackgroundError('La imagen supera 30 MB.');
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const kind = sniffImageKind(head);
  if (!kind) throw new ChatBackgroundError('Formato no permitido. Usa JPG, PNG, WEBP o HEIC.');

  let decoded;
  try {
    decoded = await decode(file);
  } catch {
    throw new ChatBackgroundError(
      kind === 'heic'
        ? 'Este dispositivo no puede abrir HEIC. Elige la foto en JPG, PNG o WEBP.'
        : 'No se pudo leer la imagen.',
    );
  }
  const { source, width, height } = decoded;
  try {
    if (!width || !height || width * height > MAX_PIXELS) {
      throw new ChatBackgroundError('La imagen es demasiado grande.');
    }
    const mime = supportsWebp() ? 'image/webp' : 'image/jpeg';
    const blobs = {} as Record<VariantName, Blob>;
    let fullSize = { w: width, h: height };
    let analysis: ImageAnalysis = { luminance: 0.3, baseColor: '#0a0a0b' };
    for (const name of ['full', 'medium', 'thumb'] as VariantName[]) {
      const { canvas, w, h } = drawScaled(source, width, height, VARIANTS[name]);
      if (name === 'full') fullSize = { w, h };
      let quality = name === 'thumb' ? 0.62 : name === 'medium' ? 0.8 : 0.84;
      let blob = await toBlob(canvas, mime, quality);
      while (name === 'full' && blob.size > 1_600_000 && quality > 0.6) {
        quality -= 0.08;
        blob = await toBlob(canvas, mime, quality);
      }
      blobs[name] = blob;
      if (name === 'thumb') {
        const sample = drawScaled(canvas, w, h, 32);
        analysis = analyzeImageData(sample.ctx.getImageData(0, 0, sample.w, sample.h).data, sample.w, sample.h);
      }
    }
    const urls = {
      thumb: URL.createObjectURL(blobs.thumb),
      medium: URL.createObjectURL(blobs.medium),
      full: URL.createObjectURL(blobs.full),
    };
    return {
      id: `bg${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      width: fullSize.w,
      height: fullSize.h,
      mime,
      blobs,
      urls,
      ...analysis,
    };
  } finally {
    decoded.close();
  }
}

export function revokeProcessedBackground(processed: ProcessedBackground | null) {
  if (!processed) return;
  Object.values(processed.urls).forEach((url) => URL.revokeObjectURL(url));
}

export async function uploadChatBackground(uid: string, processed: ProcessedBackground) {
  const ext = processed.mime === 'image/webp' ? 'webp' : 'jpg';
  const entries = await Promise.all(
    (Object.keys(processed.blobs) as VariantName[]).map(async (name) => {
      const objectRef = ref(storage, `users/${uid}/chat-backgrounds/${processed.id}/${name}.${ext}`);
      await uploadBytes(objectRef, processed.blobs[name], {
        contentType: processed.mime,
        cacheControl: 'public, max-age=31536000, immutable',
      });
      return [name, await getDownloadURL(objectRef)] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<VariantName, string>;
}
