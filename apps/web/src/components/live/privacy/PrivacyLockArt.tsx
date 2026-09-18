export const PRIVACY_LOCK_IDLE_SRC = '/live/privacy-lock-off-v3.png';
export const PRIVACY_LOCK_OPEN_SRC = '/live/privacy-lock-open-v3.png';
export const PRIVACY_LOCK_CLOSED_SRC = '/live/privacy-lock-closed-v3.png';

type Appearance = 'public' | 'collecting' | 'sealed';

type Props = {
  /** true = desactivado; false = privado. Ignorado si hay appearance. */
  open?: boolean;
  appearance?: Appearance;
  className?: string;
};

function resolveAppearance(appearance: Appearance | undefined, open: boolean | undefined): Appearance {
  if (appearance) return appearance;
  return open === false ? 'sealed' : 'public';
}

function srcFor(kind: Appearance): string {
  if (kind === 'sealed') return PRIVACY_LOCK_CLOSED_SRC;
  if (kind === 'collecting') return PRIVACY_LOCK_OPEN_SRC;
  return PRIVACY_LOCK_IDLE_SRC;
}

/** Desactivado / abierto / privado según la fase del candado. */
export function PrivacyLockArt({
  open,
  appearance,
  className = 'lb-live-privacy-lock__art',
}: Props) {
  const kind = resolveAppearance(appearance, open);
  return (
    <img
      src={srcFor(kind)}
      alt=""
      draggable={false}
      className={className}
    />
  );
}
