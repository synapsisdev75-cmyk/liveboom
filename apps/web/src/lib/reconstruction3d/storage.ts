import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase';
import { userStorageFolder } from '../storage';

export const RECONSTRUCTION_STORAGE_FOLDER = 'reconstruccion-3d';

export function reconstructionStoragePath(uid: string, jobId: string, name: string) {
  const safeJob = jobId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'job';
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'asset.jpg';
  return `${userStorageFolder(uid)}/${RECONSTRUCTION_STORAGE_FOLDER}/${safeJob}/${safeName}`;
}

export async function uploadReconstructionAsset(
  uid: string,
  jobId: string,
  file: Blob,
  name: string,
): Promise<{ url: string; storagePath: string }> {
  const type = file.type || 'application/octet-stream';
  if (!type.startsWith('image/') && !type.startsWith('video/')) {
    throw new Error('Solo se permiten fotos o videos de reconstrucción.');
  }
  const storagePath = reconstructionStoragePath(uid, jobId, `${Date.now()}_${name}`);
  const objectRef = ref(storage, storagePath);
  await uploadBytes(objectRef, file, { contentType: type });
  const url = await getDownloadURL(objectRef);
  return { url, storagePath };
}

export async function deleteReconstructionAsset(storagePath: string) {
  try {
    await deleteObject(ref(storage, storagePath));
  } catch {
    /* ya no existe */
  }
}
