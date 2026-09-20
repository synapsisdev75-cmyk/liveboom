import { ref, uploadBytesResumable } from 'firebase/storage';
import { ApiError, getApiBase } from './api';
import { auth, storage } from './firebase';
import { defaultGiftMedia, normalizeGiftMedia, type GiftMediaInfo } from './giftMedia';
import { GIFT_ANIM_LIMITS } from './giftAlphaConvert';

export type GiftBgJob = {
  jobId: string;
  giftId: string;
  status: string;
  stage: string;
  progressPercent: number | null;
  indeterminate?: boolean;
  warning?: string | null;
  error?: string | null;
  url?: string | null;
  hasAlpha?: boolean;
  hasAudio?: boolean;
  durationSec?: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
};

export function giftStoragePathFromUrl(url: string | undefined | null): string | null {
  const raw = String(url || '');
  const match = raw.match(/\/o\/([^?]+)/);
  const encoded = match?.[1];
  if (!encoded) return null;
  const decoded = decodeURIComponent(encoded);
  if (!decoded.startsWith('config/gifts/')) return null;
  if (decoded.includes('..')) return null;
  return decoded;
}

async function authFetch<T>(path: string, init: RequestInit = {}, timeoutMs = 40_000): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'No hay sesión de Firebase');
  const jwt = await user.getIdToken();
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor de regalos.');
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new ApiError(response.status || 500, data.error || 'Error en el servidor de regalos');
  }
  return data;
}

function uploadResumable(storagePath: string, file: File, contentType: string, onPct: (n: number) => void) {
  const storageRef = ref(storage, storagePath);
  const task = uploadBytesResumable(storageRef, file, { contentType });
  return new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        const total = snap.totalBytes || file.size || 1;
        onPct(Math.min(100, Math.round((snap.bytesTransferred / total) * 100)));
      },
      reject,
      () => resolve(),
    );
  });
}

function contentTypeFor(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.webm')) return 'video/webm';
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.mov')) return 'video/quicktime';
  return 'application/octet-stream';
}

export async function inspectGiftStorageMedia(storagePath: string): Promise<GiftMediaInfo> {
  const data = await authFetch<{ media: Record<string, unknown> }>(
    '/api/gifts/media/inspect',
    { method: 'POST', body: JSON.stringify({ storagePath }) },
    60_000,
  );
  return normalizeGiftMedia({
    ...defaultGiftMedia(),
    ...data.media,
    originalAsset: null,
    processedAsset: null,
    processingStatus: 'ready',
  });
}

export async function uploadGiftSource(
  giftId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ url: string; storagePath: string; media: GiftMediaInfo }> {
  if (file.size > GIFT_ANIM_LIMITS.maxBytes) {
    throw new ApiError(400, `El archivo supera ${Math.round(GIFT_ANIM_LIMITS.maxBytes / (1024 * 1024))} MB`);
  }
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
  const storagePath = `config/gifts/${giftId}-original-${Date.now()}.${ext}`;
  await uploadResumable(storagePath, file, contentTypeFor(file), (pct) => onProgress?.(pct));
  const inspected = await inspectGiftStorageMedia(storagePath);
  const token = await auth.currentUser?.getIdToken();
  void token;
  const { getDownloadURL } = await import('firebase/storage');
  const url = await getDownloadURL(ref(storage, storagePath));
  return {
    url,
    storagePath,
    media: {
      ...inspected,
      originalAsset: url,
      processedAsset: null,
      backgroundRemoved: false,
      processingStatus: 'ready',
    },
  };
}

async function pollBgJob(jobId: string, onProgress?: (job: GiftBgJob) => void): Promise<GiftBgJob> {
  const started = Date.now();
  for (;;) {
    const data = await authFetch<{ job: GiftBgJob }>(
      `/api/gifts/bg-remove/jobs/${encodeURIComponent(jobId)}`,
      { method: 'GET' },
    );
    const job = data.job;
    onProgress?.(job);
    if (job.status === 'done' && job.url) return job;
    if (job.status === 'failed') {
      throw new ApiError(400, job.error || 'No se pudo quitar el fondo. El archivo original sigue disponible.');
    }
    if (Date.now() - started > 14 * 60_000) {
      throw new ApiError(0, 'Quitar fondo sigue en el servidor. Vuelve a abrir el regalo.');
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
}

export async function startGiftBackgroundRemove(
  giftId: string,
  storagePath: string,
  opts?: { mode?: 'auto' | 'adjust'; similarity?: number; blend?: number; fileName?: string; onProgress?: (job: GiftBgJob) => void },
): Promise<GiftBgJob> {
  const nonce =
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${giftId}-${Date.now()}`;
  const started = await authFetch<{ job: GiftBgJob }>('/api/gifts/bg-remove/jobs', {
    method: 'POST',
    body: JSON.stringify({
      storagePath,
      giftId,
      fileName: opts?.fileName || '',
      clientNonce: nonce,
      mode: opts?.mode || 'auto',
      similarity: opts?.similarity,
      blend: opts?.blend,
    }),
  });
  return pollBgJob(started.job.jobId, opts?.onProgress);
}

export async function retryGiftBackgroundRemove(
  jobId: string,
  onProgress?: (job: GiftBgJob) => void,
): Promise<GiftBgJob> {
  const started = await authFetch<{ job: GiftBgJob }>(
    `/api/gifts/bg-remove/jobs/${encodeURIComponent(jobId)}/retry`,
    { method: 'POST', body: '{}' },
  );
  return pollBgJob(started.job.jobId, onProgress);
}

export async function deleteGiftPermanentlyApi(giftId: string) {
  return authFetch<{ ok: boolean; giftId: string; version: number }>(
    `/api/gifts/catalog/${encodeURIComponent(giftId)}/delete`,
    { method: 'POST', body: '{}' },
    60_000,
  );
}
