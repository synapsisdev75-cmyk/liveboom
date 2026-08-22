import { listLiveStreams } from '@liveboom/dataconnect';
import { useEffect, useState } from 'react';
import { dataConnect } from '../lib/firebase';

export function HomeView() {
  const [streams, setStreams] = useState<
    Awaited<ReturnType<typeof listLiveStreams>>['data']['streams']
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listLiveStreams(dataConnect)
      .then((result) => setStreams(result.data.streams))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'No se pudo leer Cloud SQL');
      });
  }, []);

  return (
    <div className="flex min-h-full flex-col gap-4 rounded-2xl bg-zinc-900 p-6">
      <h1 className="text-xl font-bold text-white">Lives</h1>
      {error ? <p className="text-sm text-fuchsia-400">{error}</p> : null}
      {streams.length === 0 && !error ? (
        <p className="text-sm text-zinc-400">No hay transmisiones LIVE todavía.</p>
      ) : null}
      <ul className="grid gap-3">
        {streams.map((stream) => (
          <li key={stream.id} className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
            <p className="font-semibold text-white">{stream.title}</p>
            <p className="text-xs text-zinc-400">
              @{stream.creator.username}
              {stream.isPrivate ? ' · privado' : ' · público'}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
