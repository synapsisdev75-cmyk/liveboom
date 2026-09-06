import { Box, Mountain, User } from 'lucide-react';
import type { ReconstructionSubjectKind } from '../../lib/reconstruction3d/types';
import { kindCopy } from '../../lib/reconstruction3d/catalog';

type Props = {
  value: ReconstructionSubjectKind;
  onChange: (kind: ReconstructionSubjectKind) => void;
};

const TABS: ReconstructionSubjectKind[] = ['person', 'object', 'landscape'];

function TabIcon({ kind }: { kind: ReconstructionSubjectKind }) {
  if (kind === 'person') return <User size={18} />;
  if (kind === 'landscape') return <Mountain size={18} />;
  return <Box size={18} />;
}

export function ReconstructionTabs({ value, onChange }: Props) {
  return (
    <div className="lb-recon-tabs" role="tablist" aria-label="Tipo de reconstrucción">
      {TABS.map((kind) => {
        const copy = kindCopy(kind);
        const active = value === kind;
        return (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={active}
            className={`lb-recon-tabs__item is-${kind} ${active ? 'is-active' : ''}`}
            onClick={() => onChange(kind)}
          >
            <TabIcon kind={kind} />
            <span>
              <strong>{copy.title}</strong>
              <em>{copy.subtitle}</em>
            </span>
          </button>
        );
      })}
    </div>
  );
}
