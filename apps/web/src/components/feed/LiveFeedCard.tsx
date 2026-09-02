import { Lock, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';

export type LiveFeedItem = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  title: string;
  viewers: number;
  isPrivate?: boolean;
};

type Props = {
  stream: LiveFeedItem;
};

export function LiveFeedCard({ stream }: Props) {
  const initial = (stream.displayName || stream.username).slice(0, 1).toUpperCase();

  return (
    <Link
      to={`/stream/${encodeURIComponent(stream.username)}`}
      className="group relative block aspect-[9/16] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-[0_0_24px_rgba(0,0,0,0.35)] transition hover:border-cyan-400/40 hover:shadow-[0_0_28px_rgba(0,240,255,0.12)]"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-600/35 via-zinc-900 to-cyan-500/25" />
      {stream.avatarUrl ? (
        <img
          src={stream.avatarUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-80 transition duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-4xl font-black text-white/20">{initial}</div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
      <div className="absolute left-3 top-3 flex flex-wrap gap-2">
        <span className="live-dot flex items-center gap-1 rounded-md bg-fuchsia-600 px-2 py-1 text-[10px] font-bold text-white">
          <Radio size={10} /> EN VIVO
        </span>
        {stream.isPrivate ? (
          <span className="flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[10px] font-semibold text-amber-300">
            <Lock size={10} /> Privado
          </span>
        ) : null}
      </div>
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="line-clamp-2 text-sm font-bold text-white">{stream.title}</p>
        <p className="truncate text-xs text-zinc-300">@{stream.username}</p>
      </div>
    </Link>
  );
}
