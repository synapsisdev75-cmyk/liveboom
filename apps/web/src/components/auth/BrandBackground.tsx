type BrandBackgroundProps = {
  className?: string;
};

/** Video de marca a pantalla completa con overlay para integrarse al UI. */
export function BrandBackground({ className = '' }: BrandBackgroundProps) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <video
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-[0.28] brightness-[0.45] contrast-125 saturate-[1.35] blur-[1.5px]"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      >
        <source src="/brand/logo-reveal.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-boom-bg/82" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(0,240,255,0.14),_transparent_68%)]" />
    </div>
  );
}
