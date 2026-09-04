/** Segmentos de progreso (Flash Boom / Boom Clip). */
export function StorySegmentBar({
  total,
  current,
  progress,
}: {
  total: number;
  current: number;
  progress: number;
}) {
  if (total <= 0) return null;
  const index = current - 1;
  return (
    <div
      className="pointer-events-none flex shrink-0 gap-1 pt-[max(0.5rem,var(--lb-safe-top))]"
      style={{
        paddingLeft: 'max(0.75rem, var(--lb-safe-left, env(safe-area-inset-left)))',
        paddingRight: 'max(0.75rem, var(--lb-safe-right, env(safe-area-inset-right)))',
      }}
    >
      {Array.from({ length: total }).map((_, segmentIndex) => {
        const fill =
          segmentIndex < index ? 100 : segmentIndex === index ? Math.min(100, Math.max(0, progress * 100)) : 0;
        return (
          <div
            key={segmentIndex}
            className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-white/25"
          >
            <div className="h-full rounded-full bg-white" style={{ width: `${fill}%` }} />
          </div>
        );
      })}
    </div>
  );
}
