export const PRIVACY_LOCK_OPEN_SRC = '/live/privacy-lock-open.png';
export const PRIVACY_LOCK_CLOSED_SRC = '/live/privacy-lock-closed.png';

type Props = {
  /** true = abierto con ✓; false = cerrado con ✗ */
  open: boolean;
  className?: string;
};

/** Arte 3D del candado (abierto / cerrado) según la fase del LIVE. */
export function PrivacyLockArt({ open, className = 'lb-live-privacy-lock__art' }: Props) {
  return (
    <img
      src={open ? PRIVACY_LOCK_OPEN_SRC : PRIVACY_LOCK_CLOSED_SRC}
      alt=""
      draggable={false}
      className={className}
    />
  );
}
