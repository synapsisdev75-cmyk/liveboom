import { useEffect, useState } from 'react';

type Props = {
  active: boolean;
  busy?: boolean;
  count: number;
  onToggle: () => void;
  onShowWho?: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xs';
  showCount?: boolean;
  className?: string;
};

const SIZES = {
  xs: 'h-6 w-6',
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
  lg: 'h-11 w-11',
} as const;

/** Like tipo Boom: transición suave entre icono línea (off) y boom a color (on). */
export function BoomLikeButton({
  active,
  busy,
  count,
  onToggle,
  onShowWho,
  size = 'md',
  showCount = true,
  className = '',
}: Props) {
  const [pop, setPop] = useState(false);

  useEffect(() => {
    if (!active) return;
    setPop(true);
    const t = window.setTimeout(() => setPop(false), 420);
    return () => window.clearTimeout(t);
  }, [active]);

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <button
        type="button"
        disabled={busy}
        onClick={onToggle}
        className="relative grid place-items-center disabled:opacity-50"
        aria-label={active ? 'Quitar boom' : 'Dar boom'}
        aria-pressed={active}
      >
        <span
          className={`relative ${SIZES[size]} transition-transform duration-300 ease-out ${
            pop ? 'lb-boom-pop' : active ? 'scale-110' : 'scale-100'
          }`}
        >
          <img
            src="/reactions/boom-off.png"
            alt=""
            draggable={false}
            className={`absolute inset-0 h-full w-full object-contain brightness-125 drop-shadow-[0_0_1px_rgba(255,255,255,0.9)] transition-all duration-300 ${
              active ? 'scale-75 opacity-0' : 'scale-100 opacity-100'
            }`}
          />
          <img
            src="/reactions/boom-on.png"
            alt=""
            draggable={false}
            className={`absolute inset-0 h-full w-full object-contain drop-shadow-[0_0_10px_rgba(251,146,60,0.55)] transition-all duration-300 ${
              active ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
            }`}
          />
        </span>
      </button>
      {showCount ? (
        <button
          type="button"
          disabled={!onShowWho || count === 0}
          onClick={onShowWho}
          className={`text-xs font-bold tabular-nums ${
            active ? 'text-amber-300' : count > 0 ? 'text-zinc-300' : 'text-zinc-600'
          } disabled:cursor-default`}
          aria-label="Quién dio boom-like"
        >
          {count}
        </button>
      ) : null}
    </span>
  );
}

type BoomProps = {
  active: boolean;
  busy?: boolean;
  count: number;
  onToggle: () => void;
  onShowWho?: () => void;
  compact?: boolean;
};

/** Botón BOOM aparte: contabiliza y muestra quién lo proporcionó. */
export function BoomActionButton({
  active,
  busy,
  count,
  onToggle,
  onShowWho,
  compact,
}: BoomProps) {
  const [pop, setPop] = useState(false);

  useEffect(() => {
    if (!active) return;
    setPop(true);
    const t = window.setTimeout(() => setPop(false), 420);
    return () => window.clearTimeout(t);
  }, [active]);

  return (
    <span className="relative inline-flex items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={onToggle}
        className={`inline-flex items-center gap-1.5 rounded-lg font-bold transition disabled:opacity-50 ${
          compact ? 'px-2 py-1.5 text-[11px]' : 'px-2.5 py-1.5 text-xs'
        } ${
          active
            ? 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/40'
            : 'text-violet-200 hover:bg-violet-500/10'
        }`}
        aria-label={active ? 'Quitar BOOM' : 'Dar BOOM'}
        aria-pressed={active}
      >
        <span className={`relative h-5 w-5 ${pop ? 'lb-boom-pop' : ''}`}>
          <img
            src="/reactions/boom-off.png"
            alt=""
            className={`absolute inset-0 h-full w-full object-contain brightness-125 drop-shadow-[0_0_1px_rgba(255,255,255,0.9)] transition-opacity duration-300 ${
              active ? 'opacity-0' : 'opacity-100'
            }`}
            draggable={false}
          />
          <img
            src="/reactions/boom-on.png"
            alt=""
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
              active ? 'opacity-100' : 'opacity-0'
            }`}
            draggable={false}
          />
        </span>
        BOOM
      </button>
      <button
        type="button"
        disabled={!onShowWho || count === 0}
        onClick={onShowWho}
        className={`rounded-md px-1.5 py-1 text-[11px] font-bold tabular-nums ${
          count > 0 ? 'text-violet-300 hover:bg-white/5' : 'text-zinc-600'
        } disabled:cursor-default`}
        aria-label="Quién dio BOOM"
      >
        {count}
      </button>
    </span>
  );
}
