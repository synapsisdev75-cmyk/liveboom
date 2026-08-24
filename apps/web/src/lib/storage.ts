import { getDownloadURL, ref, updateMetadata, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export type MediaVisibility = 'public' | 'friends' | 'private';

export function userStorageFolder(uid: string) {
  return `users/${uid}`;
}

export async function ensureUserStorageFolder(uid: string): Promise<void> {
  const objectRef = ref(storage, `${userStorageFolder(uid)}/.keep`);
  await uploadBytes(objectRef, new Blob(['liveboom'], { type: 'text/plain' }), {
    contentType: 'text/plain',
  });
}

export async function uploadUserAvatar(uid: string, blob: Blob, ext = 'jpg'): Promise<string> {
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error('La foto de perfil debe pesar menos de 8 MB.');
  }
  await ensureUserStorageFolder(uid).catch(() => undefined);
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
  const objectRef = ref(storage, `${userStorageFolder(uid)}/avatar/profile.${safeExt}`);
  await uploadBytes(objectRef, blob, { contentType: blob.type || `image/${safeExt}` });
  return getDownloadURL(objectRef);
}

export async function uploadUserMedia(
  uid: string,
  file: Blob,
  name: string,
  visibility: MediaVisibility = 'private',
): Promise<{ url: string; storagePath: string }> {
  const type = file.type || 'application/octet-stream';
  const isVideo = type.startsWith('video/');
  const isImage = type.startsWith('image/');
  if (!isVideo && !isImage) {
    throw new Error('Solo se permiten fotos o videos.');
  }
  if (isImage && file.size > MAX_IMAGE_BYTES) {
    throw new Error('La foto debe pesar menos de 8 MB.');
  }
  if (isVideo && file.size > MAX_VIDEO_BYTES) {
    throw new Error('El video debe pesar menos de 50 MB.');
  }

  await ensureUserStorageFolder(uid).catch(() => undefined);
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || (isVideo ? 'clip.mp4' : 'photo.jpg');
  const storagePath = `${userStorageFolder(uid)}/posts/${Date.now()}_${safeName}`;
  const objectRef = ref(storage, storagePath);
  await uploadBytes(objectRef, file, {
    contentType: type,
    customMetadata: { visibility },
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
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('El archivo debe pesar menos de 12 MB.');
  }
  await ensureUserStorageFolder(uid).catch(() => undefined);
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'adjunto';
  const objectRef = ref(storage, `${userStorageFolder(uid)}/chat/${Date.now()}_${safeName}`);
  await uploadBytes(objectRef, file, { contentType: type });
  return getDownloadURL(objectRef);
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export function isHttpUrl(value: string | null | undefined): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}
