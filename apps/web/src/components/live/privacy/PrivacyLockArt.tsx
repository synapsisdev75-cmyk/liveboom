export const PRIVACY_LOCK_IDLE_SRC = '/live/privacy-lock-idle.png';
export const PRIVACY_LOCK_OPEN_SRC = '/live/privacy-lock-open.png';
export const PRIVACY_LOCK_CLOSED_SRC = '/live/privacy-lock-closed.png';

type Props = {
  /** true = público / sin privado (contorno); false = privado cerrado 3D */
  open: boolean;
  className?: string;
};

/** Contorno cuando no hay privado; 3D cerrado cuando el LIVE está privado. */
export function PrivacyLockArt({ open, className = 'lb-live-privacy-lock__art' }: Props) {
  return (
    <img
      src={open ? PRIVACY_LOCK_IDLE_SRC : PRIVACY_LOCK_CLOSED_SRC}
      alt=""
      draggable={false}
      className={`${className}${open ? ' is-idle' : ''}`}
    />
  );
}
