import { BRAND_LOGO_SRC } from '../../lib/brand';

type LogoProps = {
  compact?: boolean;
  iconOnly?: boolean;
  large?: boolean;
  className?: string;
};

/** Logo oficial Liveboom (icono + wordmark). */
export function Logo({ compact = false, iconOnly = false, large = false, className = '' }: LogoProps) {
  const sizeClass = large
    ? 'h-40 w-auto max-w-[min(92vw,22rem)] sm:h-48'
    : compact
      ? 'h-9 w-auto max-w-[7rem]'
      : iconOnly
        ? 'h-20 w-auto max-w-[12rem]'
        : 'h-12 w-auto max-w-[10rem]';

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        src={BRAND_LOGO_SRC}
        alt="Liveboom"
        className={`object-contain mix-blend-screen ${sizeClass}`}
        draggable={false}
      />
    </div>
  );
}
