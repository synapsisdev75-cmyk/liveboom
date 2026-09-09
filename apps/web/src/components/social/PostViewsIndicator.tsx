import { formatViewCount, usePostViews } from '../../lib/postViews';
import { LiveBoomViewsIcon } from './LiveBoomViewsIcon';

type Variant = 'rail' | 'pill';

export function PostViewsIndicator({
  postId,
  variant,
  initialViews = 0,
  recordMode = 'visible',
}: {
  postId?: string | null;
  variant: Variant;
  initialViews?: number;
  recordMode?: 'open' | 'visible';
}) {
  const id = String(postId || '').trim();
  const { views, setHost } = usePostViews(id || undefined, recordMode, initialViews);
  if (!id) return null;

  const label = `Vistas: ${formatViewCount(views)}`;
  const iconSize = variant === 'rail' ? 28 : 22;

  return (
    <span
      ref={setHost}
      className={
        variant === 'rail'
          ? 'lb-views-indicator lb-views-indicator--rail'
          : 'lb-views-indicator lb-views-indicator--pill'
      }
      aria-label={label}
      title={label}
    >
      <LiveBoomViewsIcon size={iconSize} />
      <span className="lb-views-indicator__count">{formatViewCount(views)}</span>
    </span>
  );
}
