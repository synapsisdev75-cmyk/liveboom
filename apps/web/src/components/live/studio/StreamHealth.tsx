import type { ConnectionQuality } from './liveStudioTypes';

type Props = {
  quality: ConnectionQuality;
  resolution?: string;
  fps?: number | null;
  bitrateKbps?: number | null;
};

function qualityLabel(q: ConnectionQuality) {
  switch (q) {
    case 'excellent':
      return 'Excelente';
    case 'stable':
      return 'Estable';
    case 'unstable':
      return 'Inestable';
    case 'reconnecting':
      return 'Reconectando';
    default:
      return 'Desconectado';
  }
}

function qualityDot(q: ConnectionQuality) {
  switch (q) {
    case 'excellent':
      return 'bg-emerald-400';
    case 'stable':
      return 'bg-cyan-400';
    case 'unstable':
      return 'bg-amber-400';
    case 'reconnecting':
      return 'bg-amber-300 animate-pulse';
    default:
      return 'bg-rose-500';
  }
}

export function StreamHealth({ quality, resolution, fps, bitrateKbps }: Props) {
  return (
    <div className="lb-live-studio-health rounded-2xl border border-white/[0.08] bg-[#12131a] p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Estado</p>
      <div className="mt-3 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-zinc-400">Conexión</span>
          <span className="flex items-center gap-1.5 font-semibold text-white">
            <span className={`h-2 w-2 rounded-full ${qualityDot(quality)}`} />
            {qualityLabel(quality)}
          </span>
        </div>
        {resolution ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-400">Resolución</span>
            <span className="font-semibold text-zinc-200">{resolution}</span>
          </div>
        ) : null}
        {fps != null ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-400">FPS</span>
            <span className="font-semibold text-zinc-200">{fps}</span>
          </div>
        ) : null}
        {bitrateKbps != null ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-400">Bitrate</span>
            <span className="font-semibold text-zinc-200">{bitrateKbps} kbps</span>
          </div>
        ) : null}
      </div>
      {quality === 'reconnecting' ? (
        <p className="mt-2 text-[10px] font-medium text-amber-200">Reconectando transmisión…</p>
      ) : null}
    </div>
  );
}
