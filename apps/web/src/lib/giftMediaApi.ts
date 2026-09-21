import { ref, uploadBytesResumable } from 'firebase/storage';
import { ApiError, getApiBase } from './api';
import { auth, storage } from './firebase';
import { defaultGiftMedia, normalizeGiftMedia, type GiftMediaInfo } from './giftMedia';
import {
  fetchGiftAlphaJob,
  GIFT_ANIM_LIMITS,
  giftAlphaStageLabel,
  rememberGiftAlphaJob,
  type GiftAlphaJob,
  type GiftAnimProgress,
} from './giftAlphaConvert';

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
  alphaUsable?: boolean | null;
  preservedOriginal?: boolean;
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

function mapGiftStorageError(err: unknown): Error {
  const code = String((err as { code?: string } | null)?.code || '');
  const raw = err instanceof Error ? err.message : String(err || '');
  if (code === 'storage/unauthorized' || /storage\/unauthorized/i.test(raw)) {
    return new Error(
      'Storage no autorizó la subida. Con la bóveda abierta, vuelve a soltar el WebM/MOV.',
    );
  }
  return err instanceof Error ? err : new Error(raw || 'Error al subir el archivo');
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
      (err) => reject(mapGiftStorageError(err)),
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
  opts?: { skipInspect?: boolean },
): Promise<{ url: string; storagePath: string; media: GiftMediaInfo }> {
  if (file.size > GIFT_ANIM_LIMITS.maxBytes && !/\.mov$/i.test(file.name)) {
    throw new ApiError(400, `El archivo supera ${Math.round(GIFT_ANIM_LIMITS.maxBytes / (1024 * 1024))} MB`);
  }
  if (file.size > GIFT_ANIM_LIMITS.maxMovBytes) {
    throw new ApiError(400, `El archivo supera ${Math.round(GIFT_ANIM_LIMITS.maxMovBytes / (1024 * 1024))} MB`);
  }
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
  const storagePath = `config/gifts/${giftId}-original-${Date.now()}.${ext}`;
  await uploadResumable(storagePath, file, contentTypeFor(file), (pct) => onProgress?.(pct));
  const { getDownloadURL } = await import('firebase/storage');
  const url = await getDownloadURL(ref(storage, storagePath));
  if (opts?.skipInspect) {
    return {
      url,
      storagePath,
      media: {
        ...defaultGiftMedia(),
        originalAsset: url,
        processedAsset: null,
        backgroundRemoved: false,
        processingStatus: 'uploading',
      },
    };
  }
  const inspected = await inspectGiftStorageMedia(storagePath);
  return {
    url,
    storagePath,
    media: {
      ...inspected,
      hasAlpha: Boolean(inspected.hasAlpha),
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

export type GiftIngestDecision = {
  action: 'ready' | 'convert-alpha' | 'bg-remove' | 'review';
  reason: string;
  message: string;
};

export type GiftIngestResult = {
  url: string;
  originalUrl: string;
  storagePath: string;
  media: GiftMediaInfo;
  decision: GiftIngestDecision;
  job?: GiftAlphaJob | GiftBgJob | null;
};

async function pollAlphaJob(jobId: string, onProgress?: (job: GiftAlphaJob) => void): Promise<GiftAlphaJob> {
  const started = Date.now();
  for (;;) {
    const job = await fetchGiftAlphaJob(jobId);
    onProgress?.(job);
    if (job.status === 'done' && job.url) return job;
    if (job.status === 'failed') {
      throw new ApiError(400, job.error || 'No se pudo convertir la animación. El original se conservó.');
    }
    if (Date.now() - started > 14 * 60_000) {
      throw new ApiError(0, 'La conversión sigue en el servidor. Vuelve a abrir el regalo.');
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
}

function mediaFromInspect(
  base: GiftMediaInfo,
  extra: Record<string, unknown>,
  originalUrl: string,
  processedUrl: string | null,
): GiftMediaInfo {
  return normalizeGiftMedia({
    ...base,
    ...extra,
    originalAsset: originalUrl,
    processedAsset: processedUrl,
    processingStatus: extra.needsReview ? 'ready' : processedUrl ? 'ready' : extra.processingStatus || 'ready',
  });
}

/**
 * Sube el original, inspecciona y aplica el pipeline universal (convertir / croma / revisión).
 * No publica el catálogo: el admin sigue pulsando Publicar.
 */
export async function ingestUploadedGiftAnimation(
  giftId: string,
  file: File,
  onProgress?: (progress: GiftAnimProgress) => void,
): Promise<GiftIngestResult> {
  const fileName = file.name || 'animacion';
  const fileBytes = file.size || 0;
  const emit = (partial: Partial<GiftAnimProgress> & { stage: GiftAnimProgress['stage'] }) => {
    onProgress?.({
      fileName,
      fileBytes,
      percent: null,
      indeterminate: partial.percent == null,
      warning: null,
      error: null,
      label: partial.label || giftAlphaStageLabel(partial.stage, partial.percent ?? null),
      ...partial,
    });
  };

  emit({ stage: 'uploading', percent: 0, indeterminate: false, label: 'Subiendo original…' });
  const uploaded = await uploadGiftSource(giftId, file, (percent) => {
    emit({
      stage: 'uploading',
      percent,
      indeterminate: false,
      label: `Subiendo original… ${percent}%`,
    });
  }, { skipInspect: true });

  emit({ stage: 'analyzing' as GiftAnimProgress['stage'], percent: null, indeterminate: true, label: 'Inspeccionando animación…' });
  const nonce =
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${giftId}-${Date.now()}`;
  const started = await authFetch<{
    decision: GiftIngestDecision;
    jobKind: 'alpha' | 'bg' | null;
    job: GiftAlphaJob | GiftBgJob | null;
    media: Record<string, unknown>;
    sourcePath: string;
  }>(
    '/api/gifts/ingest',
    {
      method: 'POST',
      body: JSON.stringify({
        storagePath: uploaded.storagePath,
        giftId,
        fileName,
        clientNonce: nonce,
      }),
    },
    90_000,
  );

  const decision = started.decision;
  const inspectMedia = mediaFromInspect(
    uploaded.media,
    started.media || {},
    uploaded.url,
    null,
  );

  if (decision.action === 'ready') {
    emit({ stage: 'done', percent: 100, indeterminate: false, label: decision.message });
    return {
      url: uploaded.url,
      originalUrl: uploaded.url,
      storagePath: uploaded.storagePath,
      media: mediaFromInspect(inspectMedia, { ...started.media, hasAlpha: true, processingStatus: 'ready' }, uploaded.url, uploaded.url),
      decision,
      job: null,
    };
  }

  if (decision.action === 'review' || !started.jobKind || !started.job) {
    emit({
      stage: 'done',
      percent: 100,
      indeterminate: false,
      warning: decision.message,
      label: 'Revisión del administrador',
    });
    return {
      url: uploaded.url,
      originalUrl: uploaded.url,
      storagePath: uploaded.storagePath,
      media: mediaFromInspect(inspectMedia, { ...started.media, needsReview: true }, uploaded.url, null),
      decision,
      job: null,
    };
  }

  if (started.jobKind === 'alpha') {
    const jobId = started.job.jobId;
    rememberGiftAlphaJob(giftId, jobId);
    const job = await pollAlphaJob(jobId, (next) => {
      const stage = (next.stage || 'queued') as GiftAnimProgress['stage'];
      emit({
        stage: stage === 'failed' ? 'failed' : stage,
        percent: next.progressPercent,
        indeterminate: Boolean(next.indeterminate) || next.progressPercent == null,
        warning: next.warning,
        error: next.error,
        label: giftAlphaStageLabel(stage, next.progressPercent),
      });
    });
    if (!job.url) throw new ApiError(500, 'La conversión no devolvió video. El original se conservó.');
    emit({ stage: 'done', percent: 100, indeterminate: false, warning: job.warning, label: decision.message });
    return {
      url: job.url,
      originalUrl: uploaded.url,
      storagePath: uploaded.storagePath,
      media: mediaFromInspect(
        inspectMedia,
        {
          ...started.media,
          hasAudio: job.hasAudio !== false,
          hasAlpha: Boolean(job.hasAlpha),
          alphaUsable: job.alphaUsable == null ? null : Boolean(job.alphaUsable),
          alphaWarning: job.warning || started.media?.alphaWarning || null,
          duration: job.durationSec || inspectMedia.duration,
          width: job.width || inspectMedia.width,
          height: job.height || inspectMedia.height,
          backgroundRemoved: false,
          needsReview: false,
          processingStatus: 'ready',
        },
        uploaded.url,
        job.url,
      ),
      decision,
      job,
    };
  }

  const bgJob = await pollBgJob(started.job.jobId, (next) => {
    emit({
      stage: next.stage === 'failed' ? 'failed' : next.stage === 'done' ? 'done' : 'converting',
      percent: next.progressPercent,
      indeterminate: Boolean(next.indeterminate) || next.progressPercent == null,
      warning: next.warning,
      error: next.error,
      label:
        next.stage === 'done'
          ? 'Fondo listo.'
          : `Quitando fondo… ${next.progressPercent ?? ''}`.trim(),
    });
  });
  if (!bgJob.url) throw new ApiError(400, 'No se pudo quitar el fondo. El original se conservó.');
  const preserved = Boolean(bgJob.preservedOriginal);
  emit({ stage: 'done', percent: 100, indeterminate: false, warning: bgJob.warning, label: decision.message });
  return {
    url: preserved ? uploaded.url : bgJob.url,
    originalUrl: uploaded.url,
    storagePath: uploaded.storagePath,
    media: mediaFromInspect(
      inspectMedia,
      {
        ...started.media,
        hasAudio: Boolean(bgJob.hasAudio || inspectMedia.hasAudio),
        hasAlpha: bgJob.hasAlpha !== false,
        alphaUsable: bgJob.alphaUsable == null ? true : Boolean(bgJob.alphaUsable),
        alphaWarning: bgJob.warning || null,
        duration: bgJob.durationSec || inspectMedia.duration,
        width: bgJob.width || inspectMedia.width,
        height: bgJob.height || inspectMedia.height,
        fps: bgJob.fps || inspectMedia.fps,
        codec: bgJob.codec || inspectMedia.codec,
        backgroundRemoved: !preserved,
        needsReview: preserved,
        processingStatus: 'ready',
      },
      uploaded.url,
      preserved ? null : bgJob.url,
    ),
    decision,
    job: bgJob,
  };
}

export async function deleteGiftPermanentlyApi(giftId: string) {
  return authFetch<{ ok: boolean; giftId: string; version: number }>(
    `/api/gifts/catalog/${encodeURIComponent(giftId)}/delete`,
    { method: 'POST', body: '{}' },
    60_000,
  );
}
