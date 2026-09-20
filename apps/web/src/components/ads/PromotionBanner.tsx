import { ExternalLink } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import type { PromotionAd } from '../../lib/promotionsFirestore';
import { isPromotionVideoUrl } from '../../lib/promotionLinks';

type Props = {
  ad: PromotionAd;
  className?: string;
  compact?: boolean;
  onOpen?: () => void;
  preview?: boolean;
};

export function PromotionBanner({ ad, className = '', compact = false, onOpen, preview = false }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const isVideo = ad.mediaUrl ? isPromotionVideoUrl(ad.mediaUrl) : false;
  const mediaClass = compact
    ? 'aspect-[3/1] max-h-24 w-full object-contain'
    : 'aspect-[3/1] max-h-48 w-full object-contain';

  useEffect(() => {
    if (preview || !ad.id) return;
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    let visibleMs = 0;
    let last = 0;
    let sent = false;
    let intersecting = false;
    const tick = () => {
      if (document.visibilityState !== 'visible' || !intersecting) {
        last = 0;
        return;
      }
      const now = Date.now();
      if (last) visibleMs += now - last;
      last = now;
      if (!sent && visibleMs >= 1000) {
        sent = true;
        void api(`/api/ads/promotions/${encodeURIComponent(ad.id)}/event`, {
          method: 'POST',
          body: JSON.stringify({ type: 'impression' }),
        }).catch(() => undefined);
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries[0];
        intersecting = Boolean(hit && hit.isIntersecting && hit.intersectionRatio >= 0.5);
        last = intersecting ? Date.now() : 0;
      },
      { threshold: [0.5] },
    );
    io.observe(node);
    const timer = window.setInterval(tick, 400);
    const onVis = () => {
      if (document.visibilityState !== 'visible') last = 0;
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ad.id, preview]);

  const media = ad.mediaUrl ? (
    isVideo ? (
      <video
        src={ad.mediaUrl}
        className={mediaClass}
        muted
        playsInline
        autoPlay={!preview}
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
    <div ref={rootRef}>
      <div className="relative overflow-hidden rounded-xl border border-white/10">
        {media}
        <span className="absolute left-2 top-2 rounded-md bg-black/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200 backdrop-blur-sm">
          Publicidad
        </span>
      </div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`truncate font-bold text-white ${compact ? 'text-sm' : 'text-base'}`}>{ad.title}</p>
          <p className="mt-0.5 truncate text-[11px] text-zinc-400">@{ad.ownerUsername}</p>
        </div>
        <ExternalLink size={14} className="mt-1 shrink-0 text-zinc-500" />
      </div>
    </div>
  );

  const shell = `block min-h-[44px] w-full rounded-xl text-left transition hover:opacity-95 active:scale-[0.99] ${className}`;

  function open() {
    if (!preview) {
      void api(`/api/ads/promotions/${encodeURIComponent(ad.id)}/event`, {
        method: 'POST',
        body: JSON.stringify({ type: 'click' }),
      }).catch(() => undefined);
    }
    onOpen?.();
  }

  if (onOpen) {
    return (
      <button type="button" onClick={open} className={shell}>
        {body}
      </button>
    );
  }

  return <div className={shell}>{body}</div>;
}
