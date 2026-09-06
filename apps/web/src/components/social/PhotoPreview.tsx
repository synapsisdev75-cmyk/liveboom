import type { Reconstruction3DSlotId, ReconstructionSubjectKind } from '../../lib/reconstruction3d/types';
import { VIEW_ASSIGN_OPTIONS, viewLabel } from '../../lib/reconstruction3d/catalog';

type ReviewProps = {
  src: string;
  onUse: () => void;
  onRetry: () => void;
};

export function PhotoPreview({ src, onUse, onRetry }: ReviewProps) {
  return (
    <div className="lb-recon-preview-shot">
      <img src={src} alt="Vista previa de la captura" />
      <div className="lb-recon-preview-shot__actions">
        <button type="button" className="lb-recon3d-secondary" onClick={onRetry}>
          Repetir
        </button>
        <button type="button" className="lb-recon3d-primary" onClick={onUse}>
          Usar foto
        </button>
      </div>
    </div>
  );
}

type AssignProps = {
  src: string;
  kind: ReconstructionSubjectKind;
  suggested: Reconstruction3DSlotId | null;
  value: Reconstruction3DSlotId;
  onChange: (id: Reconstruction3DSlotId) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function CaptureViewAssign({ src, kind, suggested, value, onChange, onConfirm, onCancel }: AssignProps) {
  return (
    <div className="lb-recon-assign">
      <img src={src} alt="Foto importada" />
      <p>¿Qué vista representa esta foto?</p>
      {suggested ? (
        <small>Parece una vista {viewLabel(suggested, kind).toLowerCase()}.</small>
      ) : null}
      <div className="lb-recon-assign__grid">
        {VIEW_ASSIGN_OPTIONS[kind].map((option) => (
          <button
            key={option.id}
            type="button"
            className={value === option.id ? 'is-on' : ''}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="lb-recon-preview-shot__actions">
        <button type="button" className="lb-recon3d-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="lb-recon3d-primary" onClick={onConfirm}>
          Asignar
        </button>
      </div>
    </div>
  );
}
