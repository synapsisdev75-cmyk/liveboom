import { ref, uploadBytesResumable } from 'firebase/storage';
import { ApiError, getApiBase } from './api';
import { auth, storage } from './firebase';
import { uploadCatalogAsset } from './catalogConfigFirestore';

export const GIFT_ANIM_LIMITS = {
  maxBytes: 80 * 1024 * 1024,
  maxDurationSec: 30,
  maxEdge: 1080,
} as const;

const SESSION_KEY = 'lb-gift-alpha-jobs';

export type GiftAlphaStage =
  | 'uploading'
  | 'queued'
  | 'analyzing'
  | 'converting'
  | 'verifying'
  | 'saving'
  | 'done'
  | 'failed';

export type GiftAlphaJob = {
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
  alphaUsable?: boolean;
  profile?: string | null;
  durationSec?: number;
  width?: number;
  height?: number;
  sourceBytes?: number;
  fileName?: string | null;
};

export type GiftAnimProgress = {
  stage: GiftAlphaStage;
  label: string;
  percent: number | null;
  indeterminate: boolean;
  fileName?: string;
  fileBytes?: number;
  warning?: string | null;
  error?: string | null;
};

function rememberJob(giftId: string, jobId: string) {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[giftId] = jobId;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function rememberedGiftAlphaJobId(giftId: string): string | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return map[giftId] || null;
  } catch {
    return null;
  }
}

