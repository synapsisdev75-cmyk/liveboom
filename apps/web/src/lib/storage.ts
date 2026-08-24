import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export async function uploadUserAvatar(uid: string, blob: Blob, ext = 'jpg'): Promise<string> {
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error('La foto de perfil debe pesar menos de 8 MB.');
  }
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
  const objectRef = ref(storage, `avatars/${uid}/profile.${safeExt}`);
  await uploadBytes(objectRef, blob, { contentType: blob.type || `image/${safeExt}` });
  return getDownloadURL(objectRef);
}

export async function uploadUserMedia(uid: string, file: Blob, name: string): Promise<string> {
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

  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || (isVideo ? 'clip.mp4' : 'photo.jpg');
  const objectRef = ref(storage, `posts/${uid}/${Date.now()}_${safeName}`);
  await uploadBytes(objectRef, file, { contentType: type });
  return getDownloadURL(objectRef);
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
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'adjunto';
  const objectRef = ref(storage, `chat/${uid}/${Date.now()}_${safeName}`);
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
