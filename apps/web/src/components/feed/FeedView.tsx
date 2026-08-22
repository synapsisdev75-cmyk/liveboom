import { useEffect } from 'react';
import { apiPublic, type StreamDto } from '../../lib/api';
import { useUiStore } from '../../store/uiStore';
import { StreamCard } from './StreamCard';

export function FeedView() {
  const streams = useUiStore((s) => s.streams);
  const setStreams = useUiStore((s) => s.setStreams);
  const openStream = useUiStore((s) => s.openStream);

  useEffect(() => {
    void apiPublic<{ streams: StreamDto[] }>('/api/streams').then((data) => {
      setStreams(data.streams);
    });
  }, [setStreams]);

  return (
    <section className="flex h-full flex-col overflow-hidden">
      <header className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-boom-cyan">En vivo ahora</p>
        <h1 className="mt-1 text-2xl font-bold text-white">Explora transmisiones</h1>
      </header>
      <div className="grid grid-cols-1 gap-4 overflow-y-auto pr-1 md:grid-cols-2">
        {streams.map((stream) => (
          <StreamCard key={stream.id} stream={stream} onOpen={openStream} />
        ))}
      </div>
    </section>
  );
}
