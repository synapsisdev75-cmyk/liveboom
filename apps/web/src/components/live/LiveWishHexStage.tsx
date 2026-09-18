import { useMemo } from 'react';
import { LIVE_WISH_ACTIVE_MAX } from '../../lib/liveGiftsFirestore';
import { GiftIcon } from './FloatingGift';

const HEX_TONES = ['cyan', 'gold', 'magenta', 'violet', 'lime'] as const;

type HexWish = {
  id: string;
  target: number;
  received: number;
  tone: (typeof HEX_TONES)[number];
};

function HexCard({ item }: { item: HexWish }) {
  return (
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
  );
}

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
  const running = n >= 1;
  const duration = Math.max(10, Math.min(32, 8 + n * 4.2));
  const group = (hidden: boolean, copy: string) => (
    <div className="lb-live-wish-hex__group" aria-hidden={hidden || undefined}>
      {items.map((item, index) => (
        <div key={`${copy}-${item.id}-${index}`} className="lb-live-wish-hex__slot">
          <HexCard item={item} />
        </div>
      ))}
    </div>
  );

  return (
    <div
      className={`lb-live-wish-hex${running ? ' is-run' : ' is-single'}`}
      data-n={n}
      aria-label={`${n} deseos activos`}
    >
      <div className="lb-live-wish-hex__scene">
        <div
          className="lb-live-wish-hex__track"
          style={running ? { animationDuration: `${duration}s` } : undefined}
        >
          {group(false, 'a')}
          {running ? group(true, 'b') : null}
        </div>
      </div>
    </div>
  );
}
