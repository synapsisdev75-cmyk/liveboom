export type Reconstruction3DStatus =
  | 'draft'
  | 'uploading'
  | 'processing'
  | 'generating_geometry'
  | 'texturing'
  | 'ready'
  | 'failed'
  | 'cancelled'
  | 'needs_coverage';

export type ReconstructionSubjectKind = 'person' | 'object' | 'landscape';

export type Reconstruction3DSlotId =
  | 'front'
  | 'diag_fl'
  | 'left'
  | 'diag_bl'
  | 'back'
  | 'diag_br'
  | 'right'
  | 'diag_fr'
  | 'top'
  | 'bottom'
  | 'detail'
  | 'other'
  | 'lateral'
  | 'ground'
  | 'sky'
  | 'orbit360';

export type ReconstructionQualityBand = 'basic' | 'good' | 'high' | 'excellent';

export type Reconstruction3DMotion = 'orbit' | 'zoom_in' | 'zoom_out' | 'auto';

export type Reconstruction3DEdit = {
  yaw: number;
  pitch: number;
  zoom: number;
  scale: number;
  panX: number;
  panY: number;
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  sharpness: number;
  background: 'original' | 'dark' | 'blur';
  crop: number;
};

export const DEFAULT_RECONSTRUCTION_EDIT: Reconstruction3DEdit = {
  yaw: 0,
  pitch: 8,
  zoom: 100,
  scale: 100,
  panX: 0,
  panY: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  sharpness: 0,
  background: 'original',
  crop: 0,
};

export const RECONSTRUCTION_SLOTS: Array<{
  id: Reconstruction3DSlotId;
  label: string;
  short: string;
  yaw: number;
  pitch: number;
  required: boolean;
}> = [
  { id: 'front', label: 'Frente', short: 'Frente', yaw: 0, pitch: 8, required: true },
  { id: 'diag_fl', label: 'Diagonal frontal izquierda', short: 'Diag. izq.', yaw: 45, pitch: 8, required: true },
  { id: 'left', label: 'Lateral izquierdo', short: 'Lateral', yaw: 90, pitch: 8, required: true },
  { id: 'diag_bl', label: 'Diagonal trasera izquierda', short: 'Tras. izq.', yaw: 135, pitch: 8, required: true },
  { id: 'back', label: 'Parte trasera', short: 'Trasera', yaw: 180, pitch: 8, required: true },
  { id: 'diag_br', label: 'Diagonal trasera derecha', short: 'Tras. der.', yaw: 225, pitch: 8, required: true },
  { id: 'right', label: 'Lateral derecho', short: 'Lateral', yaw: 270, pitch: 8, required: true },
  { id: 'diag_fr', label: 'Diagonal frontal derecha', short: 'Diag. der.', yaw: 315, pitch: 8, required: true },
  { id: 'top', label: 'Toma superior', short: 'Superior', yaw: 0, pitch: 42, required: true },
];

export const RECONSTRUCTION_PROCESS_STAGES = [
  'Subiendo fotografías...',
  'Analizando fotografías...',
  'Reconstruyendo geometría...',
  'Aplicando texturas...',
  'Preparando vista previa...',
] as const;

export const RECONSTRUCTION_RECOMMENDED_MIN = 12;
export const RECONSTRUCTION_RECOMMENDED_MAX = 24;
export const RECONSTRUCTION_MIN_CAPTURES = 8;

export type ReconstructionQualityIssue =
  | 'blurry'
  | 'dark'
  | 'overexposed'
  | 'duplicate'
  | 'lowres'
  | 'cropped';

export type ReconstructionQualityResult = {
  ok: boolean;
  issue: ReconstructionQualityIssue | null;
  reason: string | null;
  brightness: number;
  sharpness: number;
};

export type ReconstructionCapture = {
  id: string;
  slotId: Reconstruction3DSlotId | null;
  yaw: number;
  pitch: number;
  objectUrl: string;
  file: File;
  remoteUrl?: string;
  storagePath?: string;
  brightness?: number;
  sharpness?: number;
  suggestedSlot?: Reconstruction3DSlotId | null;
};

export type Reconstruction3DPayload = {
  id: string;
  previewUrl: string | null;
  thumbnailUrl?: string | null;
  frameUrls: string[];
  videoRenderUrl?: string | null;
  motion?: Reconstruction3DMotion;
  edit?: Reconstruction3DEdit;
  captureCount?: number;
};

