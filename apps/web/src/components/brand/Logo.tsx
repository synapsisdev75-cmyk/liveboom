type LogoProps = {
  compact?: boolean;
  iconOnly?: boolean;
  large?: boolean;
  className?: string;
};

/** Marca Liveboom — SVG sin fondo (evita el negro del PNG/video). */
export function Logo({ compact = false, iconOnly = false, large = false, className = '' }: LogoProps) {
  const size = large ? 'h-28 w-28 sm:h-32 sm:w-32' : compact ? 'h-9 w-9' : iconOnly ? 'h-16 w-16' : 'h-11 w-11';

  const mark = (
    <svg
      viewBox="0 0 64 64"
      className={`shrink-0 ${size} ${className}`}
      aria-hidden={iconOnly || compact ? true : undefined}
    >
      <defs>
        <linearGradient id="boom-grad" x1="8" y1="56" x2="56" y2="8">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="48%" stopColor="#00F0FF" />
          <stop offset="100%" stopColor="#F97316" />
        </linearGradient>
      </defs>
      <path
        d="M12 48c14-2 22-16 24-32"
        fill="none"
        stroke="url(#boom-grad)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M16 52c16-2 26-18 28-36"
        fill="none"
        stroke="url(#boom-grad)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M20 56c16-1 28-20 30-38"
        fill="none"
        stroke="url(#boom-grad)"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.45"
      />
      <path
        d="M10 54 L46 16"
        fill="none"
        stroke="url(#boom-grad)"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <path
        d="M46 8 l2.2 6.2 6.2 2.2-6.2 2.2-2.2 6.2-2.2-6.2-6.2-2.2 6.2-2.2z"
        fill="#F97316"
      />
    </svg>
  );

  if (iconOnly || compact) {
    return <div className={`flex items-center justify-center ${className}`}>{mark}</div>;
  }

  return (
    <div className="flex items-center gap-3">
      {mark}
      <span className="bg-gradient-to-r from-boom-blue via-boom-cyan to-boom-orange bg-clip-text text-xl font-extrabold tracking-tight text-transparent">
        Liveboom
      </span>
    </div>
  );
}
