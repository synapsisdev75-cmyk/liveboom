import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { findLiveGift } from '../../lib/liveboomGifts';
import { GiftIcon } from './FloatingGift';

type WishItem = {
  id: string;
  name: string;
};

export function LiveWishCarousel({
  giftIds,
  quantities,
  compact = false,
}: {
  giftIds: string[];
  quantities?: Record<string, number>;
  compact?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [groupMin, setGroupMin] = useState(0);
  const [duration, setDuration] = useState(16);

  const wishes = useMemo<WishItem[]>(
    () =>
      giftIds.map((id) => {
        const qty = Math.min(99, Math.max(1, Math.floor(Number(quantities?.[id]) || 1)));
        const name = findLiveGift(id)?.name || id;
        return {
          id,
          name: qty > 1 ? `${name} ×${qty}` : name,
        };
      }),
    [giftIds, quantities],
  );

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const measure = measureRef.current;
    if (!viewport || !measure || wishes.length === 0) return;

    const update = () => {
      const viewW = viewport.clientWidth;
      const contentW = measure.scrollWidth;
      const minW = Math.max(viewW, contentW);
      setGroupMin(minW);
      setDuration(Math.max(12, Math.min(32, minW / 36)));
    };

    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(viewport);
    ro?.observe(measure);
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [wishes]);

  if (wishes.length === 0) return null;

  const row = (hidden: boolean) => (
    <div
      className="lb-live-wish-marquee__group"
      style={groupMin ? { minWidth: groupMin } : undefined}
      aria-hidden={hidden || undefined}
    >
      {wishes.map((wish) => (
        <span key={wish.id} className="lb-live-wishlist__gift">
          <GiftIcon giftId={wish.id} size={compact ? 14 : 16} />
          <span className="lb-live-wishlist__gift-name">{wish.name}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div
      ref={viewportRef}
      className={`lb-live-wish-marquee${compact ? ' is-compact' : ''}`}
    >
      <div ref={measureRef} className="lb-live-wish-marquee__measure" aria-hidden>
        {wishes.map((wish) => (
          <span key={wish.id} className="lb-live-wishlist__gift">
            <GiftIcon giftId={wish.id} size={compact ? 14 : 16} />
            <span className="lb-live-wishlist__gift-name">{wish.name}</span>
          </span>
        ))}
      </div>
      <div
        className="lb-live-wish-marquee__track"
        style={{ animationDuration: `${duration}s` }}
      >
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
