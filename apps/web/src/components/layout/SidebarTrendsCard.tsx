import { Hash } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listenTopTrends, type TrendTag } from '../../lib/trendsFirestore';

type Props = {
  onNavigate?: () => void;
  className?: string;
  limit?: number;
};

/** Tendencias (antes en el rail derecho). */
export function SidebarTrendsCard({ onNavigate, className = '', limit = 5 }: Props) {
  const [trends, setTrends] = useState<TrendTag[]>([]);

  useEffect(() => listenTopTrends(setTrends), []);

  return (
    <section className={`lb-panel rounded-2xl p-3${className ? ` ${className}` : ''}`}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          <Hash size={12} className="text-fuchsia-300" /> Tendencias
        </p>
        <Link
          to="/tendencias"
          onClick={onNavigate}
          className="text-[10px] font-semibold text-cyan-400 hover:underline"
        >
          Ver más
        </Link>
      </div>
      {trends.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-500">Publica con #hashtags para crear tendencias.</p>
      ) : (
        <ol className="mt-2 space-y-1.5">
          {trends.slice(0, limit).map((row, i) => (
            <li key={row.tag}>
              <Link
                to={`/tendencias?tag=${encodeURIComponent(row.tag)}`}
                onClick={onNavigate}
                className="lb-card flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-white/5"
              >
                <span className="w-4 text-[11px] font-bold text-zinc-600">{i + 1}</span>
                <span className="lb-entity lb-entity-hashtag min-w-0 flex-1 truncate text-xs font-semibold">
                  #{row.tag}
                </span>
                <span className="text-[10px] text-zinc-500">{row.count} pub.</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