export function forgetGiftAlphaJob(giftId: string) {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    delete map[giftId];
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function formatGiftAnimBytes(bytes: number): string {
  if (!(bytes > 0)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function giftAnimLimitsHint(): string {
  const mb = Math.round(GIFT_ANIM_LIMITS.maxBytes / (1024 * 1024));
  return `Límite: ${mb} MB · hasta ${GIFT_ANIM_LIMITS.maxDurationSec} s · máx. ${GIFT_ANIM_LIMITS.maxEdge}p`;
}

export function needsAlphaMovConvert(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return (
    name.endsWith('.mov') ||
    type === 'video/quicktime' ||
    type === 'video/x-quicktime'
  );
}

export function isGiftAnimationFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  if (name.endsWith('.webm') || name.endsWith('.mp4') || name.endsWith('.mov')) return true;
  return (
    type === 'video/webm' ||
    type === 'video/mp4' ||
    type === 'video/quicktime' ||
    type === 'video/x-quicktime'
  );
}

export function giftAlphaStageLabel(stage: string, percent: number | null): string {
  if (stage === 'uploading') {
    return percent != null ? `Subiendo archivo… ${percent}%` : 'Subiendo archivo…';
  }
  if (stage === 'analyzing') return 'Analizando archivo…';
  if (stage === 'queued') return 'En cola…';
  if (stage === 'converting') {
    return percent != null ? `Convirtiendo a WebM… ${percent}%` : 'Convirtiendo a WebM…';
  }
  if (stage === 'verifying') return 'Verificando resultado…';
  if (stage === 'saving') return 'Guardando animación…';
  if (stage === 'done') return 'Animación lista.';
  if (stage === 'failed') return 'Error al convertir';
  return 'Procesando…';
}

async function authFetch<T>(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
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
    throw new ApiError(0, 'No se pudo conectar para convertir el MOV 4444.');
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new ApiError(response.status || 500, data.error || 'No se pudo convertir el MOV 4444');
  }
  return data;
}

export async function fetchGiftAlphaJob(jobId: string): Promise<GiftAlphaJob> {
  const data = await authFetch<{ job: GiftAlphaJob }>(
    `/api/gifts/convert-alpha/jobs/${encodeURIComponent(jobId)}`,
    { method: 'GET' },
  );
  return data.job;
}

export async function fetchLatestGiftAlphaJob(giftId: string): Promise<GiftAlphaJob | null> {
  try {
    const data = await authFetch<{ job: GiftAlphaJob | null }>(
      `/api/gifts/convert-alpha/gifts/${encodeURIComponent(giftId)}`,
      { method: 'GET' },
    );
    return data.job || null;
  } catch {
    return null;
  }
}

async function pollGiftAlphaJob(
  jobId: string,
  onProgress?: (job: GiftAlphaJob) => void,
): Promise<GiftAlphaJob> {
  const started = Date.now();
  for (;;) {
    const job = await fetchGiftAlphaJob(jobId);
    onProgress?.(job);
    if (job.status === 'done' && job.url) return job;
    if (job.status === 'failed') {
      throw new ApiError(400, job.error || 'No se pudo convertir el MOV 4444');
    }
    if (Date.now() - started > 14 * 60_000) {
      throw new ApiError(0, 'La conversión sigue en el servidor. Vuelve a abrir el regalo para ver el avance.');
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
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

export async function retryGiftAlphaJob(
  jobId: string,
  onProgress?: (job: GiftAlphaJob) => void,
): Promise<GiftAlphaJob> {
  const data = await authFetch<{ job: GiftAlphaJob }>(
    `/api/gifts/convert-alpha/jobs/${encodeURIComponent(jobId)}/retry`,
    { method: 'POST', body: '{}' },
  );
  rememberJob(data.job.giftId, data.job.jobId);
  return pollGiftAlphaJob(data.job.jobId, onProgress);
}

/** WebM/MP4 se suben igual. MOV ProRes 4444 con alpha se convierte a WebM VP9 yuva. */
export async function uploadGiftAnimation(
  giftId: string,
  file: File,
  onProgress?: (progress: GiftAnimProgress) => void,
): Promise<{ url: string; job?: GiftAlphaJob }> {
  const fileName = file.name || 'animacion.mov';
  const fileBytes = file.size || 0;
  const emit = (partial: Partial<GiftAnimProgress> & { stage: GiftAlphaStage }) => {
    onProgress?.({
      fileName,
      fileBytes,
      percent: null,
      indeterminate: partial.percent == null,
      warning: null,
      error: null,
      label: giftAlphaStageLabel(partial.stage, partial.percent ?? null),
      ...partial,
    });
  };

  if (fileBytes > GIFT_ANIM_LIMITS.maxBytes) {
    throw new ApiError(
      400,
      `El archivo supera ${Math.round(GIFT_ANIM_LIMITS.maxBytes / (1024 * 1024))} MB`,
    );
  }

  if (!needsAlphaMovConvert(file)) {
    emit({ stage: 'uploading', percent: 0, indeterminate: false });
    const url = await uploadCatalogAsset('gifts', `${giftId}-video`, file);
    emit({ stage: 'done', percent: 100, indeterminate: false });
    return { url };
  }

  const nonce =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${giftId}-${Date.now()}`;
  const storagePath = `config/gifts/${giftId}-video-${Date.now()}-${nonce.slice(0, 8)}.mov`;
  emit({ stage: 'uploading', percent: 0, indeterminate: false });
  await uploadResumable(storagePath, file, 'video/quicktime', (pct) => {
    emit({ stage: 'uploading', percent: pct, indeterminate: false });
  });

  emit({ stage: 'queued', percent: null, indeterminate: true });
  const started = await authFetch<{ job: GiftAlphaJob }>(
    '/api/gifts/convert-alpha/jobs',
    {
      method: 'POST',
      body: JSON.stringify({
        storagePath,
        giftId,
        fileName,
        clientNonce: nonce,
        keepAudio: true,
      }),
    },
  );
  rememberJob(giftId, started.job.jobId);
  const job = await pollGiftAlphaJob(started.job.jobId, (next) => {
    const stage = (next.stage || 'queued') as GiftAlphaStage;
    emit({
      stage: stage === 'failed' ? 'failed' : stage,
      percent: next.progressPercent,
      indeterminate: Boolean(next.indeterminate) || next.progressPercent == null,
      warning: next.warning,
      error: next.error,
      label: giftAlphaStageLabel(stage, next.progressPercent),
    });
  });
  if (!job.url || job.url.startsWith('blob:')) {
    throw new ApiError(500, 'La conversión no devolvió una URL persistente');
  }
  emit({
    stage: 'done',
    percent: 100,
    indeterminate: false,
    warning: job.warning,
  });
  return { url: job.url, job };
}

export async function resumeGiftAlphaJob(
  giftId: string,
  onProgress?: (progress: GiftAnimProgress) => void,
): Promise<GiftAlphaJob | null> {
  const remembered = rememberedGiftAlphaJobId(giftId);
  const latest = remembered
    ? await fetchGiftAlphaJob(remembered).catch(() => null)
    : await fetchLatestGiftAlphaJob(giftId);
  if (!latest) return null;
  if (latest.giftId !== giftId) return null;
  if (latest.status === 'done' || latest.status === 'failed') {
    if (latest.status === 'done') forgetGiftAlphaJob(giftId);
    return latest;
  }
  rememberJob(giftId, latest.jobId);
  return pollGiftAlphaJob(latest.jobId, (next) => {
    onProgress?.({
      stage: (next.stage || 'queued') as GiftAlphaStage,
      label: giftAlphaStageLabel(next.stage || 'queued', next.progressPercent),
      percent: next.progressPercent,
      indeterminate: Boolean(next.indeterminate) || next.progressPercent == null,
      warning: next.warning,
      error: next.error,
      fileName: next.fileName || undefined,
      fileBytes: next.sourceBytes,
    });
  });
}
