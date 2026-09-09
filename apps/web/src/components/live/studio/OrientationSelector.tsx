import type { LiveStudioFormat } from './liveStudioTypes';

type Props = {
  value: LiveStudioFormat;
  onChange: (value: LiveStudioFormat) => void;
  compact?: boolean;
};

const OPTIONS: { id: LiveStudioFormat; label: string; hint: string }[] = [
  { id: '9:16', label: 'Vertical 9:16', hint: 'Móvil · cámara' },
  { id: '16:9', label: 'Horizontal 16:9', hint: 'Gaming · PC' },
];

export function OrientationSelector({ value, onChange, compact }: Props) {
  const selected = value === '16:9' ? '16:9' : '9:16';
  return (
    <div className="lb-live-studio-orient">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Formato</p>
      <div className={compact ? 'flex flex-col gap-1.5' : 'grid grid-cols-2 gap-2'}>
        {OPTIONS.map((opt) => {
          const active = selected === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`lb-live-orient-opt min-h-10 w-full rounded-xl px-3 py-2 text-left transition duration-200 ${
                active ? 'is-active' : ''
              }`}
            >
              <span className="block text-xs font-bold">{opt.label}</span>
              {!compact ? (
                <span className="lb-live-orient-opt__hint block text-[10px]">{opt.hint}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
