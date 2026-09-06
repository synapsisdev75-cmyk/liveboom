import {
  coverageMessage,
  type Reconstruction3DSlotId,
  type ReconstructionCapture,
  type ReconstructionQualityBand,
  type ReconstructionSubjectKind,
} from './types';

export type ReconstructionViewDef = {
  id: Reconstruction3DSlotId;
  label: string;
  required: boolean;
  yaw: number;
  pitch: number;
  many?: boolean;
};

export type LandscapeGroupId = 'lateral' | 'ground' | 'sky' | 'orbit360';

export type LandscapeGroupDef = {
  id: LandscapeGroupId;
  label: string;
  min: number;
  max: number;
  hint: string;
};

export const PERSON_MIN = 5;
export const PERSON_RECOMMENDED_MAX = 8;
export const OBJECT_MIN = 6;
export const OBJECT_RECOMMENDED = 7;
export const OBJECT_MAX = 12;
export const LANDSCAPE_MIN = 20;
export const LANDSCAPE_TARGET = 24;
export const LANDSCAPE_MAX = 40;

export const PERSON_VIEWS: ReconstructionViewDef[] = [
  { id: 'front', label: 'Frente', required: true, yaw: 0, pitch: 8 },
  { id: 'left', label: 'Izquierda', required: true, yaw: 90, pitch: 8 },
  { id: 'right', label: 'Derecha', required: true, yaw: 270, pitch: 8 },
  { id: 'back', label: 'Trasera', required: true, yaw: 180, pitch: 8 },
  { id: 'top', label: 'Superior', required: true, yaw: 0, pitch: 42 },
  { id: 'diag_fl', label: '3/4 izquierda', required: false, yaw: 45, pitch: 8 },
  { id: 'diag_fr', label: '3/4 derecha', required: false, yaw: 315, pitch: 8 },
  { id: 'detail', label: 'Detalle', required: false, yaw: 0, pitch: 12 },
];

export const OBJECT_VIEWS: ReconstructionViewDef[] = [
  { id: 'front', label: 'Frente', required: true, yaw: 0, pitch: 8 },
  { id: 'left', label: 'Izquierda', required: true, yaw: 90, pitch: 8 },
  { id: 'right', label: 'Derecha', required: true, yaw: 270, pitch: 8 },
  { id: 'back', label: 'Atrás', required: true, yaw: 180, pitch: 8 },
  { id: 'top', label: 'Superior', required: true, yaw: 0, pitch: 42 },
  { id: 'bottom', label: 'Inferior', required: true, yaw: 0, pitch: -18 },
  { id: 'detail', label: 'Detalles', required: false, yaw: 20, pitch: 10 },
];

export const LANDSCAPE_GROUPS: LandscapeGroupDef[] = [
  { id: 'lateral', label: 'Capturas laterales', min: 8, max: 16, hint: 'Completa una vuelta ~360°.' },
  { id: 'ground', label: 'Capturas de suelo', min: 4, max: 8, hint: 'Piso, terreno y texturas inferiores.' },
  { id: 'sky', label: 'Capturas superiores', min: 4, max: 8, hint: 'Cielo, techo o partes elevadas.' },
  { id: 'orbit360', label: 'Cobertura 360°', min: 8, max: 16, hint: 'Puntos alrededor del entorno.' },
];

export const LANDSCAPE_VIEWS: ReconstructionViewDef[] = [
  { id: 'front', label: 'Frente', required: false, yaw: 0, pitch: 8 },
  { id: 'right', label: 'Derecha', required: false, yaw: 90, pitch: 8 },
  { id: 'back', label: 'Atrás', required: false, yaw: 180, pitch: 8 },
  { id: 'left', label: 'Izquierda', required: false, yaw: 270, pitch: 8 },
  { id: 'sky', label: 'Superior', required: false, yaw: 0, pitch: 42 },
  { id: 'ground', label: 'Suelo', required: false, yaw: 0, pitch: -12 },
  { id: 'lateral', label: 'Lateral', required: true, yaw: 45, pitch: 8, many: true },
  { id: 'orbit360', label: '360°', required: true, yaw: 0, pitch: 8, many: true },
  { id: 'detail', label: 'Detalle', required: false, yaw: 15, pitch: 10, many: true },
];

export const VIEW_ASSIGN_OPTIONS: Record<
  ReconstructionSubjectKind,
  Array<{ id: Reconstruction3DSlotId; label: string }>
