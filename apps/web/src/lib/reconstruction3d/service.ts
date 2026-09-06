import {
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { api, ApiError } from '../api';
import { db } from '../firebase';
import { uploadReconstructionAsset, deleteReconstructionAsset } from './storage';
import { evaluateKindCoverage } from './catalog';
import {
  RECONSTRUCTION_PROCESS_STAGES,
  slotByYawPitch,
  type ReconstructionCapture,
  type ReconstructionDraft,
  type Reconstruction3DPayload,
  type Reconstruction3DStatus,
  type ReconstructionSubjectKind,
} from './types';

export type ReconstructionJobRecord = {
  id: string;
  userId: string;
  kind?: ReconstructionSubjectKind;
  status: Reconstruction3DStatus;
  captureCount: number;
  progress: number;
  stage?: string;
  sourceImages?: string[];
  previewImage?: string | null;
  modelUrl?: string | null;
  optimizedModelUrl?: string | null;
  videoRenderUrl?: string | null;
  error?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
};

async function callApi<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    return await api<T>(path, init);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) return null;
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

function newJobId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `r3d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export const threeDReconstructionService = {
  async createProject(userId: string, kind: ReconstructionSubjectKind = 'object') {
    const id = await this.createReconstructionJob(userId, kind);
    return { id, kind };
  },

  async addCapture() {
    return null;
  },

  async removeCapture() {
    return null;
  },

  async validateCapture() {
    return null;
  },

  async generateModel(jobId: string) {
    return this.startProcessing(jobId);
  },

  async getGenerationStatus(jobId: string) {
    return this.getReconstructionStatus(jobId);
  },

  async getModel(jobId: string) {
    return this.getReconstructionResult(jobId);
  },

  async cancelGeneration(jobId: string) {
    return this.cancelReconstruction(jobId);
  },

  async createReconstructionJob(userId: string, kind: ReconstructionSubjectKind = 'object'): Promise<string> {
    const id = newJobId();
    const payload: ReconstructionJobRecord = {
      id,
      userId,
      status: 'draft',
      captureCount: 0,
      progress: 0,
      sourceImages: [],
      previewImage: null,
      modelUrl: null,
      optimizedModelUrl: null,
      videoRenderUrl: null,
      error: null,
    };
    try {
      await setDoc(doc(db, 'threeDReconstructions', id), {
        ...payload,
        kind,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      /* local-only si rules/offline */
    }
    void callApi(`/api/reconstructions`, {
      method: 'POST',
      body: JSON.stringify({ id }),
    }).catch(() => null);
    return id;
  },

  async uploadCaptureImages(
    userId: string,
    jobId: string,
    captures: ReconstructionCapture[],
  ): Promise<ReconstructionCapture[]> {
    const uploaded: ReconstructionCapture[] = [];
    for (const capture of captures) {
      if (capture.remoteUrl) {
        uploaded.push(capture);
        continue;
      }
      const saved = await uploadReconstructionAsset(userId, jobId, capture.file, `${capture.slotId || 'frame'}.jpg`);
      uploaded.push({ ...capture, remoteUrl: saved.url, storagePath: saved.storagePath });
    }
    const sourceImages = uploaded.map((item) => item.remoteUrl).filter((url): url is string => Boolean(url));
    try {
      await updateDoc(doc(db, 'threeDReconstructions', jobId), {
        status: 'uploading',
        captureCount: sourceImages.length,
        sourceImages,
        updatedAt: serverTimestamp(),
      });
    } catch {
      /* local */
    }
    void callApi(`/api/reconstructions/${jobId}/images`, {
      method: 'POST',
      body: JSON.stringify({ captureCount: sourceImages.length }),
    }).catch(() => null);
    return uploaded;
  },

  async startProcessing(jobId: string) {
    try {
      await updateDoc(doc(db, 'threeDReconstructions', jobId), {
        status: 'processing',
        progress: 1,
        stage: RECONSTRUCTION_PROCESS_STAGES[0],
        updatedAt: serverTimestamp(),
      });
    } catch {
      /* local */
    }
    const remote = await callApi<{ id: string }>(`/api/reconstructions/${jobId}/process`, {
      method: 'POST',
    }).catch(() => null);
    return Boolean(remote);
  },

  listenReconstructionStatus(jobId: string, onChange: (record: ReconstructionJobRecord | null) => void) {
    return onSnapshot(
      doc(db, 'threeDReconstructions', jobId),
      (snap) => {
        if (!snap.exists()) {
          onChange(null);
          return;
        }
        onChange({ id: snap.id, ...(snap.data() as Omit<ReconstructionJobRecord, 'id'>) });
      },
      () => onChange(null),
    );
  },

  async getReconstructionStatus(jobId: string): Promise<ReconstructionJobRecord | null> {
    const remote = await callApi<ReconstructionJobRecord>(`/api/reconstructions/${jobId}`).catch(() => null);
    if (remote) return remote;
    try {
      const snap = await getDoc(doc(db, 'threeDReconstructions', jobId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...(snap.data() as Omit<ReconstructionJobRecord, 'id'>) };
    } catch {
      return null;
    }
  },

  async getReconstructionResult(jobId: string): Promise<Reconstruction3DPayload | null> {
    const record = await this.getReconstructionStatus(jobId);
    if (!record || record.status !== 'ready') return null;
    return {
      id: record.id,
      previewUrl: record.previewImage || record.sourceImages?.[0] || null,
      thumbnailUrl: record.previewImage || null,
      frameUrls: record.sourceImages || [],
      videoRenderUrl: record.videoRenderUrl || null,
      captureCount: record.captureCount,
    };
  },

  async cancelReconstruction(jobId: string) {
    try {
      await updateDoc(doc(db, 'threeDReconstructions', jobId), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
    } catch {
      /* local */
    }
    void callApi(`/api/reconstructions/${jobId}/cancel`, { method: 'POST' }).catch(() => null);
  },

  async deleteReconstruction(jobId: string, captures: ReconstructionCapture[]) {
    for (const capture of captures) {
      if (capture.storagePath) await deleteReconstructionAsset(capture.storagePath);
    }
    try {
      await deleteDoc(doc(db, 'threeDReconstructions', jobId));
    } catch {
      /* local */
    }
    void callApi(`/api/reconstructions/${jobId}`, { method: 'DELETE' }).catch(() => null);
  },
};

export function evaluateReconstructionCoverage(
  captures: ReconstructionCapture[],
  kind: ReconstructionSubjectKind = 'object',
) {
  const assigned = captures.map((item) =>
    item.slotId
      ? item
      : {
          ...item,
          slotId: slotByYawPitch(item.yaw, item.pitch, kind),
        },
  );
  const coverage = evaluateKindCoverage(assigned, kind);
  return {
    captures: assigned,
    missing: coverage.missing,
    ok: coverage.ok,
    missingCount: coverage.missingCount,
    message: coverage.message,
  };
}

export async function runLocalReconstructionPipeline(
  draft: ReconstructionDraft,
  onProgress: (progress: number, stage: string) => void,
): Promise<Reconstruction3DPayload> {
  const frames = draft.captures
    .slice()
    .sort((a, b) => a.yaw - b.yaw || a.pitch - b.pitch)
    .map((item) => item.remoteUrl || item.objectUrl);
  const total = RECONSTRUCTION_PROCESS_STAGES.length;
  for (let i = 0; i < total; i += 1) {
    onProgress(Math.round(((i + 1) / total) * 100), RECONSTRUCTION_PROCESS_STAGES[i] ?? 'Procesando');
    await new Promise((resolve) => window.setTimeout(resolve, 420 + i * 80));
  }
  const preview = frames.find((_, index) => draft.captures[index]?.slotId === 'front') || frames[0] || null;
  return {
    id: draft.id,
    previewUrl: preview,
    thumbnailUrl: preview,
    frameUrls: frames,
    motion: draft.motion,
    edit: draft.edit,
    captureCount: frames.length,
  };
}

export async function persistReconstructionReady(jobId: string, result: Reconstruction3DPayload) {
  try {
    await updateDoc(doc(db, 'threeDReconstructions', jobId), {
      status: 'ready',
      progress: 100,
      stage: RECONSTRUCTION_PROCESS_STAGES[RECONSTRUCTION_PROCESS_STAGES.length - 1],
      previewImage: result.previewUrl,
      sourceImages: result.frameUrls.filter((url) => url.startsWith('http')),
      captureCount: result.captureCount || result.frameUrls.length,
      updatedAt: serverTimestamp(),
    });
  } catch {
    /* local preview still works */
  }
}
