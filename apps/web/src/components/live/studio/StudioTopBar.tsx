import { Radio } from 'lucide-react';
import type { BroadcastState } from './liveStudioTypes';

type Props = {
  live?: boolean;
  durationSec?: number;
  viewers?: number;
  broadcastState?: BroadcastState;
};

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function StudioTopBar({ live, durationSec = 0, viewers, broadcastState }: Props) {
  const showLive = live || broadcastState === 'live';
  return (
    <header className="lb-live-studio-top flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
      <div className="min-w-0">
        <h1 className="text-lg font-black tracking-tight text-white sm:text-xl">
          LiveBoom <span className="text-cyan-400">Studio</span>
        </h1>
        {broadcastState === 'reconnecting' ? (
          <p className="text-[11px] font-medium text-amber-200">Reconectando transmisión…</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {showLive ? (
          <span className="live-dot inline-flex items-center gap-1 rounded-md bg-fuchsia-600 px-2 py-1 text-[11px] font-bold text-white">
            <Radio size={11} /> LIVE
          </span>
        ) : null}
        {showLive && durationSec > 0 ? (
          <span className="rounded-md bg-black/40 px-2 py-1 text-[11px] font-semibold tabular-nums text-zinc-200">
            {formatDuration(durationSec)}
          </span>
        ) : null}
        {viewers != null ? (
          <span className="rounded-md bg-black/40 px-2 py-1 text-[11px] font-semibold text-cyan-300">
            {viewers.toLocaleString('es-CO')} espectadores
          </span>
        ) : null}
      </div>
    </header>
  );
}
