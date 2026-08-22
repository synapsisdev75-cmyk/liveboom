import { useEffect, useState } from 'react';
import { apiPublic } from '../../lib/api';

export type ReelItem = {
  id: string;
  username: string;
  title: string;
  dataUrl: string;
  shared: boolean;
  createdAt: string;
};

export function ReelsRow({ title = 'Reels del live' }: { title?: string }) {
  const [reels, setReels] = useState<ReelItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void apiPublic<{ reels: ReelItem[] }>('/api/stream/reels')
      .then((data: { reels: ReelItem[] }) => {
        if (!cancelled) setReels(data.reels || []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (reels.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold text-white">{title}</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {reels.map((reel) => (
          <article
            key={reel.id}
            className="w-36 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950"
          >
            <video src={reel.dataUrl} className="aspect-[9/16] w-full object-cover" muted playsInline controls />
            <div className="space-y-0.5 p-2">
              <p className="line-clamp-2 text-[11px] font-semibold text-white">{reel.title}</p>
              <p className="truncate text-[10px] text-zinc-500">@{reel.username}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
