import { Lock, Unlock } from 'lucide-react';

type Props = {
  privateActive: boolean;
  unlocked?: boolean;
  interactive?: boolean;
  label?: string;
  onClick?: () => void;
};

/**
 * Candado ancla (debajo de Deseos).
 * Abierto mientras el LIVE es público o el viewer ya cumplió los regalos.
 * Cerrado cuando el LIVE es privado y aún faltan los regalos del candado.
 */
export function LivePrivacyLockButton({
  privateActive,
  unlocked = false,
  interactive = false,
  label,
  onClick,
}: Props) {
  const open = !privateActive || unlocked;
  const text =
    label ||
    (open && privateActive
      ? 'Privado desbloqueado'
      : privateActive
        ? 'LIVE privado'
        : 'LIVE público');
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onClick}
      className={`lb-live-privacy-lock${privateActive ? ' is-private' : ' is-public'}${
        open ? ' is-open' : ' is-closed'
      }${unlocked ? ' is-unlocked' : ''}${interactive ? ' is-interactive' : ''}`}
      aria-label={text}
    >
      <span className="lb-live-privacy-lock__icon" aria-hidden>
        {open ? <Unlock size={18} /> : <Lock size={18} />}
      </span>
      <span className="lb-live-privacy-lock__label">{text}</span>
    </button>
  );
}
