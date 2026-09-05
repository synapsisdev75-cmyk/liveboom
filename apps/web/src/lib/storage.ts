import { getDownloadURL, ref, updateMetadata, uploadBytes, uploadBytesResumable } from 'firebase/storage';
import { mimeFromFileName } from './chatAttachments';
import { storage } from './firebase';

/** Peso máximo de fotos tras optimización. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** Resolución máxima objetivo: 20 megapíxeles (ancho × alto). */
export const MAX_IMAGE_MEGAPIXELS = 20;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_CHAT_FILE_BYTES = 25 * 1024 * 1024;

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

const ensuredUserFolders = new Set<string>();
const ensuringUserFolders = new Map<string, Promise<void>>();

export async function ensureUserStorageFolder(uid: string): Promise<void> {
  if (!uid || ensuredUserFolders.has(uid)) return;
  const pending = ensuringUserFolders.get(uid);
  if (pending) return pending;

  const base = userStorageFolder(uid);
  const paths = [
    `${base}/.keep`,
    ...Object.values(USER_MEDIA_FOLDERS).map((folder) => `${base}/${folder}/.keep`),
  ];
  const task = Promise.all(
    paths.map((path) =>
      uploadBytes(ref(storage, path), new Blob(['liveboom'], { type: 'text/plain' }), {
        contentType: 'text/plain',
      }).catch(() => undefined),
    ),
  )
    .then(() => {
      ensuredUserFolders.add(uid);
    })
    .catch(() => undefined)
    .finally(() => {
      ensuringUserFolders.delete(uid);
    });
  ensuringUserFolders.set(uid, task);
  return task;
}

type ImageUploadBudget = {
  maxEdge: number;
  quality: number;
  maxBytes: number;
};

/** Calidad/peso según red: archivos más livianos = subida más corta. */
function imageUploadBudget(): ImageUploadBudget {
  try {
    const connection = (
      navigator as Navigator & {
        connection?: { effectiveType?: string; saveData?: boolean; downlink?: number };
      }
    ).connection;
    if (connection?.saveData) {
      return { maxEdge: 1080, quality: 0.7, maxBytes: 550_000 };
    }
    const type = connection?.effectiveType;
    const downlink = connection?.downlink;
    if (type === 'slow-2g' || type === '2g') {
      return { maxEdge: 1080, quality: 0.7, maxBytes: 550_000 };
    }
    if (type === '3g' || (typeof downlink === 'number' && downlink > 0 && downlink < 1.5)) {
      return { maxEdge: 1440, quality: 0.76, maxBytes: 900_000 };
    }
  } catch {
    /* Network Information API no está en todos los navegadores. */
  }
  return { maxEdge: 1920, quality: 0.82, maxBytes: 1_500_000 };
}

function canSkipImageReencode(
  blob: Blob,
  width: number,
  height: number,
  budget: ImageUploadBudget,
): boolean {
  const type = (blob.type || '').toLowerCase();
  if (type !== 'image/jpeg' && type !== 'image/jpg' && type !== 'image/webp') return false;
  return blob.size <= budget.maxBytes && Math.max(width, height) <= budget.maxEdge + 16;
}

type LoadedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

async function loadImage(blob: Blob): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(() =>
      createImageBitmap(blob),
    );
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

/** Normaliza orientación EXIF aplicando createImageBitmap y re-encode JPEG. */
export async function normalizeImageOrientation(blob: Blob): Promise<Blob> {
  const loaded = await loadImage(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = loaded.width;
    canvas.height = loaded.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(loaded.source, 0, 0, loaded.width, loaded.height);
    return await canvasToJpeg(canvas, 0.92);
  } finally {
    loaded.cleanup();
  }
}

/** Prepara una foto: un solo pase a resolución de feed (o se omite si ya es liviana). */
export async function prepareImageForUpload(blob: Blob, label = 'La foto'): Promise<Blob> {
  const type = blob.type || '';
  if (!type.startsWith('image/')) {
    throw new Error(`${label}: solo se permiten imágenes.`);
  }
  if (blob.size > MAX_IMAGE_BYTES * 3) {
    throw new Error(`${label} pesa demasiado. Prueba con otra imagen.`);
  }

  const budget = imageUploadBudget();
  let loaded: LoadedImage;
  try {
    loaded = await loadImage(blob);
  } catch {
    if (blob.size <= MAX_IMAGE_BYTES) return blob;
    throw new Error(`${label} no pudo optimizarse. Prueba con otra imagen.`);
  }

  try {
    if (canSkipImageReencode(blob, loaded.width, loaded.height, budget)) {
      return blob;
    }

    const longEdge = Math.max(loaded.width, loaded.height);
    const edgeScale = longEdge > budget.maxEdge ? budget.maxEdge / longEdge : 1;
    const fitted = fitMegapixels(
      Math.max(1, Math.round(loaded.width * edgeScale)),
      Math.max(1, Math.round(loaded.height * edgeScale)),
      MAX_IMAGE_MEGAPIXELS,
    );

    let quality = budget.quality;
    let width = fitted.width;
    let height = fitted.height;
    let best: Blob | null = null;

    for (let attempt = 0; attempt < 4; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No se pudo procesar la imagen');
      ctx.drawImage(loaded.source, 0, 0, width, height);
      const out = await canvasToJpeg(canvas, quality);
      best = out;
      if (out.size <= budget.maxBytes) return out;
      if (quality > 0.62) {
        quality = Math.max(0.62, quality - 0.1);
        continue;
      }
      width = Math.max(1, Math.floor(width * 0.85));
      height = Math.max(1, Math.floor(height * 0.85));
      quality = budget.quality;
    }

    if (best && best.size <= MAX_IMAGE_BYTES) return best;
    if (blob.size <= MAX_IMAGE_BYTES && (type === 'image/jpeg' || type === 'image/webp')) {
      return blob;
    }
    throw new Error(`${label} no pudo optimizarse. Prueba con otra imagen.`);
  } finally {
    loaded.cleanup();
  }
}