> = {
  person: [
    { id: 'front', label: 'Frente' },
    { id: 'left', label: 'Izquierda' },
    { id: 'right', label: 'Derecha' },
    { id: 'back', label: 'Atrás' },
    { id: 'top', label: 'Superior' },
    { id: 'bottom', label: 'Inferior' },
    { id: 'detail', label: 'Detalle' },
    { id: 'other', label: 'Otra' },
  ],
  object: [
    { id: 'front', label: 'Frente' },
    { id: 'left', label: 'Izquierda' },
    { id: 'right', label: 'Derecha' },
    { id: 'back', label: 'Atrás' },
    { id: 'top', label: 'Superior' },
    { id: 'bottom', label: 'Inferior' },
    { id: 'detail', label: 'Detalle' },
    { id: 'other', label: 'Otra' },
  ],
  landscape: [
    { id: 'lateral', label: 'Lateral' },
    { id: 'ground', label: 'Suelo' },
    { id: 'sky', label: 'Superior' },
    { id: 'orbit360', label: '360°' },
    { id: 'detail', label: 'Detalle' },
  ],
};

export function viewsForKind(kind: ReconstructionSubjectKind): ReconstructionViewDef[] {
  if (kind === 'person') return PERSON_VIEWS;
  if (kind === 'landscape') return LANDSCAPE_VIEWS;
  return OBJECT_VIEWS;
}

export function viewLabel(id: Reconstruction3DSlotId, kind: ReconstructionSubjectKind = 'object') {
  const fromKind = viewsForKind(kind).find((item) => item.id === id);
  if (fromKind) return fromKind.label;
  return VIEW_ASSIGN_OPTIONS.object.find((item) => item.id === id)?.label || id;
}

export function captureCountForSlot(captures: ReconstructionCapture[], slotId: Reconstruction3DSlotId) {
  return captures.filter((item) => item.slotId === slotId).length;
}

export function firstCaptureForSlot(captures: ReconstructionCapture[], slotId: Reconstruction3DSlotId) {
  return captures.find((item) => item.slotId === slotId) || null;
}

export function nextRequiredView(
  kind: ReconstructionSubjectKind,
  captures: ReconstructionCapture[],
): ReconstructionViewDef | null {
  if (kind === 'landscape') {
    for (const group of LANDSCAPE_GROUPS) {
      if (captureCountForSlot(captures, group.id) < group.min) {
        return LANDSCAPE_VIEWS.find((item) => item.id === group.id) || null;
      }
    }
    if (captures.length < LANDSCAPE_MAX) {
      return LANDSCAPE_VIEWS.find((item) => item.id === 'orbit360') || LANDSCAPE_VIEWS[0] || null;
    }
    return null;
  }
  const views = viewsForKind(kind);
  return (
    views.find((view) => view.required && !captures.some((item) => item.slotId === view.id)) ||
    views.find((view) => !captures.some((item) => item.slotId === view.id)) ||
    null
  );
}

export function kindProgress(kind: ReconstructionSubjectKind, captures: ReconstructionCapture[]) {
  if (kind === 'person') {
    const filled = PERSON_VIEWS.filter((view) => view.required && captures.some((item) => item.slotId === view.id)).length;
    return { current: filled, target: PERSON_MIN, extra: Math.max(0, captures.length - filled) };
  }
  if (kind === 'object') {
    const filled = OBJECT_VIEWS.filter((view) => view.required && captures.some((item) => item.slotId === view.id)).length;
    return { current: filled, target: OBJECT_RECOMMENDED, extra: Math.max(0, captures.length - filled) };
  }
  return { current: captures.length, target: LANDSCAPE_TARGET, extra: 0 };
}

export function landscapeGroupCounts(captures: ReconstructionCapture[]) {
  return LANDSCAPE_GROUPS.map((group) => ({
    ...group,
    count: captureCountForSlot(captures, group.id),
  }));
}

export type KindCoverage = {
  captures: ReconstructionCapture[];
  missing: Reconstruction3DSlotId[];
  missingCount: number;
  ok: boolean;
  message: string | null;
};

