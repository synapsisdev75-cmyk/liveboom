import { motion } from 'framer-motion';
import type { ActiveLiveFeedItem } from '../../lib/liveGiftsFirestore';
import { HomeSectionHeader } from './HomeSectionHeader';
import { HorizontalScrollRail } from './HorizontalScrollRail';
import { TopLiveCard } from './TopLiveCard';

type Props = {
  streams: ActiveLiveFeedItem[];
};

const layoutTransition = { duration: 0.28, ease: 'easeInOut' as const };

/** Rail horizontal de Directos Top (lista ya rankeada; máx. TOP_LIVE_LIMIT). */
export function TopLivesRail({ streams }: Props) {
  return (
    <section className="w-full min-w-0">
      <HomeSectionHeader
        title="Directos top"
        subtitle="En vivo ahora · descubre quién transmite"
        viewAllHref="/explorar"
      />
      {streams.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-zinc-500">
          No hay directos ahora. Pulsa <span className="text-cyan-300">Transmitir</span> para abrir el
          tuyo.
        </p>
      ) : (
        <HorizontalScrollRail ariaLabel="Directos top">
          {streams.map((stream) => (
            <motion.div
              key={stream.username}
              layout
              layoutId={`live-rail-${stream.username}`}
              transition={layoutTransition}
              className="shrink-0 snap-start"
            >
              <TopLiveCard stream={stream} />
            </motion.div>
          ))}
        </HorizontalScrollRail>
      )}
    </section>
  );
}
