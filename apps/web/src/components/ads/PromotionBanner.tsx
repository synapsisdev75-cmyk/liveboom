import { ExternalLink } from 'lucide-react';
import type { PromotionAd } from '../../lib/promotionsFirestore';
import { isPromotionVideoUrl } from '../../lib/promotionLinks';

type Props = {
  ad: PromotionAd;
  className?: string;
  /** Más compacto en sidebar. */
  compact?: boolean;
  /** Al tocar, abre visor expandido en lugar de navegar. */
  onOpen?: () => void;
};

export function PromotionBanner({ ad, className = '', compact = false, onOpen }: Props) {
  const isVideo = ad.mediaUrl ? isPromotionVideoUrl(ad.mediaUrl) : false;
  const mediaClass = compact
    ? 'aspect-[3/1] max-h-24 w-full object-cover'
    : 'aspect-[3/1] max-h-48 w-full object-cover';

  const media = ad.mediaUrl ? (
    isVideo ? (
      <video
        src={ad.mediaUrl}
        className={mediaClass}
        muted
        playsInline
        autoPlay
        loop
        preload="metadata"
      />
    ) : (
      <img src={ad.mediaUrl} alt="" className={mediaClass} />
    )
  ) : (
    <div
      className={`grid w-full place-items-center bg-gradient-to-br from-fuchsia-600/40 via-violet-700/30 to-cyan-500/20 ${
        compact ? 'aspect-[3/1] max-h-24' : 'aspect-[3/1] max-h-48'
      }`}
    >
      <span className="px-3 text-center text-sm font-bold text-white">{ad.title}</span>
    </div>
  );

  const body = (
    <>
      <div className="relative overflow-hidden rounded-xl border border-white/10">
        {media}
        <span className="absolute left-2 top-2 rounded-md bg-black/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200 backdrop-blur-sm">
          Patrocinado
        </span>
      </div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`truncate font-bold text-white ${compact ? 'text-sm' : 'text-base'}`}>{ad.title}</p>
          <p className="mt-0.5 truncate text-[11px] text-zinc-400">@{ad.ownerUsername}</p>
        </div>
        <ExternalLink size={14} className="mt-1 shrink-0 text-zinc-500" />
      </div>
    </>
  );

  const shell = `block min-h-[44px] w-full rounded-xl text-left transition hover:opacity-95 active:scale-[0.99] ${className}`;

  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} className={shell}>
        {body}
      </button>
    );
  }

  return <div className={shell}>{body}</div>;
}
