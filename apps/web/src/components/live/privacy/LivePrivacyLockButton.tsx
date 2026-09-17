import { Lock, Unlock } from 'lucide-react';

type Props = {
  privateActive: boolean;
  unlocked?: boolean;
  interactive?: boolean;
  label?: string;
  onClick?: () => void;
};

/** Candado ancla (debajo de Deseos). Público / privado / desbloqueado. */
export function LivePrivacyLockButton({
  privateActive,
  unlocked = false,
  interactive = false,
  label,
  onClick,
}: Props) {
  const text =
    label ||
    (unlocked && privateActive
      ? 'Privado desbloqueado'
      : privateActive
        ? 'LIVE privado'
        : 'LIVE público');
  const open = unlocked || !privateActive;
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onClick}
      className={`lb-live-privacy-lock${privateActive ? ' is-private' : ' is-public'}${
        unlocked ? ' is-unlocked' : ''
      }${interactive ? ' is-interactive' : ''}`}
      aria-label={text}
    >
      <span className="lb-live-privacy-lock__icon" aria-hidden>
        {open && !privateActive ? <Lock size={18} /> : unlocked ? <Unlock size={18} /> : <Lock size={18} />}
      </span>
      <span className="lb-live-privacy-lock__label">{text}</span>
    </button>
  );
}
