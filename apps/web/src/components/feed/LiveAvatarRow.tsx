import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { categoryLabel } from '../../lib/categories';
import type { ActiveLiveFeedItem } from '../../lib/liveGiftsFirestore';

type Props = {
  streams: ActiveLiveFeedItem[];
};

const layoutTransition = { duration: 0.28, ease: 'easeInOut' as const };

/** Carrusel horizontal de avatares LIVE — preview sin contador de espectadores. */
export function LiveAvatarRow({ streams }: Props) {
  if (streams.length === 0) {
    return (
      <p className="lb-live-empty">
        No hay lives ahora. Pulsa <span className="text-cyan-300">Transmitir</span> para abrir el tuyo.
      </p>
    );
  }

  return (
    <div className="gift-row -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2">
      {streams.map((stream) => {
          const name = stream.displayName || stream.username;
          const initial = name.slice(0, 1).toUpperCase();
          return (
            <motion.div
              key={stream.username}
              layout
              layoutId={`live-rail-${stream.username}`}
              transition={layoutTransition}
              className="shrink-0"
            >
              <Link
                to={`/stream/${encodeURIComponent(stream.username)}`}
                className="lb-card group flex w-[5.25rem] shrink-0 flex-col items-center gap-1.5"
              >
                <span className="live-ring relative grid h-[4.75rem] w-[4.75rem] place-items-center rounded-full p-[3px] shadow-[0_0_20px_rgba(255,0,85,0.28)] transition duration-300 group-hover:scale-105">
                  <span className="relative grid h-full w-full place-items-center overflow-hidden rounded-full bg-zinc-950">
                    {stream.avatarUrl ? (
                      <img src={stream.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-lg font-black text-fuchsia-200">{initial}</span>
                    )}
                  </span>
                  <span className="pointer-events-none absolute -right-1 -top-1 z-10 rounded bg-fuchsia-600 px-1.5 py-[2px] text-[8px] font-black tracking-wide text-white shadow-md ring-1 ring-black/40">
                    LIVE
                  </span>
                </span>
                <span className="w-full truncate text-center text-[11px] font-semibold text-white">{name}</span>
                <span className="w-full truncate text-center text-[9px] text-zinc-500">
                  {categoryLabel(stream.category || 'otro')}
                </span>
              </Link>
            </motion.div>
          );
        })}
    </div>
  );
}
