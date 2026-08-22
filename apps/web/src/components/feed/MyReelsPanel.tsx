import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { ReelItem } from './ReelsRow';

type Props = {
  username: string;
};

export function MyReelsPanel({ username }: Props) {
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void api<{ reels: ReelItem[] }>(`/api/stream/reels/${encodeURIComponent(username)}?mine=1`)
      .then((data) => setReels(data.reels || []))
      .catch(() => undefined);
  }, [username]);

  async function toggleShare(reel: ReelItem) {
    setNote(null);
    try {
      const updated = await api<{ reel: ReelItem }>(`/api/stream/reels/${reel.id}/share`, {
        method: 'PATCH',
        body: JSON.stringify({ username, shared: !reel.shared }),
      });
      setReels((current) => current.map((item) => (item.id === reel.id ? updated.reel : item)));
      setNote(updated.reel.shared ? 'Reel compartido en el inicio.' : 'Reel oculto del feed.');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo actualizar el reel');
    }
  }

  if (reels.length === 0) return null;

  return (
    <section className="mt-8 space-y-3 border-t border-zinc-800 pt-6">
      <h2 className="text-base font-bold text-white">Mis reels del live</h2>
      {note ? <p className="text-xs text-cyan-300">{note}</p> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {reels.map((reel) => (
          <article key={reel.id} className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950">
            <video src={reel.dataUrl} className="aspect-[9/16] w-full object-cover" muted playsInline controls />
            <div className="space-y-2 p-2">
              <p className="line-clamp-2 text-xs font-semibold text-white">{reel.title}</p>
              <button
                type="button"
                onClick={() => void toggleShare(reel)}
                className="w-full rounded-lg border border-cyan-400/30 px-2 py-1.5 text-[11px] font-semibold text-cyan-300"
              >
                {reel.shared ? 'Ocultar del inicio' : 'Compartir en inicio'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
