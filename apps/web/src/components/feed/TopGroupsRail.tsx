import { Link } from 'react-router-dom';
import type { LiveGroup } from '../../lib/groupsFirestore';
import { HomeSectionHeader } from './HomeSectionHeader';
import { HorizontalScrollRail } from './HorizontalScrollRail';
import { TopGroupBubbleCard } from './TopGroupBubbleCard';

type Props = {
  groups: LiveGroup[];
  limit?: number;
};

/** Rail horizontal de grupos top con burbujas circulares. */
export function TopGroupsRail({ groups, limit = 12 }: Props) {
  const topGroups = groups.slice(0, limit);

  return (
    <section className="w-full min-w-0">
      <HomeSectionHeader
        title="Grupos top"
        subtitle="Comunidades con más miembros"
        viewAllHref="/grupos"
      />
      {topGroups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-zinc-500">
          Aún no hay grupos.{' '}
          <Link to="/grupos?tab=crear" className="text-cyan-400 underline">
            Crea el primero
          </Link>
        </p>
      ) : (
        <HorizontalScrollRail ariaLabel="Grupos top">
          {topGroups.map((group, index) => (
            <TopGroupBubbleCard key={group.id} group={group} rank={index} />
          ))}
        </HorizontalScrollRail>
      )}
    </section>
  );
}
