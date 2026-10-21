import type { ReactNode } from 'react';
import type { Reconstruction3DSlotId, ReconstructionSubjectKind } from '../../lib/reconstruction3d/types';
import { LANDSCAPE_TARGET, viewLabel } from '../../lib/reconstruction3d/catalog';

type GuidePoint = {
  id: Reconstruction3DSlotId;
  label: string;
  x: number;
  y: number;
  size?: 'sm' | 'md';
};

type Props = {
  kind: ReconstructionSubjectKind;
  filled: Set<string>;
  filledCounts?: Record<string, number>;
  nextId: Reconstruction3DSlotId | null;
  nextIndex: number;
  nextTotal: number;
  cameraOn: boolean;
  cameraError: string | null;
  children: ReactNode;
  onSelectPoint: (id: Reconstruction3DSlotId) => void;
};

function personPoints(): GuidePoint[] {
  return [
    { id: 'top', label: 'Superior', x: 50, y: 10 },
    { id: 'left', label: 'Izquierda', x: 10, y: 48 },
    { id: 'right', label: 'Derecha', x: 90, y: 48 },
    { id: 'front', label: 'Frente', x: 50, y: 48 },
    { id: 'back', label: 'Trasera', x: 50, y: 88 },
  ];
}

function objectPoints(): GuidePoint[] {
  return [
    { id: 'top', label: 'Superior', x: 50, y: 10 },
    { id: 'left', label: 'Izquierda', x: 10, y: 48 },
    { id: 'right', label: 'Derecha', x: 90, y: 48 },
    { id: 'front', label: 'Frente', x: 50, y: 48 },
    { id: 'bottom', label: 'Inferior', x: 50, y: 88 },
  ];
}

function landscapePoints(): GuidePoint[] {
  const ring: GuidePoint[] = [
    { id: 'front', label: 'Frente', x: 50, y: 46 },
    { id: 'ground', label: 'Suelo', x: 50, y: 62 },
    { id: 'left', label: 'Izquierda', x: 12, y: 50 },
    { id: 'right', label: 'Derecha', x: 88, y: 50 },
    { id: 'sky', label: 'Superior', x: 50, y: 12 },
    { id: 'back', label: 'Atrás', x: 50, y: 88 },
  ];
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2 - Math.PI / 2;
    ring.push({
      id: 'lateral',
      label: '',
      x: 50 + Math.cos(angle) * 38,
      y: 50 + Math.sin(angle) * 28,
      size: 'sm',
    });
  }
  return ring;
}

function pointState(
  point: GuidePoint,
  index: number,
  filled: Set<string>,
  filledCounts: Record<string, number>,
  nextId: Reconstruction3DSlotId | null,
) {
  if (point.size === 'sm') {
    const done = (filledCounts.lateral || 0) + (filledCounts.orbit360 || 0);
    const smallIndex = index - 6;
    if (smallIndex < done) return 'is-done';
    if (smallIndex === done && (nextId === 'lateral' || nextId === 'orbit360')) return 'is-next';
    return 'is-pending';
  }
  if (filled.has(point.id) || (filledCounts[point.id] || 0) > 0) return 'is-done';
  if (nextId === point.id) return 'is-next';
  return 'is-pending';
}

export function CaptureGuide({
  kind,
  filled,
  filledCounts = {},
  nextId,
  nextIndex,
  nextTotal,
  cameraOn,
  cameraError,
  children,
  onSelectPoint,
}: Props) {
  const points = kind === 'person' ? personPoints() : kind === 'landscape' ? landscapePoints() : objectPoints();
  const nextName = nextId ? viewLabel(nextId, kind) : 'Completado';
  const total = kind === 'landscape' ? Math.max(nextTotal, LANDSCAPE_TARGET) : nextTotal;

  return (
    <div className={`lb-recon-guide is-${kind}`}>
      {children}
      <div className="lb-recon-guide__ring" aria-hidden />
      {points.map((point, index) => (
        <button
          key={`${point.id}-${index}`}
          type="button"
          className={`lb-recon-guide__point ${point.size === 'sm' ? 'is-sm' : ''} ${pointState(point, index, filled, filledCounts, nextId)}`}
          style={{ left: `${point.x}%`, top: `${point.y}%` }}
          onClick={() => onSelectPoint(point.id)}
          title={point.label || viewLabel(point.id, kind)}
        >
          {point.label ? <span>{point.label}</span> : null}
        </button>
      ))}
      <div className="lb-recon-guide__status">
        <p>
          <i className={cameraOn ? 'is-live' : ''} /> {cameraError ? 'Sin cámara' : 'Cámara activa'}
        </p>
        <strong>
          Siguiente toma: {nextName} ({Math.min(nextIndex, total)}/{total})
        </strong>
      </div>
      {cameraError ? <p className="lb-recon-guide__denied">{cameraError}</p> : null}
    </div>
  );
}
