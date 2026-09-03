import type { CSSProperties } from 'react';
import type { BoomBurst } from './useLiveBoomBursts';

const BOMB_SRC = '/reactions/boom-on.png';

type Props = {
  bursts: BoomBurst[];
};

/** Booms pequeños — riel derecho del video, suben y se difuminan. */
export function BoomReactionLayer({ bursts }: Props) {
  return (
    <div
      className="lb-live-boom-layer pointer-events-none absolute inset-0 z-[21] overflow-hidden"
      aria-hidden
    >
      {bursts.map((burst) => (
        <div
          key={burst.id}
          className="lb-live-boom-rise absolute bottom-[18%] right-[6%] sm:right-[7%]"
          style={
            {
              '--lb-boom-lateral': `${burst.lateralPx}px`,
              '--lb-boom-rot': `${burst.rot}deg`,
            } as CSSProperties
          }
        >
          <img
            src={BOMB_SRC}
            alt=""
            draggable={false}
            className="lb-live-boom-img h-12 w-12 object-contain sm:h-14 sm:w-14"
          />
        </div>
      ))}
    </div>
  );
}
