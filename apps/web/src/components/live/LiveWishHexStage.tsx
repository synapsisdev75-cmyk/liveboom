import { useMemo, type CSSProperties } from 'react';
import { findLiveGift } from '../../lib/liveboomGifts';
import { LIVE_WISH_ACTIVE_MAX } from '../../lib/liveGiftsFirestore';
import { GiftIcon } from './FloatingGift';

const HEX_TONES = ['cyan', 'gold', 'magenta', 'violet', 'lime'] as const;

type HexWish = {
  id: string;
  name: string;
  coins: number;
  target: number;
  remaining: number;
  tone: (typeof HEX_TONES)[number];
};

export function LiveWishHexStage({
  giftIds,
  quantities,
  received,
}: {
  giftIds: string[];
  quantities?: Record<string, number>;
  received?: Record<string, number>;
}) {
  const items = useMemo<HexWish[]>(
    () =>
      giftIds.slice(0, LIVE_WISH_ACTIVE_MAX).flatMap((id, index) => {
        const gift = findLiveGift(id);
        const target = Math.min(99, Math.max(1, Math.floor(Number(quantities?.[id]) || 1)));
        const got = Math.max(0, Math.floor(Number(received?.[id]) || 0));
        const remaining = Math.max(0, target - got);
        if (remaining <= 0) return [];
        return [
          {
            id,
            name: gift?.name || id,
            coins: gift?.coins ?? 0,
            target,
            remaining,
            tone: HEX_TONES[index % HEX_TONES.length] ?? 'cyan',
          },
        ];
      }),
    [giftIds, quantities, received],
  );

  if (items.length === 0) return null;

  const n = items.length;

  return (
    <div
      className={`lb-live-wish-hex${n === 1 ? ' is-single' : ''}`}
      data-n={n}
      aria-label={`${n} deseos activos`}
    >
      <div className="lb-live-wish-hex__scene">
        <div className="lb-live-wish-hex__ring">
          {items.map((item, index) => (
            <div
              key={`${item.id}-${index}`}
              className="lb-live-wish-hex__slot"
              style={{ '--i': index } as CSSProperties}
            >
              <article className="lb-live-wish-hex__hex" data-tone={item.tone}>
                <span className="lb-live-wish-hex__glow" aria-hidden />
                <div className="lb-live-wish-hex__face">
                  <span className="lb-live-wish-hex__qty">
                    {item.target}/{item.remaining}
                  </span>
                  <span className="lb-live-wish-hex__art">
                    <GiftIcon giftId={item.id} size={22} />
                  </span>
                  <p className="lb-live-wish-hex__name">{item.name}</p>
                  <p className="lb-live-wish-hex__coins">{item.coins} coin</p>
                </div>
              </article>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
