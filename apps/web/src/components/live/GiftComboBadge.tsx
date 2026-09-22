const MAX_BADGE = 10;

export function giftComboBadgeSrc(combo: number): string {
  const n = Math.min(MAX_BADGE, Math.max(1, Math.floor(combo) || 1));
  return `/gifts/multipliers/x${n}.png`;
}

type Props = {
  combo: number;
  /** Compact overlay so gift video stays visible. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

/**
 * Neon x1–x10 badge: aparece pequeño → pop (misma animación para todos).
 * No tapa el centro del regalo; solo capa visual encima.
 */
export function GiftComboBadge({ combo, size = 'md', className = '' }: Props) {
  const n = Math.min(MAX_BADGE, Math.max(1, Math.floor(combo) || 1));
  if (!Number.isFinite(combo) || combo < 1) return null;

  return (
    <div
      className={`lb-gift-combo-badge lb-gift-combo-badge--${size}${className ? ` ${className}` : ''}`}
      aria-hidden
    >
      <img
        key={n}
        src={giftComboBadgeSrc(n)}
        alt=""
        className="lb-gift-combo-badge__img"
        draggable={false}
        decoding="async"
      />
    </div>
  );
}
