import { useMemo, type CSSProperties } from 'react';
import { findLiveGift } from '../../lib/liveboomGifts';
import { LIVE_WISH_ACTIVE_MAX } from '../../lib/liveGiftsFirestore';
import { GiftIcon } from './FloatingGift';

const HEX_TONES = ['cyan', 'gold', 'magenta', 'violet', 'lime'] as const;

type HexWish = {
  id: string;
  name: string;
  coins: number;
  qty: number;
  tone: (typeof HEX_TONES)[number];
};

export function LiveWishHexStage({
  giftIds,
  quantities,
}: {
  giftIds: string[];
  quantities?: Record<string, number>;
}) {
  const items = useMemo<HexWish[]>(
    () =>
      giftIds.slice(0, LIVE_WISH_ACTIVE_MAX).map((id, index) => {
        const gift = findLiveGift(id);
        const qty = Math.min(99, Math.max(1, Math.floor(Number(quantities?.[id]) || 1)));
        return {
          id,
          name: gift?.name || id,
          coins: gift?.coins ?? 0,
          qty,
          tone: HEX_TONES[index % HEX_TONES.length] ?? 'cyan',
        };
      }),
    [giftIds, quantities],
  );

  if (items.length === 0) return null;

  const n = items.length;
  const pct = Math.round((n / LIVE_WISH_ACTIVE_MAX) * 100);

  return (
    <div
      className={`lb-live-wish-hex${n === 1 ? ' is-single' : ''}`}
      data-n={n}
      style={{ '--hex-pct': `${pct}%` } as CSSProperties}
      aria-label={`Deseos ${n} de ${LIVE_WISH_ACTIVE_MAX}`}
    >
      <div className="lb-live-wish-hex__glass" aria-hidden />
      <div className="lb-live-wish-hex__floor" aria-hidden />
      <header className="lb-live-wish-hex__head">
        <p className="lb-live-wish-hex__title">
          DESEOS {n} / {LIVE_WISH_ACTIVE_MAX}
        </p>
        <div className="lb-live-wish-hex__bar" aria-hidden>
          <span className="lb-live-wish-hex__bar-fill" />
        </div>
      </header>
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
                  {item.qty > 1 ? (
                    <span className="lb-live-wish-hex__qty">×{item.qty}</span>
                  ) : null}
                  <span className="lb-live-wish-hex__art">
                    <GiftIcon giftId={item.id} size={26} />
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
