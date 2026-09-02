import { getDownloadURL, ref, updateMetadata, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';

/** Peso máximo de fotos tras optimización. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** Resolución máxima objetivo: 20 megapíxeles (ancho × alto). */
export const MAX_IMAGE_MEGAPIXELS = 20;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_CHAT_FILE_BYTES = 20 * 1024 * 1024;

export type MediaVisibility = 'public' | 'friends' | 'private' | 'circle';

/** Carpetas de media por módulo (no mezclar publicación con Boom Clip). */
export const USER_MEDIA_FOLDERS = {
  publication: 'publicaciones',
  boom_clip: 'boom-clips',
  flash_boom: 'flash-boom',
} as const;

export type UserMediaStorageKind = keyof typeof USER_MEDIA_FOLDERS;

export function userStorageFolder(uid: string) {
  return `users/${uid}`;
}

export function userMediaStorageFolder(uid: string, kind: UserMediaStorageKind) {
  return `${userStorageFolder(uid)}/${USER_MEDIA_FOLDERS[kind]}`;
}

export async function ensureUserStorageFolder(uid: string): Promise<void> {
  const base = userStorageFolder(uid);
  const paths = [
    `${base}/.keep`,
    ...Object.values(USER_MEDIA_FOLDERS).map((folder) => `${base}/${folder}/.keep`),
  ];
  await Promise.all(
    paths.map((path) =>
      uploadBytes(ref(storage, path), new Blob(['liveboom'], { type: 'text/plain' }), {
        contentType: 'text/plain',
      }).catch(() => undefined),
    ),
  );
}

type LoadedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

async function loadImage(blob: Blob): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.onload = () => {
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        cleanup: () => URL.revokeObjectURL(objectUrl),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo leer la imagen'));
    };
    image.src = objectUrl;
  });
}

async function imageMegapixels(blob: Blob): Promise<number> {
  if (typeof createImageBitmap !== 'function') return 0;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    return (bitmap.width * bitmap.height) / 1_000_000;
  } finally {
    bitmap?.close();
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen'))),
      'image/jpeg',
      quality,
    );
  });
}

