import { useEffect, useState } from 'react';
import { LiveFeedCard } from '../components/feed/LiveFeedCard';
import { ReelsRow } from '../components/feed/ReelsRow';
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
};

export function HomeView() {
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await apiPublic<{ streams: LiveStream[] }>('/api/stream/live');
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
  }, []);

  return (
    <div className="flex min-h-full flex-col gap-6 rounded-2xl bg-zinc-900 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-bold text-white sm:text-xl">Lives en línea</h1>
        <p className="mt-1 text-sm text-zinc-400">Salas activas ahora mismo en Liveboom.</p>
      </div>
      {error ? <p className="text-sm text-fuchsia-400">{error}</p> : null}
      {streams.length === 0 && !error ? (
        <p className="text-sm text-zinc-400">
          No hay transmisiones LIVE todavía. Pulsa <span className="text-cyan-400">Transmitir</span> para abrir la
          tuya.
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
