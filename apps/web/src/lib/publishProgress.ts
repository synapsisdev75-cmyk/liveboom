import { create } from 'zustand';

/** Etapas visibles de una publicación con archivo (Publicaciones, Boom Clip, Flash Boom). */
export type PublishStage = 'preparing' | 'uploading' | 'processing' | 'done' | 'error' | 'canceled';

export type PublishJob = {
  id: string;
  /** "Publicación", "Boom Clip", "Flash Boom". */
  label: string;
  stage: PublishStage;
  /** 0..100 mientras sube (o prepara con progreso real); null = indeterminado. */
  pct: number | null;
  /** El compositor se cerró: el indicador flotante muestra el progreso. */
  detached: boolean;
  message?: string;
};

type State = {
  jobs: PublishJob[];
};

const cancelers = new Map<string, () => void>();
const DONE_VISIBLE_MS = 2600;

export const usePublishProgressStore = create<State>(() => ({ jobs: [] }));

function patchJob(id: string, patch: Partial<PublishJob>) {
  usePublishProgressStore.setState((state) => ({
    jobs: state.jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)),
  }));
}

function removeJob(id: string) {
  cancelers.delete(id);
  usePublishProgressStore.setState((state) => ({ jobs: state.jobs.filter((job) => job.id !== id) }));
}

export function startPublishJob(label: string, cancel: () => void): string {
  const id = `pub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  cancelers.set(id, cancel);
  usePublishProgressStore.setState((state) => ({
    jobs: [...state.jobs, { id, label, stage: 'preparing', pct: null, detached: false }],
  }));
  return id;
}

export function updatePublishJob(id: string, stage: PublishStage, pct: number | null = null) {
  const job = usePublishProgressStore.getState().jobs.find((item) => item.id === id);
  if (!job) return;
  const rounded = pct == null ? null : Math.max(0, Math.min(100, Math.round(pct)));
  if (job.stage === stage && job.pct === rounded) return;
  patchJob(id, { stage, pct: rounded });
}

export function finishPublishJob(id: string, stage: 'done' | 'error' | 'canceled', message?: string) {
  const job = usePublishProgressStore.getState().jobs.find((item) => item.id === id);
  if (!job) return;
  cancelers.delete(id);
  if (!job.detached) {
    removeJob(id);
    return;
  }
  patchJob(id, { stage, pct: stage === 'done' ? 100 : job.pct, message });
  window.setTimeout(() => removeJob(id), stage === 'error' ? DONE_VISIBLE_MS * 2 : DONE_VISIBLE_MS);
}

export function detachPublishJob(id: string) {
  patchJob(id, { detached: true });
}

export function cancelPublishJob(id: string) {
  cancelers.get(id)?.();
}

export function dismissPublishJob(id: string) {
  removeJob(id);
}

export function publishStageLabel(job: Pick<PublishJob, 'stage' | 'pct'>): string {
  switch (job.stage) {
    case 'preparing':
      return job.pct != null ? `Preparando… ${job.pct}%` : 'Preparando…';
    case 'uploading':
      return `Subiendo ${job.pct ?? 0}%`;
    case 'processing':
      return 'Procesando…';
    case 'done':
      return 'Listo';
    case 'canceled':
      return 'Subida cancelada';
    default:
      return 'No se pudo publicar';
  }
}