function fitMegapixels(width: number, height: number, maxMp: number) {
  const mp = (width * height) / 1_000_000;
  if (mp <= maxMp + 0.05) return { width, height };
  const scale = Math.sqrt(maxMp / mp);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

/** Reduce peso y resolución hasta el máximo permitido (JPEG). */
export async function compressImageToLimit(
  blob: Blob,
  maxBytes = MAX_IMAGE_BYTES,
  maxMegapixels = MAX_IMAGE_MEGAPIXELS,
): Promise<Blob> {
  const loaded = await loadImage(blob);
  try {
    let base = fitMegapixels(loaded.width, loaded.height, maxMegapixels);
    let quality = 0.9;
    let dimScale = 1;
    let best: Blob | null = null;

    for (let attempt = 0; attempt < 16; attempt++) {
      const width = Math.max(1, Math.floor(base.width * dimScale));
      const height = Math.max(1, Math.floor(base.height * dimScale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No se pudo procesar la imagen');
      ctx.drawImage(loaded.source, 0, 0, width, height);

      const out = await canvasToJpeg(canvas, quality);
      best = out;
      if (out.size <= maxBytes) return out;

      if (quality > 0.52) {
        quality = Math.max(0.52, quality - 0.08);
        continue;
      }
      if (dimScale > 0.4) {
        dimScale *= 0.82;
        quality = 0.84;
        continue;
      }
      break;
    }

    if (best) return best;
    throw new Error('No se pudo optimizar la foto.');
  } finally {
    loaded.cleanup();
  }
}

/** Prepara una foto: si pasa el máximo, la comprime automáticamente. */
export async function prepareImageForUpload(blob: Blob, label = 'La foto'): Promise<Blob> {
  const type = blob.type || '';
  if (!type.startsWith('image/')) {
    throw new Error(`${label}: solo se permiten imágenes.`);
  }

  const mp = await imageMegapixels(blob).catch(() => 0);
  const fitsSize = blob.size <= MAX_IMAGE_BYTES;
  const fitsMp = mp <= MAX_IMAGE_MEGAPIXELS + 0.05;
  if (fitsSize && fitsMp) return blob;

  try {
    return await compressImageToLimit(blob, MAX_IMAGE_BYTES, MAX_IMAGE_MEGAPIXELS);
  } catch {
    throw new Error(`${label} no pudo optimizarse. Prueba con otra imagen.`);
  }
}

export async function uploadUserAvatar(uid: string, blob: Blob, ext = 'jpg'): Promise<string> {
  const prepared = await prepareImageForUpload(blob, 'La foto de perfil');
  await ensureUserStorageFolder(uid).catch(() => undefined);
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
  const objectRef = ref(storage, `${userStorageFolder(uid)}/avatar/profile.${safeExt}`);
  await uploadBytes(objectRef, prepared, {
    contentType: prepared.type || 'image/jpeg',
  });
  return getDownloadURL(objectRef);
}

export async function uploadUserMedia(
  uid: string,
  file: Blob,
  name: string,
  visibility: MediaVisibility = 'private',
  kind: UserMediaStorageKind = 'publication',
): Promise<{ url: string; storagePath: string }> {
  const type = file.type || 'application/octet-stream';
  const isVideo = type.startsWith('video/');
  const isImage = type.startsWith('image/');
  if (!isVideo && !isImage) {
    throw new Error('Solo se permiten fotos o videos.');
  }

  let payload = file;
  if (isImage) {
    payload = await prepareImageForUpload(file, 'La foto');
  } else if (file.size > MAX_VIDEO_BYTES) {
    throw new Error('El video debe pesar menos de 50 MB.');
  }

  await ensureUserStorageFolder(uid).catch(() => undefined);
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || (isVideo ? 'clip.mp4' : 'photo.jpg');
  const storagePath = `${userMediaStorageFolder(uid, kind)}/${Date.now()}_${safeName}`;
  const objectRef = ref(storage, storagePath);
  const contentType = isImage ? payload.type || 'image/jpeg' : type;
  await uploadBytes(objectRef, payload, {
    contentType,
    customMetadata: { visibility, contentKind: kind },
  });
  const url = await getDownloadURL(objectRef);
  return { url, storagePath };
}

export async function updateStoredMediaVisibility(storagePath: string, visibility: MediaVisibility) {
  await updateMetadata(ref(storage, storagePath), { customMetadata: { visibility } });
}

export async function uploadChatMedia(uid: string, file: Blob, name: string): Promise<string> {
  const type = file.type || 'application/octet-stream';
  const isAudio = type.startsWith('audio/');
  const isImage = type.startsWith('image/');
  const isVideo = type.startsWith('video/');
  if (!isAudio && !isImage && !isVideo) {
    throw new Error('Solo foto, audio o video corto.');
  }

  let payload = file;
  if (isImage) {
    payload = await prepareImageForUpload(file, 'La foto');
  } else if (file.size > MAX_CHAT_FILE_BYTES) {
    throw new Error('El archivo debe pesar menos de 20 MB.');
  }

  await ensureUserStorageFolder(uid).catch(() => undefined);
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'adjunto';
  const objectRef = ref(storage, `${userStorageFolder(uid)}/chat/${Date.now()}_${safeName}`);
  await uploadBytes(objectRef, payload, { contentType: isImage ? payload.type || 'image/jpeg' : type });
  return getDownloadURL(objectRef);
}

/** Portada / foto del grupo (sube bajo users/{uid}/groups — permiso fiable). */
export async function uploadGroupCover(
  groupId: string,
  uid: string,
  blob: Blob,
  ext = 'jpg',
): Promise<string> {
  const prepared = await prepareImageForUpload(blob, 'La foto del grupo');
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
  await ensureUserStorageFolder(uid).catch(() => undefined);
  const contentType = prepared.type || 'image/jpeg';
  const objectRef = ref(storage, `${userStorageFolder(uid)}/groups/${groupId}_cover.${safeExt}`);
  await uploadBytes(objectRef, prepared, { contentType });
  return getDownloadURL(objectRef);
}

/** Foto enviada en el chat del grupo. */
export async function uploadGroupChatMedia(
  groupId: string,
  uid: string,
  file: Blob,
  name: string,
): Promise<string> {
  const type = file.type || 'application/octet-stream';
  if (!type.startsWith('image/')) throw new Error('Solo se permiten fotos en el chat del grupo.');
  const prepared = await prepareImageForUpload(file, 'La foto');
  await ensureUserStorageFolder(uid).catch(() => undefined);
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'foto.jpg';
  const objectRef = ref(
    storage,
    `${userStorageFolder(uid)}/groups/${groupId}_chat_${Date.now()}_${safeName}`,
  );
  await uploadBytes(objectRef, prepared, { contentType: prepared.type || 'image/jpeg' });
  return getDownloadURL(objectRef);
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export function isHttpUrl(value: string | null | undefined): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}
