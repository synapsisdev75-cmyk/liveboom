import { DEFAULT_RECONSTRUCTION_EDIT, type ReconstructionDraft } from './types';

const SESSION_KEY = 'liveboom.recon3d.job';

let draft: ReconstructionDraft | null = null;
const listeners = new Set<(value: ReconstructionDraft | null) => void>();

function persistMeta(value: ReconstructionDraft | null) {
  try {
    if (!value || !value.result?.frameUrls.some((url) => url.startsWith('http'))) {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        id: value.id,
        userId: value.userId,
        kind: value.kind,
        status: value.status,
        result: value.result,
        edit: value.edit,
        motion: value.motion,
        updatedAt: value.updatedAt,
      }),
    );
  } catch {
    /* quota / privado */
  }
}

export function readReconstructionSessionMeta(): Partial<ReconstructionDraft> | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<ReconstructionDraft>;
    if (!data?.id || !data.result?.frameUrls?.length) return null;
    return data;
  } catch {
    return null;
  }
}

export function getReconstructionDraft() {
  if (draft && !draft.kind) {
    draft = { ...draft, kind: 'object', personConsent: Boolean(draft.personConsent) };
  }
  return draft;
}

export function subscribeReconstructionDraft(listener: (value: ReconstructionDraft | null) => void) {
  listeners.add(listener);
  listener(draft);
  return () => {
    listeners.delete(listener);
  };
}

export function setReconstructionDraft(next: ReconstructionDraft | null) {
  draft = next;
  persistMeta(next);
  listeners.forEach((listener) => listener(draft));
}

export function patchReconstructionDraft(patch: Partial<ReconstructionDraft>) {
  if (!draft) return;
  setReconstructionDraft({
    ...draft,
    ...patch,
    updatedAt: Date.now(),
  });
}

export function clearReconstructionDraft() {
  if (draft) {
    for (const capture of draft.captures) {
      if (capture.objectUrl.startsWith('blob:')) URL.revokeObjectURL(capture.objectUrl);
    }
  }
  setReconstructionDraft(null);
}

export function emptyReconstructionDraft(
  userId: string,
  id: string,
  kind: ReconstructionDraft['kind'] = 'object',
): ReconstructionDraft {
  return {
    id,
    userId,
    kind,
    status: 'draft',
    progress: 0,
    stage: '',
    captures: [],
    missingSlots: [],
    result: null,
    edit: { ...DEFAULT_RECONSTRUCTION_EDIT },
    motion: 'orbit',
    error: null,
    personConsent: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
