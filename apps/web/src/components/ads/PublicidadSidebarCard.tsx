import { Megaphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PromotionAd } from '../../lib/promotionsFirestore';
import { PromotionBannerCarousel } from './PromotionBannerCarousel';

type Props = {
  ads: PromotionAd[];
  myAds: PromotionAd[];
  loggedIn: boolean;
  onConfigure: () => void;
  onManageMyPromotions: () => void;
  /** Default true = sidebar compacto. False = banner más alto (p. ej. Crear). */
  compact?: boolean;
  className?: string;
};

export function PublicidadSidebarCard({
  ads,
  myAds,
  loggedIn,
  onConfigure,
  onManageMyPromotions,
  compact = true,
  className = '',
}: Props) {
  const hasAds = ads.length > 0;
  const hasMyAds = myAds.length > 0;

  return (
    <section
      className={`lb-ad-promo-card w-full min-w-0 rounded-2xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-600/35 via-violet-800/25 to-pink-600/15 p-3.5 shadow-[0_0_24px_rgba(168,85,247,0.12)] ${className}`}
    >
      <p className="lb-ad-promo-card__kicker flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-fuchsia-200">
        <Megaphone size={12} className="shrink-0" />
        Publicidad
      </p>

      {hasAds ? (
        <div className="mt-2.5">
          <PromotionBannerCarousel
            ads={ads}
            compact={compact}
            onManageMine={hasMyAds ? onManageMyPromotions : undefined}
          />
        </div>
      ) : (
        <div className="mt-2.5 space-y-1">
          <p className="text-sm font-bold leading-snug text-white">Llega a tu audiencia por región</p>
          <p className="text-[11px] leading-relaxed text-zinc-300">
            Promociona tu live, marca o contenido en la zona de tu audiencia.
          </p>
        </div>
      )}

      <div className="mt-3 flex w-full flex-col gap-2">
        {hasMyAds ? (
          <button
            type="button"
            onClick={onManageMyPromotions}
            className="lb-ad-promo-card__mine flex w-full min-h-10 items-center justify-center gap-1.5 rounded-xl border border-fuchsia-400/35 bg-fuchsia-500/10 px-3 py-2 text-center text-[11px] font-bold text-fuchsia-100"
          >
            <Megaphone size={13} />
            Publicidad promocionada
          </button>
        ) : null}
        {loggedIn ? (
          <button
            type="button"
            onClick={onConfigure}
            className="lb-ad-promo-card__cta flex w-full min-h-11 items-center justify-center rounded-xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400 px-3 py-2.5 text-center text-xs font-bold leading-tight text-zinc-950 shadow-md transition hover:brightness-105"
          >
            Configurar y comprar
          </button>
        ) : (
          <Link
            to="/login"
            className="lb-ad-promo-card__cta flex w-full min-h-11 items-center justify-center rounded-xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400 px-3 py-2.5 text-center text-xs font-bold leading-tight text-zinc-950 shadow-md"
          >
            Inicia sesión para publicitar
          </Link>
        )}
      </div>
    </section>
  );
}
