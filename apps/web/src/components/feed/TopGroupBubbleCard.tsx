import { Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { LiveGroup } from '../../lib/groupsFirestore';

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(n);
}

const RANK_RING: Record<number, string> = {
  0: 'bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600 shadow-[0_0_18px_rgba(251,191,36,0.35)]',
  1: 'bg-gradient-to-br from-zinc-200 via-zinc-300 to-zinc-500',
  2: 'bg-gradient-to-br from-orange-400 via-amber-600 to-orange-700',
};

type Props = {
  group: LiveGroup;
  rank: number;
};

/** Burbuja circular de grupo top para carrusel horizontal. */
export function TopGroupBubbleCard({ group, rank }: Props) {
  const ring = RANK_RING[rank] ?? 'bg-white/10 ring-1 ring-white/15';
  const href = `/grupos?group=${encodeURIComponent(group.id)}`;

  return (
    <Link
      to={href}
      role="listitem"
      aria-label={`${group.name}, ${formatCount(group.memberCount)} miembros`}
      className="group flex w-[5.75rem] shrink-0 snap-start flex-col items-center gap-1.5 transition hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 sm:w-[6.25rem]"
    >
      <span className={`relative grid h-[4.85rem] w-[4.85rem] place-items-center rounded-full p-[3px] ${ring}`}>
        <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-zinc-950">
          {group.photoUrl ? (
            <img
              src={group.photoUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-lg font-black text-fuchsia-200">{group.name.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        {rank < 3 ? (
          <span
            className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-px text-[9px] font-black tabular-nums text-zinc-950 ${
              rank === 0 ? 'bg-amber-300' : rank === 1 ? 'bg-zinc-200' : 'bg-orange-300'
            }`}
          >
            #{rank + 1}
          </span>
        ) : null}
      </span>
      <span className="w-full truncate text-center text-[11px] font-semibold text-white group-hover:text-cyan-200">
        {group.name}
      </span>
      <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-500">
        <Users size={10} aria-hidden />
        {formatCount(group.memberCount)} miembros
      </span>
    </Link>
  );
}
