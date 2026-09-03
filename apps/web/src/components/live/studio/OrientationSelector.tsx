import type { LiveStudioFormat } from './liveStudioTypes';

type Props = {
  value: LiveStudioFormat;
  onChange: (value: LiveStudioFormat) => void;
  compact?: boolean;
};

const OPTIONS: { id: LiveStudioFormat; label: string; hint: string }[] = [
  { id: '9:16', label: 'Vertical 9:16', hint: 'Móvil · cámara' },
  { id: '16:9', label: 'Horizontal 16:9', hint: 'Gaming · PC' },
  { id: 'dual', label: 'Dual', hint: 'H + V' },
];

export function OrientationSelector({ value, onChange, compact }: Props) {
  return (
    <div className="lb-live-studio-orient">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Formato</p>
      <div className={`flex ${compact ? 'flex-col gap-1.5' : 'flex-wrap gap-2'}`}>
        {OPTIONS.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`min-h-10 rounded-xl border px-3 py-2 text-left transition duration-200 ${
                active
                  ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-400/35'
                  : 'border-white/[0.08] bg-[#0f1016] text-zinc-300 hover:border-white/20'
              }`}
            >
              <span className="block text-xs font-bold">{opt.label}</span>
              {!compact ? (
                <span className="block text-[10px] text-zinc-500">{opt.hint}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