export async function uploadUserAvatar(uid: string, blob: Blob, ext = 'jpg'): Promise<string> {
  const prepared = await prepareImageForUpload(blob, 'La foto de perfil');
  void ensureUserStorageFolder(uid);
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

  void ensureUserStorageFolder(uid);
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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await mapper(item, index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, () => worker()),
  );
  return results;
}

/** Varias fotos en paralelo (máx. 2 a la vez para no saturar CPU/RAM del teléfono). */
export async function uploadUserMediaMany(
  uid: string,
  files: File[],
  visibility: MediaVisibility = 'private',
  kind: UserMediaStorageKind = 'publication',
  concurrency = 2,
): Promise<Array<{ url: string; storagePath: string }>> {
  return mapWithConcurrency(files, concurrency, (file, index) =>
    uploadUserMedia(uid, file, file.name || `photo_${index + 1}.jpg`, visibility, kind),
  );
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
    throw new Error(`El archivo debe pesar menos de ${Math.round(MAX_CHAT_FILE_BYTES / (1024 * 1024))} MB.`);
  }

  void ensureUserStorageFolder(uid);
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'adjunto';
  const objectRef = ref(storage, `${userStorageFolder(uid)}/chat/${Date.now()}_${safeName}`);
  await uploadBytes(objectRef, payload, { contentType: isImage ? payload.type || 'image/jpeg' : type });
  return getDownloadURL(objectRef);
}

export type ChatUploadResult = {
  url: string;
  storagePath: string;
};

function storageErrorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/** Conserva la extensión real (.docx, .pdf) aunque el nombre tenga acentos o sea largo. */
function chatObjectFileName(name: string): string {
  const trimmed = name.trim() || 'archivo';
  const dot = trimmed.lastIndexOf('.');
  const ext =
    dot > 0 ? trimmed.slice(dot).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 8).toLowerCase() : '';
  const stemSource = (dot > 0 ? trimmed.slice(0, dot) : trimmed)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 60);
  const stem = stemSource || 'archivo';
  return ext && ext !== '.' ? `${stem}${ext}` : stem;
}

function resolveChatUploadMime(name: string, file: Blob, mime?: string): string {
  if (mime && mime !== 'application/octet-stream') return mime;
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  return mimeFromFileName(name) || mime || file.type || 'application/octet-stream';
}

async function uploadChatObject(
  path: string,
  file: Blob,
  contentType: string,
  onProgress?: (pct: number) => void,
): Promise<ChatUploadResult> {
  const objectRef = ref(storage, path);
  if (onProgress) {
    const task = uploadBytesResumable(objectRef, file, { contentType });
    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (snap) => {
          const total = snap.totalBytes || file.size || 1;
          onProgress(Math.min(100, Math.round((snap.bytesTransferred / total) * 100)));
        },
        reject,
        () => resolve(),
      );
    });
  } else {
    await uploadBytes(objectRef, file, { contentType });
  }
  const url = await getDownloadURL(objectRef);
  return { url, storagePath: path };
}

/** Adjunto genérico de chat (documentos + media). No altera uploadChatMedia. */
export async function uploadChatAttachment(
  uid: string,
  file: Blob,
  name: string,
  mime?: string,
  opts?: {
    chatId?: string | null;
    onProgress?: (pct: number) => void;
  },
): Promise<ChatUploadResult> {
  const type = resolveChatUploadMime(name, file, mime);
  if (file.size > MAX_CHAT_FILE_BYTES) {
    throw new Error(`El archivo supera el límite de ${Math.round(MAX_CHAT_FILE_BYTES / (1024 * 1024))} MB.`);
  }
  const safeName = chatObjectFileName(name);
  const fileId = `${Date.now()}_${safeName}`;
  const conversationId = opts?.chatId || '';

  const tryUserFolder = async () => {
    void ensureUserStorageFolder(uid);
    return uploadChatObject(
      `${userStorageFolder(uid)}/chat/${fileId}`,
      file,
      type,
      opts?.onProgress,
    );
  };

  if (conversationId) {
    try {
      return await uploadChatObject(
        `chats/${conversationId}/files/${fileId}`,
        file,
        type,
        opts?.onProgress,
      );
    } catch (err) {
      const code = storageErrorCode(err);
      console.error('[ChatUpload ERROR]', {
        conversationId,
        stage: 'upload-conversation',
        code,
      });
      if (code !== 'storage/unauthorized') throw err;
      return tryUserFolder();
    }
  }

  return tryUserFolder();
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
  void ensureUserStorageFolder(uid);
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
  void ensureUserStorageFolder(uid);
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
