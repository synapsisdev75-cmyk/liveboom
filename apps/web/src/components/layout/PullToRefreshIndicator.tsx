import { RefreshCw } from 'lucide-react';

type Props = {
  pullPx: number;
  refreshing: boolean;
  ready: boolean;
  threshold?: number;
};

/** TEMP: indicador visual de pull-to-refresh en móvil/tablet */
export function PullToRefreshIndicator({
  pullPx,
  refreshing,
  ready,
  threshold = 72,
}: Props) {
  if (pullPx <= 0 && !refreshing) return null;

  const progress = Math.min(1, pullPx / threshold);
  const rotation = progress * 220;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center lg:hidden"
      style={{
        height: Math.max(pullPx, refreshing ? threshold : 0),
        transition: pullPx === 0 && !refreshing ? 'height 0.2s ease' : undefined,
      }}
    >
      <div
        className="flex flex-col items-center justify-end gap-1 pb-2 pt-1"
        style={{ opacity: Math.min(1, 0.35 + progress * 0.65) }}
      >
        <RefreshCw
          size={22}
          strokeWidth={2.25}
          className={`text-cyan-300 ${refreshing ? 'animate-spin' : ''}`}
          style={{ transform: refreshing ? undefined : `rotate(${rotation}deg)` }}
        />
        <p className="text-[10px] font-semibold text-cyan-200/90">
          {refreshing ? 'Recargando…' : ready ? 'Suelta para recargar' : 'Desliza para recargar'}
        </p>
      </div>
    </div>
  );
}
