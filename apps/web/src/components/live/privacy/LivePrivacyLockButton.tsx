import {
  privacyLockAppearance,
  type PrivateLivePhase,
} from '../../../lib/livePrivateAccessFirestore';
import { PrivacyLockArt } from './PrivacyLockArt';

type Props = {
  privateActive: boolean;
  phase?: PrivateLivePhase | null;
  interactive?: boolean;
  /** Solo para accesibilidad; no se muestra en pantalla. */
  label?: string;
  /** Pulso breve al completar requisitos (collecting → countdown). */
  pulse?: boolean;
  onClick?: () => void;
};

/**
 * Candado icon-only (debajo/al lado de Deseos).
 * Abierto en público; cerrado con ✗ en LIVE privado.
 */
export function LivePrivacyLockButton({
  privateActive,
  phase = null,
  interactive = false,
  label,
  pulse = false,
  onClick,
}: Props) {
  const appearance = privacyLockAppearance(phase, privateActive);
  const open = appearance !== 'sealed';
  const aria =
    label ||
    (appearance === 'sealed'
        ? 'LIVE privado'
        : 'LIVE público');
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onClick}
      className={`lb-live-privacy-lock is-${appearance}${open ? ' is-open' : ' is-closed'}${
        interactive ? ' is-interactive' : ''
      }${pulse ? ' is-pulse' : ''}`}
      aria-label={aria}
      title={aria}
    >
      <PrivacyLockArt open={open} />
    </button>
  );
}
