import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiPublic } from '../lib/api';

type LiveStream = {
  username: string;
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  title: string;
  startedAt: string;
  viewers: number;
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
    <div className="flex min-h-full flex-col gap-4 rounded-2xl bg-zinc-900 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-bold text-white sm:text-xl">Lives en línea</h1>
        <p className="mt-1 text-sm text-zinc-400">Salas activas ahora mismo en Liveboom.</p>
      </div>
      {error ? <p className="text-sm text-fuchsia-400">{error}</p> : null}
      {streams.length === 0 && !error ? (
        <p className="text-sm text-zinc-400">
          No hay transmisiones LIVE todavía. Pulsa <span className="text-cyan-400">Transmitir</span> para
          abrir la tuya.
        </p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {streams.map((stream) => (
          <li key={`${stream.username}-${stream.startedAt}`} className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
            <Link to={`/stream/${encodeURIComponent(stream.username)}`} className="block">
              <div className="flex items-center gap-3">
                {stream.avatarUrl ? (
                  <img src={stream.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fuchsia-600/30 text-sm font-bold text-fuchsia-300">
                    LIVE
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">{stream.title}</p>
                  <p className="truncate text-xs text-zinc-400">@{stream.username}</p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
