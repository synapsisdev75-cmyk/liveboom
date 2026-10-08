type BrandBackgroundProps = {
  className?: string;
};

/** Fondo escenario LiveBoom (cover, sin deformar). */
export function BrandBackground({ className = '' }: BrandBackgroundProps) {
  return (
    <div
      className={`lb-brand-background pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      data-lb-surface="dark"
      aria-hidden="true"
    >
      <img
        src="/assets/auth/background-liveboom.png"
        alt=""
        className="lb-auth-bg__img"
        width={1024}
        height={576}
        decoding="async"
      />
      <div className="lb-auth-bg__veil" />
    </div>
  );
}
