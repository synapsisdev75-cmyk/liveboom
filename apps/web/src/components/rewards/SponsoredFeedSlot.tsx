import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { adRewardsApi, type AdSurface, type SponsoredCampaign } from '../../lib/adRewardsApi';
import { claimAdTurn, isUnsafeAdContext, releaseAdTurn } from '../../lib/adRewardCadence';
import { SponsoredRewardCard } from './SponsoredRewardCard';

/**
 * Punto seguro del feed: solo pide campaña cuando ya pasó el intervalo de uso activo
 * y el espacio está por entrar en pantalla. Si no toca, no ocupa altura.
 */
export function SponsoredFeedSlot({ surface }: { surface: AdSurface }) {
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const [campaign, setCampaign] = useState<SponsoredCampaign | null>(null);
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    if (campaign) return;
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || cancelled) return;
        if (isUnsafeAdContext(pathRef.current)) return;
        if (!claimAdTurn()) return;
        void adRewardsApi
          .feed(surface)
          .then((out) => {
            if (cancelled) {
              releaseAdTurn(false);
              return;
            }
            releaseAdTurn(Boolean(out.campaign));
            if (out.campaign) setCampaign(out.campaign);
          })
          .catch(() => releaseAdTurn(false));
      },
      { rootMargin: '0px 0px 480px 0px' },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [campaign, surface]);

  return (
    <div ref={ref} className={campaign ? undefined : 'mb-0'}>
      {campaign ? <SponsoredRewardCard campaign={campaign} /> : null}
    </div>
  );
}
