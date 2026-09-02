import { Eye, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';
import { UserAvatar } from '../profile/UserAvatar';
import { categoryLabel } from '../../lib/categories';
import type { ActiveLiveFeedItem } from '../../lib/liveGiftsFirestore';
import { LivePreviewVideo } from './LivePreviewVideo';

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(n);
}

type Props = {
  stream: ActiveLiveFeedItem;
};

/** Card Directos Top: preview en vivo + contador (solo lectura; no suma espectadores). */
export function TopLiveCard({ stream }: Props) {
  const name = stream.displayName || stream.username;
  const category = categoryLabel(stream.category || 'otro');
  const href = `/stream/${encodeURIComponent(stream.username)}`;

  return (
    <Link
      to={href}
      role="listitem"
      className="lb-card group flex w-[min(88vw,18.75rem)] shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-zinc-950/80 ring-1 ring-white/10 transition duration-300 hover:ring-fuchsia-400/35 hover:shadow-[0_0_24px_rgba(217,70,239,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 sm:w-[19.5rem]"
    >
      <div className="relative aspect-video overflow-hidden bg-zinc-900">
        <LivePreviewVideo
          username={stream.username}
          avatarUrl={stream.avatarUrl}
          displayName={name}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30" />
        <span className="live-dot absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-fuchsia-600 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-md">
          <Radio size={10} aria-hidden />
          En directo
        </span>
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold tabular-nums text-cyan-200">
          <Eye size={11} aria-hidden />
          {formatCount(stream.viewers || 0)}
        </span>
        <p className="absolute inset-x-0 bottom-0 line-clamp-2 px-2.5 pb-2 text-xs font-semibold text-white/95">
          {stream.title}
        </p>
      </div>

      <div className="flex items-center gap-2.5 p-2.5 sm:p-3">
        <UserAvatar
          uid={stream.uid}
          src={stream.avatarUrl}
          username={stream.username}
          size={40}
          ringClassName="ring-2 ring-fuchsia-500/70"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white group-hover:text-cyan-200">{name}</p>
          <p className="truncate text-[11px] text-zinc-400">@{stream.username}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-semibold text-zinc-300 ring-1 ring-white/10">
          {category}
        </span>
      </div>
    </Link>
  );
}
