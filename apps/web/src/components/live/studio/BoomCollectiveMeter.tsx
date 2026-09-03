import { LIVE_BOOM_ROUND_GOAL, boomRoundFillPercent } from '../../../lib/liveBoomRound';

const BOMB_SRC = '/reactions/boom-meter.png';
const BOMB_FALLBACK = '/reactions/boom-on.png';

type Props = {
  count: number;
  /** Ronda completa: pulso + mecha encendida */
  full?: boolean;
  /** Vibración previa a explosión */
  charging?: boolean;
};

/**
 * Medidor colectivo BOOM — bomba oficial izquierda, llenado de abajo hacia arriba.
 */
export function BoomCollectiveMeter({ count, full, charging }: Props) {
  const clamped = Math.min(Math.max(0, count), LIVE_BOOM_ROUND_GOAL);
  const fillPct = boomRoundFillPercent(clamped);
  const showHint = clamped === 0;

  return (
    <div
      data-boom-ignore
      className={`lb-boom-collective-meter pointer-events-none absolute left-[max(0.5rem,var(--lb-safe-left))] top-[58%] z-[19] hidden w-[4.75rem] -translate-y-1/2 flex-col items-center gap-1 lg:flex sm:w-[5.75rem] ${
        charging ? 'lb-boom-collective-meter--charge' : ''
      } ${full ? 'lb-boom-collective-meter--full' : ''}`}
      aria-label={`Boom colectivo ${clamped} de ${LIVE_BOOM_ROUND_GOAL}`}
    >
      {showHint ? (
        <p className="max-w-[5.75rem] text-center text-[9px] font-bold leading-tight text-white/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)] sm:text-[10px]">
          ¡Llena la bombita!
        </p>
      ) : null}

      <div className="relative aspect-square w-full">
        <img
          src={BOMB_SRC}
          alt=""
          draggable={false}
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src.includes('boom-meter')) img.src = BOMB_FALLBACK;
          }}
          className="absolute inset-0 h-full w-full object-contain opacity-[0.28]"
        />

        <div
          className="absolute inset-0 overflow-hidden transition-[clip-path] duration-300 ease-out"
          style={{ clipPath: `inset(${100 - fillPct}% 0 0 0)` }}
        >
          <img
            src={BOMB_SRC}
            alt=""
            draggable={false}
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src.includes('boom-meter')) img.src = BOMB_FALLBACK;
            }}
            className="absolute inset-0 h-full w-full object-contain"
          />
          <div
            className="pointer-events-none absolute inset-0 mix-blend-soft-light"
            style={{
              background: `linear-gradient(to top,
                rgba(236, 72, 153, 0.55) 0%,
                rgba(251, 146, 60, 0.45) 45%,
                rgba(34, 211, 238, 0.35) 100%)`,
            }}
          />
        </div>

        {full || fillPct >= 99 ? (
          <span className="lb-boom-collective-fuse pointer-events-none absolute -right-0.5 -top-1 h-4 w-4 rounded-full bg-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.95)]" />
        ) : null}
      </div>
    </div>
  );
}
