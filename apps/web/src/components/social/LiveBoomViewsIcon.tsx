import { useId } from 'react';

/** Ojito LiveBoom: silueta neón que hereda el acento del tema. */
export function LiveBoomViewsIcon({
  size = 20,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const grad = `lb-views-grad-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`lb-views-icon ${className}`}
      aria-hidden
    >
      <defs>
        <linearGradient id={grad} x1="2" y1="12" x2="22" y2="12" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--accent-secondary)" />
          <stop offset="100%" stopColor="var(--accent-primary)" />
        </linearGradient>
      </defs>
      <path
        d="M2.2 12s3.5-6.4 9.8-6.4S21.8 12 21.8 12s-3.5 6.4-9.8 6.4S2.2 12 2.2 12Z"
        stroke={`url(#${grad})`}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.35" stroke={`url(#${grad})`} strokeWidth="1.45" />
      <circle cx="12" cy="12" r="1.4" fill={`url(#${grad})`} />
      <circle cx="13.25" cy="10.75" r="0.62" fill="currentColor" opacity="0.92" />
    </svg>
  );
}