export type ReconstructionDraft = {
  id: string;
  userId: string;
  kind: ReconstructionSubjectKind;
  status: Reconstruction3DStatus;
  progress: number;
  stage: string;
  captures: ReconstructionCapture[];
  missingSlots: Reconstruction3DSlotId[];
  result: Reconstruction3DPayload | null;
  edit: Reconstruction3DEdit;
  motion: Reconstruction3DMotion;
  error: string | null;
  personConsent: boolean;
  createdAt: number;
  updatedAt: number;
};

export function reconstructionEditCssFilter(edit: Reconstruction3DEdit) {
  const brightness = 1 + edit.brightness / 100 + edit.exposure / 140;
  const contrast = 1 + edit.contrast / 100 + edit.sharpness / 220;
  const saturate = 1 + edit.saturation / 100;
  return `brightness(${brightness}) contrast(${Math.max(0.2, contrast)}) saturate(${Math.max(0, saturate)})`;
}

export function parseReconstruction3d(value: unknown): Reconstruction3DPayload | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = value as Record<string, unknown>;
  const id = String(data.id || '').trim();
  const frameUrls = Array.isArray(data.frameUrls)
    ? data.frameUrls.filter((item): item is string => typeof item === 'string' && item.length > 8)
    : [];
  const previewUrl = typeof data.previewUrl === 'string' ? data.previewUrl : null;
  if (!id || (!previewUrl && frameUrls.length === 0)) return undefined;
  const motion =
    data.motion === 'orbit' || data.motion === 'zoom_in' || data.motion === 'zoom_out' || data.motion === 'auto'
      ? data.motion
      : undefined;
  return {
    id,
    previewUrl,
    thumbnailUrl: typeof data.thumbnailUrl === 'string' ? data.thumbnailUrl : undefined,
    frameUrls,
    videoRenderUrl: typeof data.videoRenderUrl === 'string' ? data.videoRenderUrl : undefined,
    motion,
    captureCount: Number(data.captureCount) || frameUrls.length,
  };
}

export function slotByYawPitch(
  yaw: number,
  pitch: number,
  kind: ReconstructionSubjectKind = 'object',
): Reconstruction3DSlotId {
  if (kind === 'landscape') {
    if (pitch >= 32) return 'sky';
    if (pitch <= 4) return 'ground';
    return 'lateral';
  }
  if (kind === 'object' && pitch <= -6) return 'bottom';
  if (pitch >= 28) return 'top';
  const wrapped = ((yaw % 360) + 360) % 360;
  let best = RECONSTRUCTION_SLOTS[0]!;
  let bestDelta = 999;
  for (const slot of RECONSTRUCTION_SLOTS) {
    if (slot.id === 'top' || slot.id === 'bottom') continue;
    const delta = Math.min(Math.abs(wrapped - slot.yaw), 360 - Math.abs(wrapped - slot.yaw));
    if (delta < bestDelta) {
      best = slot;
      bestDelta = delta;
    }
  }
  return best.id;
}

export function missingReconstructionSlots(captures: ReconstructionCapture[]): Reconstruction3DSlotId[] {
  const filled = new Set(captures.map((item) => item.slotId).filter(Boolean));
  return RECONSTRUCTION_SLOTS.filter((slot) => slot.required && !filled.has(slot.id)).map((slot) => slot.id);
}

export function coverageMessage(slotId: Reconstruction3DSlotId) {
  if (slotId === 'right' || slotId === 'diag_fr' || slotId === 'diag_br') return 'falta lado derecho';
  if (slotId === 'left' || slotId === 'diag_fl' || slotId === 'diag_bl') return 'falta lado izquierdo';
  if (slotId === 'back') return 'falta parte trasera';
  if (slotId === 'top' || slotId === 'sky') return 'falta ángulo superior';
  if (slotId === 'bottom' || slotId === 'ground') return 'falta ángulo inferior';
  if (slotId === 'lateral') return 'faltan capturas laterales';
  if (slotId === 'orbit360') return 'falta cobertura 360°';
  if (slotId === 'detail') return 'falta un detalle';
  const slot = RECONSTRUCTION_SLOTS.find((item) => item.id === slotId);
  return slot ? `falta ${slot.label.toLowerCase()}` : 'falta un ángulo';
}
