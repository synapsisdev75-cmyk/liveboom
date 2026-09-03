type Props = {
  className?: string;
  alt?: string;
  size?: number | string;
};

/** Icono oficial Batalla Boom / VS (PNG transparente). */
export function VsBattleIcon({ className = '', alt = 'VS', size }: Props) {
  const style =
    size == null
      ? undefined
      : {
          width: typeof size === 'number' ? `${size}px` : size,
          height: typeof size === 'number' ? `${size}px` : size,
        };
  return (
    <img
      src="/reactions/vs-battle.png"
      alt={alt}
      draggable={false}
      className={`inline-block object-contain ${className}`}
      style={style}
    />
  );
}
