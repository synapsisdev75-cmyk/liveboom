import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Gift, Radio } from 'lucide-react';
import { apiPublic } from '../../lib/api';

export type LiveActivity = {
  username: string;
  displayName: string;
  title: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  viewers: number;
  coinsEarned?: number;
  goalCoins?: number;
  goalLabel?: string;
  topGifters?: { uid?: string; name: string; coins: number }[];
};

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms?: number) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export function ActivityHistory({
  username,
  compact = false,
  limit = 8,
  showAllLink = true,
}: {
  username: string;
  compact?: boolean;
  limit?: number;
  showAllLink?: boolean;
}) {
  const [lives, setLives] = useState<LiveActivity[]>([]);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    void apiPublic<{ lives: LiveActivity[] }>(
      `/api/stream/history?username=${encodeURIComponent(username)}`,
    )
      .then((data) => {
        if (!cancelled) setLives(data.lives || []);
      })
      .catch(() => {
        if (!cancelled) setLives([]);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (compact) {
    if (lives.length === 0) {
      return <p className="mt-3 text-sm text-zinc-400">Aún no has transmitido.</p>;
    }
    return (
      <ul className="mt-3 space-y-2">
        {lives.slice(0, limit).map((live) => (
          <li key={`${live.username}-${live.startedAt}`} className="text-xs text-zinc-400">
            <p className="font-semibold text-zinc-200">{live.title}</p>
            <p>
              {formatDuration(live.durationMs)} · {(live.coinsEarned || 0).toLocaleString('es-CO')} coins
            </p>
            {live.topGifters && live.topGifters.length > 0 ? (
              <p className="truncate text-[10px] text-cyan-400">
                Top: {live.topGifters[0]?.name} ({live.topGifters[0]?.coins})
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className="rounded-2xl bg-zinc-900 p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <Radio size={18} className="text-fuchsia-400" />
          Historial de actividad
        </h2>
        {showAllLink ? (
          <Link to="/actividad" className="text-xs text-cyan-400 hover:underline">
            Ver todo
          </Link>
        ) : null}
      </div>
      {lives.length === 0 ? (
        <p className="text-sm text-zinc-500">Cuando termines un live, aquí verás duración, coins y top regalos.</p>
      ) : (
        <ul className="space-y-3">
          {lives.slice(0, limit).map((live) => (
            <li
              key={`${live.username}-${live.startedAt}`}
              className="rounded-xl border border-white/10 bg-zinc-950/70 p-3"
            >
              <p className="font-semibold text-white">{live.title}</p>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} /> {formatDuration(live.durationMs)}
                </span>
                <span>{formatWhen(live.endedAt || live.startedAt)}</span>
                <span>{(live.coinsEarned || 0).toLocaleString('es-CO')} coins</span>
                <span>{live.viewers} viewers</span>
              </p>
              {live.goalLabel && live.goalCoins ? (
                <p className="mt-1 text-[11px] text-amber-300">
                  Meta: {live.goalLabel} · {Math.min(live.coinsEarned || 0, live.goalCoins).toLocaleString('es-CO')}/
                  {live.goalCoins.toLocaleString('es-CO')}
                </p>
              ) : null}
              {live.topGifters && live.topGifters.length > 0 ? (
                <p className="mt-2 flex items-start gap-1 text-xs text-cyan-300">
                  <Gift size={12} className="mt-0.5 shrink-0" />
                  <span>
                    Mejor enviaron:{' '}
                    {live.topGifters
                      .slice(0, 3)
                      .map((item) => `${item.name} (${item.coins})`)
                      .join(' · ')}
                  </span>
                </p>
              ) : (
                <p className="mt-2 text-xs text-zinc-600">Sin regalos en esa transmisión.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
