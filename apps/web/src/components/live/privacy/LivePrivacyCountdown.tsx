import {
  formatCountdown,
  type PrivateGiftRequirementProgress,
  type PrivateLivePhase,
} from '../../../lib/livePrivateAccessFirestore';
import { findLiveGift } from '../../../lib/liveboomGifts';
import { GiftIcon } from '../FloatingGift';
import { PrivacyLockArt } from './PrivacyLockArt';

type Props = {
  phase: PrivateLivePhase | null;
  privateStartsAtMs: number | null;
  nowMs: number;
  requirements?: PrivateGiftRequirementProgress[] | null;
  isHost?: boolean;
  interactive?: boolean;
  pulse?: boolean;
  onLockClick?: () => void;
};

function CountdownLock({
  open,
  interactive,
  pulse,
  label,
  onLockClick,
}: {
  open: boolean;
  interactive?: boolean;
  pulse?: boolean;
  label: string;
  onLockClick?: () => void;
}) {
  const art = <PrivacyLockArt open={open} className="lb-live-privacy-countdown__art" />;
  if (!interactive) return art;
  return (
    <button
      type="button"
      className={`lb-live-privacy-countdown__lock${pulse ? ' is-pulse' : ''}`}
      onClick={onLockClick}
      aria-label={label}
      title={label}
    >
      {art}
    </button>
  );
}

/** Estado de recolección / countdown (timer solo tras 100% global). */
export function LivePrivacyCountdown({
  phase,
  privateStartsAtMs,
  nowMs,
  requirements = null,
  interactive = false,
  pulse = false,
  onLockClick,
}: Props) {
  if (phase === 'collecting') {
    const incomplete = (requirements || []).filter(
      (row) => row.receivedQuantity < row.requiredQuantity,
    );
    return (
      <div className="lb-live-privacy-countdown is-collecting" role="status">
        <p className="lb-live-privacy-countdown__title">
          <CountdownLock
            open
            interactive={interactive}
            pulse={pulse}
            label="Candado abierto: reuniendo regalos para el privado"
            onLockClick={onLockClick}
          />
          Candado abierto · reuniendo regalos
        </p>
        {incomplete.length > 0 ? (
          <ul className="lb-live-privacy-countdown__reqs">
            {incomplete.map((row) => {
              const gift = findLiveGift(row.giftId);
              return (
                <li key={row.giftId}>
                  <GiftIcon giftId={row.giftId} size={14} />
                  <span>
                    {gift?.name || row.giftId} {row.receivedQuantity}/{row.requiredQuantity}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="lb-live-privacy-countdown__hint">Esperando completar requisitos</p>
        )}
      </div>
    );
  }

  if (phase === 'countdown' && privateStartsAtMs && privateStartsAtMs > nowMs) {
    const remaining = privateStartsAtMs - nowMs;
    return (
      <div className="lb-live-privacy-countdown is-countdown" role="status">
        <p className="lb-live-privacy-countdown__title">
          <CountdownLock
            open={false}
            interactive={interactive}
            pulse={pulse}
            label="Candado cerrado: el LIVE pasará a privado"
            onLockClick={onLockClick}
          />
          Candado cerrado · yendo a privado
        </p>
        <p className="lb-live-privacy-countdown__timer">
          El LIVE será privado en {formatCountdown(remaining)}
        </p>
      </div>
    );
  }

  return null;
}
