export function BrandVideo({ className = '' }: { className?: string }) {
  return (
    <video
      className={`object-contain ${className}`}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      poster="/brand/logo.png"
      aria-label="Animación de marca Liveboom"
    >
      <source src="/brand/logo-reveal.mp4" type="video/mp4" />
    </video>
  );
}
