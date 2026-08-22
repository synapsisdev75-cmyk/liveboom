import { Lock } from 'lucide-react';
import { useRef } from 'react';
import type { StreamDto } from '../../lib/api';

type Props = {
  stream: StreamDto;
  onOpen: (stream: StreamDto) => void;
};

export function StreamCard({ stream, onOpen }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <button
      type="button"
      onClick={() => onOpen(stream)}
      onMouseEnter={() => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = 0;
        void video.play().catch(() => undefined);
      }}
      onMouseLeave={() => {
        const video = videoRef.current;
        if (!video) return;
        video.pause();
        video.currentTime = 0;
      }}
      className="group relative overflow-hidden rounded-2xl border border-white/5 bg-boom-panel text-left"
    >
      <img src={stream.coverUrl} alt="" className="h-52 w-full object-cover transition duration-500 group-hover:opacity-0" />
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="metadata"
        src={stream.previewUrl}
        className="absolute inset-0 h-full w-full object-cover opacity-0 transition group-hover:opacity-100"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <span className="absolute left-3 top-3 rounded-md bg-boom-fuchsia px-2 py-0.5 text-[10px] font-bold text-white">
        EN VIVO
      </span>
      {stream.isPrivate ? (
        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-boom-gold">
          <Lock size={10} /> {stream.lockPrice} coins
        </span>
      ) : null}
      <div className="absolute bottom-3 left-3 right-3">
        <p className="text-sm font-semibold text-white">{stream.title}</p>
        <p className="text-xs text-zinc-300">
          {stream.creator.name} · {stream.creator.viewers} viendo
        </p>
      </div>
    </button>
  );
}
