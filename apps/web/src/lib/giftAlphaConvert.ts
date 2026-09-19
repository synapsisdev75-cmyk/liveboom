import { ref, uploadBytes } from 'firebase/storage';
import { ApiError, getApiBase } from './api';
import { auth, storage } from './firebase';
import { uploadCatalogAsset } from './catalogConfigFirestore';

export function needsAlphaMovConvert(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return name.endsWith('.mov') || type === 'video/quicktime' || type === 'video/x-quicktime';
}

async function convertStoredAlphaMov(storagePath: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'No hay sesión de Firebase');
  const jwt = await user.getIdToken();
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}/api/gifts/convert-alpha`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ storagePath }),
      signal: AbortSignal.timeout(180_000),
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar para convertir el MOV 4444.');
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string; url?: string };
  if (!response.ok || !data.url) {
    throw new ApiError(response.status || 500, data.error || 'No se pudo convertir el MOV 4444');
  }
  return data.url;
}

/** WebM/MP4 se suben igual. MOV ProRes 4444 con alpha se convierte a WebM VP9 yuva. */
export async function uploadGiftAnimation(giftId: string, file: File): Promise<string> {
  if (!needsAlphaMovConvert(file)) {
    return uploadCatalogAsset('gifts', `${giftId}-video`, file);
  }
  const storagePath = `config/gifts/${giftId}-video-${Date.now()}.mov`;
  await uploadBytes(ref(storage, storagePath), file, { contentType: 'video/quicktime' });
  return convertStoredAlphaMov(storagePath);
}
