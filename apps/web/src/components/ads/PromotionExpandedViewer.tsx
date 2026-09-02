import { ChevronLeft, ChevronRight, ExternalLink, Megaphone, X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import type { PromotionAd } from '../../lib/promotionsFirestore';
import { isPromotionVideoUrl, promotionHref } from '../../lib/promotionLinks';

type Props = {
  ads: PromotionAd[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onManageMine?: () => void;
  isOwner?: boolean;
};

function PromoSlide({ ad }: { ad: PromotionAd }) {
  const isVideo = ad.mediaUrl ? isPromotionVideoUrl(ad.mediaUrl) : false;
  if (!ad.mediaUrl) {
    return (
      <div className="grid h-full w-full place-items-center bg-gradient-to-br from-fuchsia-600/50 via-violet-800/40 to-cyan-500/30 px-6">
        <p className="text-center text-2xl font-black text-white sm:text-3xl">{ad.title}</p>
      </div>
    );
  }
  if (isVideo) {
    return (
      <video
        src={ad.mediaUrl}
        className="h-full w-full object-contain"
        muted
        playsInline
        autoPlay
        loop
        controls
        preload="metadata"
      />
    );
  }
  return <img src={ad.mediaUrl} alt={ad.title} className="h-full w-full object-contain" />;
}

export function PromotionExpandedViewer({
  ads,
  index,
  onIndexChange,
  onClose,
  onManageMine,
  isOwner = false,
}: Props) {
  const navigate = useNavigate();
  const ad = ads[index];
  if (!ad) return null;

  const href = promotionHref(ad);
  const external = href.startsWith('http://') || href.startsWith('https://');
  const hasMultiple = ads.length > 1;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && hasMultiple) {
        onIndexChange((index - 1 + ads.length) % ads.length);
      }
      if (event.key === 'ArrowRight' && hasMultiple) {
        onIndexChange((index + 1) % ads.length);
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [ads.length, hasMultiple, index, onClose, onIndexChange]);

  function goPrev() {
    onIndexChange((index - 1 + ads.length) % ads.length);
  }

  function goNext() {
    onIndexChange((index + 1) % ads.length);
  }

  function goToTarget() {
    if (external) {
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(href);
    onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-black/92 p-3 pt-[max(0.75rem,var(--lb-safe-top))] pb-[max(0.75rem,var(--lb-safe-bottom))] backdrop-blur-md sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Publicidad patrocinada"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200">Patrocinado</p>
          <p className="truncate text-base font-bold text-white sm:text-lg">{ad.title}</p>
          <p className="truncate text-xs text-zinc-400">@{ad.ownerUsername}</p>
          {isOwner && onManageMine ? (
            <button
              type="button"
              onClick={onManageMine}
              className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-fuchsia-400/35 bg-fuchsia-500/15 px-3 text-[11px] font-bold text-fuchsia-100"
            >
              <Megaphone size={12} /> Publicidad promocionada
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10 text-white"
          aria-label="Cerrar"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="relative flex w-full max-w-[min(100%,76rem)] items-center justify-center px-8 sm:px-14">
          {hasMultiple ? (
            <button
              type="button"
              onClick={goPrev}
              className="lb-promo-nav lb-promo-nav--prev absolute left-0 z-20 grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-black/35 text-white/80 backdrop-blur-sm sm:h-12 sm:w-12"
              aria-label="Publicidad anterior"
            >
              <ChevronLeft size={22} />
            </button>
          ) : null}

          <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_0_48px_rgba(168,85,247,0.2)]">
            <div
              className="flex transition-transform duration-500 ease-in-out motion-reduce:transition-none"
              style={{ transform: `translate3d(-${index * 100}%, 0, 0)` }}
            >
              {ads.map((item) => (
                <div key={item.id} className="w-full shrink-0">
                  <div className="relative aspect-[3/1] w-full">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <PromoSlide ad={item} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200 backdrop-blur-sm">
              Publicidad {hasMultiple ? `${index + 1}/${ads.length}` : ''}
            </span>
          </div>

          {hasMultiple ? (
            <button
              type="button"
              onClick={goNext}
              className="lb-promo-nav lb-promo-nav--next absolute right-0 z-20 grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-black/35 text-white/80 backdrop-blur-sm sm:h-12 sm:w-12"
              aria-label="Siguiente publicidad"
            >
              <ChevronRight size={22} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 pt-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-zinc-300"
        >
          Cerrar
        </button>
        {external ? (
          <button
            type="button"
            onClick={goToTarget}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-5 text-sm font-bold text-zinc-950"
          >
            Ir al anuncio <ExternalLink size={16} />
          </button>
        ) : (
          <Link
            to={href}
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-5 text-sm font-bold text-zinc-950"
          >
            Ir al anuncio
          </Link>
        )}
      </div>
    </div>,
    document.body,
  );
}
