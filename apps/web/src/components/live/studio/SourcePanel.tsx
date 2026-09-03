import { Mic, Monitor, Volume2, Video } from 'lucide-react';
import type { StudioSource } from './liveStudioTypes';

type Props = {
  sources: StudioSource[];
  onToggleVisibility?: (id: StudioSource['id']) => void;
  onConfigure?: (id: StudioSource['id']) => void;
  onAddSource?: () => void;
};

const ICONS = {
  camera: Video,
  screen: Monitor,
  mic: Mic,
  'game-audio': Volume2,
} as const;

function stateLabel(state: StudioSource['state']) {
  switch (state) {
    case 'active':
      return '● Activa';
    case 'sharing':
      return '● Compartiendo';
    case 'muted':
      return '● Silenciado';
    case 'error':
      return '● Error';
    default:
      return '○ Apagada';
  }
}

function stateColor(state: StudioSource['state']) {
  switch (state) {
    case 'active':
    case 'sharing':
      return 'text-emerald-400';
    case 'muted':
      return 'text-amber-300';
    case 'error':
      return 'text-rose-400';
    default:
      return 'text-zinc-500';
  }
}

export function SourcePanel({ sources, onToggleVisibility, onConfigure, onAddSource }: Props) {
  return (
    <div className="lb-live-studio-sources rounded-2xl border border-white/[0.08] bg-[#12131a] p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Fuentes</p>
      <ul className="mt-3 space-y-2">
        {sources.map((source) => {
          const Icon = ICONS[source.id];
          return (
            <li
              key={source.id}
              className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-[#0f1016] px-2.5 py-2"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5 text-cyan-300">
                <Icon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{source.label}</p>
                <p className={`text-[10px] font-medium ${stateColor(source.state)}`}>
                  {stateLabel(source.state)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {onToggleVisibility ? (
                  <button
                    type="button"
                    onClick={() => onToggleVisibility(source.id)}
                    className="rounded-lg px-2 py-1 text-[10px] font-semibold text-zinc-400 hover:bg-white/5 hover:text-white"
                    title={source.visible ? 'Ocultar' : 'Mostrar'}
                  >
                    {source.visible ? 'Ocultar' : 'Mostrar'}
                  </button>
                ) : null}
                {onConfigure ? (
                  <button
                    type="button"
                    onClick={() => onConfigure(source.id)}
                    className="rounded-lg px-2 py-1 text-[10px] font-semibold text-zinc-400 hover:bg-white/5 hover:text-white"
                    title="Configurar"
                  >
                    ···
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {onAddSource ? (
        <button
          type="button"
          onClick={onAddSource}
          className="mt-3 flex h-9 w-full items-center justify-center rounded-xl border border-dashed border-white/15 text-xs font-semibold text-zinc-400 transition hover:border-cyan-400/40 hover:text-cyan-200"
        >
          + Agregar fuente
        </button>
      ) : null}
    </div>
  );
}
