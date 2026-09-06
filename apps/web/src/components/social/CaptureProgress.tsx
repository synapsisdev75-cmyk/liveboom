import {
  LANDSCAPE_GROUPS,
  captureCountForSlot,
  firstCaptureForSlot,
  kindCopy,
  kindProgress,
  qualityBandLabel,
  viewLabel,
  viewsForKind,
  type LandscapeGroupDef,
} from '../../lib/reconstruction3d/catalog';
import type {
  Reconstruction3DSlotId,
  ReconstructionCapture,
  ReconstructionQualityBand,
  ReconstructionSubjectKind,
} from '../../lib/reconstruction3d/types';

type Props = {
  kind: ReconstructionSubjectKind;
  captures: ReconstructionCapture[];
  nextId: Reconstruction3DSlotId | null;
  quality: ReconstructionQualityBand;
  onSelect: (id: Reconstruction3DSlotId) => void;
};

export function CaptureProgress({ kind, captures, nextId, quality, onSelect }: Props) {
  const copy = kindCopy(kind);
  const progress = kindProgress(kind, captures);
  const percent = Math.min(100, Math.round((progress.current / Math.max(1, progress.target)) * 100));

  return (
    <section className="lb-recon-progress">
      <header>
        <div>
          <h3>Vistas requeridas</h3>
          <p>{copy.range}</p>
        </div>
        <strong>
          {progress.current}/{progress.target}
        </strong>
      </header>
      <div className="lb-recon-progress__bar" aria-hidden>
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="lb-recon-progress__quality">
        Calidad estimada: <b>{qualityBandLabel(quality)}</b>
      </p>
      {kind === 'landscape' ? (
        <ul className="lb-recon-progress__groups">
          {LANDSCAPE_GROUPS.map((group) => (
            <LandscapeRow
              key={group.id}
              group={group}
              captures={captures}
              active={nextId === group.id}
              onSelect={() => onSelect(group.id)}
            />
          ))}
        </ul>
      ) : (
        <ul className="lb-recon-progress__list">
          {viewsForKind(kind)
            .filter((view) => kind === 'object' || view.required || captures.some((item) => item.slotId === view.id))
            .map((view) => {
              const shot = firstCaptureForSlot(captures, view.id);
              const count = captureCountForSlot(captures, view.id);
              const done = count > 0;
              return (
                <li key={view.id}>
                  <button
                    type="button"
                    className={`lb-recon-shot ${done ? 'is-done' : ''} ${nextId === view.id ? 'is-next' : ''}`}
                    onClick={() => onSelect(view.id)}
                  >
                    <span className="lb-recon-shot__thumb">
                      {shot ? <img src={shot.objectUrl} alt="" /> : <i />}
                    </span>
                    <span>
                      <strong>{viewLabel(view.id, kind)}</strong>
                      <em>{done ? 'Capturada' : view.required ? 'Pendiente' : 'Opcional'}</em>
                    </span>
                    <b className={done ? 'is-check' : ''}>{done ? '✓' : ''}</b>
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
}

function LandscapeRow({
  group,
  captures,
  active,
  onSelect,
}: {
  group: LandscapeGroupDef;
  captures: ReconstructionCapture[];
  active: boolean;
  onSelect: () => void;
}) {
  const count = captureCountForSlot(captures, group.id);
  const shot = firstCaptureForSlot(captures, group.id);
  const done = count >= group.min;
  return (
    <li>
      <button type="button" className={`lb-recon-shot ${done ? 'is-done' : ''} ${active ? 'is-next' : ''}`} onClick={onSelect}>
        <span className="lb-recon-shot__thumb">{shot ? <img src={shot.objectUrl} alt="" /> : <i />}</span>
        <span>
          <strong>{group.label}</strong>
          <em>
            {count}/{group.max} · mín. {group.min}
          </em>
        </span>
        <b className={done ? 'is-check' : ''}>{done ? '✓' : `${Math.round((count / group.min) * 100)}%`}</b>
      </button>
    </li>
  );
}
