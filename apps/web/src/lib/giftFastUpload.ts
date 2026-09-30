import { ref, uploadBytesResumable } from 'firebase/storage';
import { auth, storage } from './firebase';

/** Trozo múltiplo de 256 KiB. El SDK de Storage usa 256 KiB y un MOV de cientos de MB se vuelve miles de peticiones. */
const CHUNK_BYTES = 8 * 1024 * 1024;

function mapUploadError(err: unknown): Error {
  const code = String((err as { code?: string } | null)?.code || '');
  const raw = err instanceof Error ? err.message : String(err || '');
  if (code === 'storage/unauthorized' || /storage\/unauthorized|unauthorized/i.test(raw)) {
    return new Error('Storage no autorizó la subida. Con la bóveda abierta, vuelve a soltar el WebM/MOV.');
  }
  return err instanceof Error ? err : new Error(raw || 'Error al subir el archivo');
}

async function uploadWithSdk(storagePath: string, file: File, contentType: string, onPct: (n: number) => void) {
  const task = uploadBytesResumable(ref(storage, storagePath), file, { contentType });
  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        const total = snap.totalBytes || file.size || 1;
        onPct(Math.min(100, Math.round((snap.bytesTransferred / total) * 100)));
      },
      (err) => reject(mapUploadError(err)),
      () => resolve(),
    );
  });
}

async function uploadInChunks(storagePath: string, file: File, contentType: string, onPct: (n: number) => void) {
  const user = auth.currentUser;
  if (!user) throw new Error('No hay sesión de Firebase');
  const bucket = storage.app.options.storageBucket;
  if (!bucket) throw new Error('Storage sin bucket');
  const token = await user.getIdToken();
  const start = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodeURIComponent(storagePath)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Firebase ${token}`,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(file.size),
        'X-Goog-Upload-Header-Content-Type': contentType,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ name: storagePath, contentType }),
    },
  );
  if (!start.ok) throw new Error(`No se pudo abrir la subida (${start.status})`);
  const uploadUrl = start.headers.get('X-Goog-Upload-URL') || start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('La subida no devolvió una sesión');

  let offset = 0;
  const total = file.size || 1;
  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_BYTES, file.size);
    const last = end >= file.size;
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': last ? 'upload, finalize' : 'upload',
        'X-Goog-Upload-Offset': String(offset),
        'Content-Type': 'application/octet-stream',
      },
      body: file.slice(offset, end),
    });
    if (!response.ok) throw new Error(`La subida se interrumpió (${response.status})`);
    offset = end;
    onPct(Math.min(100, Math.round((offset / total) * 100)));
  }
}

/** Sube un MOV/WebM grande en trozos de 8 MB. Si el protocolo rápido falla, usa el SDK. */
export async function uploadGiftFileFast(
  storagePath: string,
  file: File,
  contentType: string,
  onPct: (n: number) => void,
) {
  try {
    await uploadInChunks(storagePath, file, contentType, onPct);
  } catch (error) {
    if (/no hay sesión|sin bucket/i.test(error instanceof Error ? error.message : '')) throw error;
    await uploadWithSdk(storagePath, file, contentType, onPct);
  }
}
