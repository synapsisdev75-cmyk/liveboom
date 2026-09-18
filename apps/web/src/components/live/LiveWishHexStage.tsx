import { useMemo, type CSSProperties } from 'react';
import { LIVE_WISH_ACTIVE_MAX } from '../../lib/liveGiftsFirestore';
import { GiftIcon } from './FloatingGift';

const HEX_TONES = ['cyan', 'gold', 'magenta', 'violet', 'lime'] as const;

type HexWish = {
  id: string;
  target: number;
  received: number;
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
        const target = Math.min(99, Math.max(1, Math.floor(Number(quantities?.[id]) || 1)));
        const got = Math.max(0, Math.floor(Number(received?.[id]) || 0));
        if (got >= target) return [];
        return [
          {
            id,
            target,
            received: got,
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
                  <span className="lb-live-wish-hex__art">
                    <GiftIcon giftId={item.id} size={28} />
                  </span>
                  <span className="lb-live-wish-hex__qty">
                    {item.received}/{item.target}
                  </span>
                </div>
              </article>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
