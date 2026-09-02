import { useState } from 'react';
import { avatarInitial, resolveUserAvatar } from '../../lib/userAvatar';
import { useAuthorAvatar } from '../../hooks/useAuthorAvatar';

type Size = 'xs' | 'sm' | 'md' | 'lg' | number;

const SIZE_PX: Record<Exclude<Size, number>, number> = {
  xs: 28,
  sm: 36,
  md: 44,
  lg: 48,
};

type Props = {
  /** URL directa si ya la tienes. */
  src?: string | null;
  /** Si pasas uid, se carga/cachea `avatarUrl` oficial del perfil. */
  uid?: string | null;
  username?: string | null;
  displayName?: string | null;
  size?: Size;
  className?: string;
  ringClassName?: string;
  alt?: string;
};

/**
 * Avatar de usuario LiveBoom — una sola resolución + fallback de inicial.
 * Solo muestra inicial si no hay foto o la URL falló al cargar.
 */
export function UserAvatar({
  src,
  uid,
  username,
  displayName,
  size = 'md',
  className = '',
  ringClassName = '',
  alt = '',
}: Props) {
  const resolvedFromHook = useAuthorAvatar(uid, src);
  const preferred = resolveUserAvatar(src) || resolvedFromHook;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImg = preferred && preferred !== failedUrl;
  const px = typeof size === 'number' ? size : SIZE_PX[size];
  const letter = avatarInitial(username, displayName);
  const fontSize = Math.max(10, Math.round(px * 0.38));

  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-zinc-800 ${ringClassName} ${className}`}
      style={{ width: px, height: px, minWidth: px, minHeight: px }}
      aria-hidden={alt ? undefined : true}
    >
      {showImg ? (
        <img
          src={preferred}
          alt={alt}
          width={px}
          height={px}
          className="h-full w-full object-cover"
          draggable={false}
          onError={() => setFailedUrl(preferred)}
        />
      ) : (
        <span
          className="grid h-full w-full place-items-center font-bold uppercase text-fuchsia-200"
          style={{ fontSize }}
        >
          {letter}
        </span>
      )}
    </span>
  );
}
