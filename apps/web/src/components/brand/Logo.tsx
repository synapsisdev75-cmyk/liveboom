type LogoProps = {
  compact?: boolean;
};

/** Marca Liveboom: arco de señal + destello en degradado. */
export function Logo({ compact = false }: LogoProps) {
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 64 64" className="h-10 w-10 shrink-0" aria-hidden="true">
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
      {compact ? null : (
        <span className="text-xl font-extrabold tracking-tight text-white">
          Live<span className="font-semibold text-zinc-300">boom</span>
        </span>
      )}
    </div>
  );
}
