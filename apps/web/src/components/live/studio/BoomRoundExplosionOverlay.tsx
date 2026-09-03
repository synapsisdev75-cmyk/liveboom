import type { CSSProperties } from 'react';

const BOMB_SRC = '/reactions/boom-meter.png';
const BOMB_FALLBACK = '/reactions/boom-on.png';

type Props = {
  active: boolean;
};

/** Explosión grande al completar 300 Boom colectivos. */
export function BoomRoundExplosionOverlay({ active }: Props) {
  if (!active) return null;
  return (
    <div className="lb-boom-round-explosion pointer-events-none absolute inset-0 z-[24] flex items-center justify-center overflow-hidden">
      <div className="lb-boom-round-explosion-core relative flex flex-col items-center">
        <div className="lb-boom-round-explosion-burst absolute inset-0 rounded-full bg-amber-400/25 blur-2xl" />
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className="lb-boom-round-explosion-particle absolute block h-2 w-2 rounded-full bg-amber-300"
            style={
              {
                '--lb-particle-angle': `${i * 36}deg`,
              } as CSSProperties
            }
          />
        ))}
        <img
          src={BOMB_SRC}
          alt=""
          draggable={false}
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src.includes('boom-meter')) img.src = BOMB_FALLBACK;
          }}
          className="lb-boom-round-explosion-img relative h-28 w-28 object-contain sm:h-36 sm:w-36"
        />
        <p className="lb-boom-round-explosion-text relative mt-2 text-4xl font-black uppercase tracking-wider text-amber-200 sm:text-5xl">
          BOOM!
        </p>
      </div>
    </div>
  );
}
