import { Camera, Gamepad2, Monitor } from 'lucide-react';
import type { BroadcastMode } from './liveStudioTypes';

type Props = {
  value: BroadcastMode;
  onChange: (mode: BroadcastMode) => void;
};

const MODES: {
  id: BroadcastMode;
  title: string;
  desc: string;
  icon: typeof Camera;
}[] = [
  { id: 'camera', title: 'Cámara', desc: 'Cámara como fuente principal', icon: Camera },
  { id: 'screen', title: 'Pantalla', desc: 'Pantalla, ventana o app', icon: Monitor },
  { id: 'gaming', title: 'Gaming', desc: 'Juego + cámara + audio', icon: Gamepad2 },
];

export function BroadcastModeSelector({ value, onChange }: Props) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Transmisión</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {MODES.map((mode) => {
          const active = value === mode.id;
          const Icon = mode.icon;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onChange(mode.id)}
              className={`rounded-xl border p-3 text-left transition duration-200 ${
                active
                  ? 'border-violet-400/50 bg-violet-500/12 ring-1 ring-violet-400/35'
                  : 'border-white/[0.08] bg-[#0f1016] hover:border-white/20'
              }`}
            >
              <Icon
                size={18}
                className={active ? 'text-violet-300' : 'text-zinc-400'}
              />
              <span className="mt-2 block text-sm font-bold text-white">{mode.title}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-zinc-500">{mode.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
