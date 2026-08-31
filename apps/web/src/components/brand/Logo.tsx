import { BRAND_LOGO_SRC } from '../../lib/brand';

type LogoProps = {
  compact?: boolean;
  iconOnly?: boolean;
  large?: boolean;
  className?: string;
};

/** Logo oficial Liveboom (wordmark LIVE + BOOM). */
export function Logo({ compact = false, iconOnly = false, large = false, className = '' }: LogoProps) {
  const sizeClass = large
    ? 'h-44 w-auto max-w-[min(92vw,24rem)] sm:h-52'
    : compact
      ? 'h-14 w-auto max-w-[11rem]'
      : iconOnly
        ? 'h-28 w-auto max-w-[16rem]'
        : 'h-20 w-auto max-w-[14rem] sm:h-24 sm:max-w-[16rem]';

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        src={BRAND_LOGO_SRC}
        alt="Liveboom"
        className={`object-contain ${sizeClass}`}
        draggable={false}
      />
    </div>
  );
}
