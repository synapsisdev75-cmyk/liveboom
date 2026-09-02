import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  action?: ReactNode;
};

/** Encabezado consistente para rails del Inicio. */
export function HomeSectionHeader({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel = 'Ver todos >',
  action,
}: Props) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[10px] text-zinc-500">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {action}
        {viewAllHref ? (
          <Link
            to={viewAllHref}
            className="text-[12px] font-semibold text-cyan-400 transition hover:text-cyan-200"
          >
            {viewAllLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
