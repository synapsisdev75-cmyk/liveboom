type LogoProps = {
  compact?: boolean;
};

/** Marca Liveboom: logo oficial con degradado azul–cian–naranja. */
export function Logo({ compact = false }: LogoProps) {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/brand/logo.png"
        alt=""
        className={`shrink-0 object-contain ${compact ? 'h-9 w-9' : 'h-11 w-11'}`}
      />
      {compact ? null : (
        <span className="bg-gradient-to-r from-boom-blue via-boom-cyan to-boom-orange bg-clip-text text-xl font-extrabold tracking-tight text-transparent">
          Liveboom
        </span>
      )}
    </div>
  );
}
