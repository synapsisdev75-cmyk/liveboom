import type { LiveAspectRatio } from '../../../lib/liveAspectRatio';
import type { LiveStudioFormat } from './liveStudioTypes';

type Props = {
  label?: string;
  format: LiveStudioFormat | LiveAspectRatio;
  resolution?: string;
  fps?: number | null;
  live?: boolean;
};

export function LivePreviewMeta({ label, format, resolution, fps, live }: Props) {
  const orientation =
    format === '16:9' ? '16:9' : format === 'dual' ? 'Dual' : '9:16';

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] flex justify-between gap-2 p-3">
      <span
        className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
          live ? 'bg-fuchsia-600 text-white' : 'bg-black/55 text-zinc-300 backdrop-blur'
        }`}
      >
        {live ? 'EN VIVO' : label || 'VISTA PREVIA'}
      </span>
      <div className="rounded-md bg-black/55 px-2 py-1 text-[10px] font-semibold text-zinc-200 backdrop-blur">
        {resolution ? <span>{resolution}</span> : null}
        {fps != null ? <span className="ml-2">{fps} FPS</span> : null}
        <span className="ml-2">{orientation}</span>
      </div>
    </div>
  );
}