export function evaluateKindCoverage(
  captures: ReconstructionCapture[],
  kind: ReconstructionSubjectKind = 'object',
): KindCoverage {
  if (kind === 'landscape') {
    const groups = landscapeGroupCounts(captures);
    const missing: Reconstruction3DSlotId[] = groups
      .filter((group) => group.count < group.min)
      .map((group) => group.id);
    const enoughCount = captures.length >= LANDSCAPE_MIN;
    const coreOk = groups
      .filter((group) => group.id === 'lateral' || group.id === 'ground' || group.id === 'sky')
      .every((group) => group.count >= group.min);
    const remaining = Math.max(0, LANDSCAPE_MIN - captures.length);
    return {
      captures,
      missing,
      missingCount: remaining || missing.length,
      ok: enoughCount && coreOk,
      message:
        enoughCount && coreOk
          ? null
          : remaining > 0
            ? `Faltan ${remaining} tomas para generar un modelo confiable.`
            : `Faltan ${missing.length} grupos de cobertura.`,
    };
  }

  const views = viewsForKind(kind);
  const missing = views
    .filter((view) => view.required && !captures.some((item) => item.slotId === view.id))
    .map((view) => view.id);
  const min = kind === 'person' ? PERSON_MIN : OBJECT_MIN;
  const ok = missing.length === 0 && captures.length >= min;
  return {
    captures,
    missing,
    missingCount: missing.length,
    ok,
    message: ok
      ? null
      : missing.length
        ? `Faltan ${missing.length} vistas para generar un modelo confiable.`
        : `Faltan fotos. Mínimo ${min}.`,
  };
}

export function estimateReconstructionQuality(
  kind: ReconstructionSubjectKind,
  captures: ReconstructionCapture[],
): ReconstructionQualityBand {
  const progress = kindProgress(kind, captures);
  const coverageRatio = Math.min(1, progress.current / Math.max(1, progress.target));
  const countRatio =
    kind === 'landscape'
      ? Math.min(1, captures.length / LANDSCAPE_MAX)
      : Math.min(1, captures.length / (kind === 'person' ? PERSON_RECOMMENDED_MAX : OBJECT_MAX));
  const sharpness =
    captures.reduce((sum, item) => sum + (item.sharpness ?? 18), 0) / Math.max(1, captures.length);
  const brightness =
    captures.reduce((sum, item) => sum + (item.brightness ?? 128), 0) / Math.max(1, captures.length);
  const lighting = brightness < 50 || brightness > 220 ? 0.45 : brightness < 80 || brightness > 200 ? 0.7 : 1;
  const sharpScore = Math.min(1, sharpness / 28);
  const score = coverageRatio * 42 + countRatio * 28 + sharpScore * 18 + lighting * 12;
  if (score >= 82) return 'excellent';
  if (score >= 64) return 'high';
  if (score >= 42) return 'good';
  return 'basic';
}

export function qualityBandLabel(band: ReconstructionQualityBand) {
  if (band === 'excellent') return 'Excelente';
  if (band === 'high') return 'Alta';
  if (band === 'good') return 'Buena';
  return 'Básica';
}

export function kindAccent(kind: ReconstructionSubjectKind) {
  if (kind === 'person') return 'magenta';
  if (kind === 'landscape') return 'cyan-magenta';
  return 'cyan-violet';
}

export function kindCopy(kind: ReconstructionSubjectKind) {
  if (kind === 'person') {
    return {
      title: 'Persona',
      subtitle: 'Escanea una persona.',
      range: 'Persona: 5 a 8 tomas',
      tip: 'Mantén buena iluminación y encuadra todo el cuerpo.',
      guide: 'Mueve lentamente. Sigue los puntos.',
    };
  }
  if (kind === 'landscape') {
    return {
      title: 'Paisaje',
      subtitle: 'Escanea un entorno.',
      range: 'Paisaje: 20 a 40 tomas',
      tip: 'Haz un recorrido completo, capturando suelo, horizonte y cielo.',
      guide: 'Mantén una iluminación uniforme y captura todo el entorno.',
    };
  }
  return {
    title: 'Objeto',
    subtitle: 'Escanea un objeto.',
    range: 'Objeto: 6 a 12 tomas',
    tip: 'Mueve la cámara alrededor del objeto o gira el objeto. Mantén buena iluminación y una distancia constante.',
    guide: 'Objeto centrado. Evita movimiento excesivo.',
  };
}

export function missingLabels(missing: Reconstruction3DSlotId[], kind: ReconstructionSubjectKind) {
  return missing.slice(0, 4).map((id) => coverageMessage(id) || viewLabel(id, kind));
}
