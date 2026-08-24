import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { LiveFeedCard } from '../components/feed/LiveFeedCard';
import { ReelsRow } from '../components/feed/ReelsRow';
import { CategoryChips } from '../components/search/CategoryChips';
import { categoryLabel } from '../lib/categories';
import { apiPublic } from '../lib/api';

type LiveStream = {
  username: string;
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  title: string;
  startedAt: string;
  viewers: number;
  isPrivate?: boolean;
  category?: string;
};

export function HomeView() {
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [category, setCategory] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const query = category ? `?category=${encodeURIComponent(category)}` : '';
        const data = await apiPublic<{ streams: LiveStream[] }>(`/api/stream/live${query}`);
        if (!cancelled) {
          setStreams(data.streams || []);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el feed en vivo');
        }
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [category]);

  return (
    <div className="flex min-h-full flex-col gap-6 rounded-2xl bg-zinc-900 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white sm:text-xl">Lives en línea</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {category
              ? `Categoría: ${categoryLabel(category)}`
              : 'Salas activas ahora mismo en Liveboom.'}
          </p>
        </div>
        <Link
          to="/explorar"
          className="inline-flex items-center gap-2 rounded-full bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-300 ring-1 ring-cyan-400/30"
        >
          <Compass size={16} />
          Explorar posts
        </Link>
      </div>

      <CategoryChips value={category} onChange={setCategory} />

      {error ? <p className="text-sm text-fuchsia-400">{error}</p> : null}
      {streams.length === 0 && !error ? (
        <p className="text-sm text-zinc-400">
          {category
            ? `No hay lives en ${categoryLabel(category)} ahora.`
            : 'No hay transmisiones LIVE todavía. Pulsa '}
          {!category ? <span className="text-cyan-400">Transmitir</span> : null}
          {!category ? ' para abrir la tuya.' : null}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {streams.map((stream) => (
          <LiveFeedCard key={`${stream.username}-${stream.startedAt}`} stream={stream} />
        ))}
      </div>
      <ReelsRow />
    </div>
  );
}
