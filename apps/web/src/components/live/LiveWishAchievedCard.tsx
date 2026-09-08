import { Check } from 'lucide-react';
import { GiftIcon } from './FloatingGift';
import type { AchievedWish } from '../../lib/liveWishAchieved';

export function LiveWishAchievedCard({
  wish,
  leaving = false,
}: {
  wish: AchievedWish | null;
  leaving?: boolean;
}) {
  if (!wish) return null;
  const qtyLabel = `${wish.name} x${wish.quantity}`;
  return (
    <div
      className={`lb-live-wish-achieved${leaving ? ' is-leaving' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="lb-live-wish-achieved__icon" aria-hidden>
        <GiftIcon giftId={wish.giftId} size={28} />
        <span className="lb-live-wish-achieved__crown">♛</span>
      </span>
      <span className="lb-live-wish-achieved__copy">
        <span className="lb-live-wish-achieved__title">¡Deseo conseguido!</span>
        <span className="lb-live-wish-achieved__gift">{qtyLabel}</span>
        <span className="lb-live-wish-achieved__thanks">¡Gracias a todos!</span>
      </span>
      <span className="lb-live-wish-achieved__check" aria-hidden>
        <Check size={14} strokeWidth={2.8} />
      </span>
    </div>
  );
}
