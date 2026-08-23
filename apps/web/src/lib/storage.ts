import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';

export async function uploadUserAvatar(uid: string, blob: Blob, ext = 'jpg'): Promise<string> {
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
  const objectRef = ref(storage, `avatars/${uid}/profile.${safeExt}`);
  await uploadBytes(objectRef, blob, { contentType: blob.type || `image/${safeExt}` });
  return getDownloadURL(objectRef);
}

export async function uploadUserMedia(uid: string, blob: Blob, name: string): Promise<string> {
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const objectRef = ref(storage, `posts/${uid}/${Date.now()}_${safeName}`);
  await uploadBytes(objectRef, blob, { contentType: blob.type || 'application/octet-stream' });
  return getDownloadURL(objectRef);
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export function isHttpUrl(value: string | null | undefined): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}
