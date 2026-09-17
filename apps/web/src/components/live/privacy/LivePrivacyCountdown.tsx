import { Lock, Unlock } from 'lucide-react';
import {
  formatCountdown,
  type PrivateGiftRequirementProgress,
  type PrivateLivePhase,
} from '../../../lib/livePrivateAccessFirestore';
import { findLiveGift } from '../../../lib/liveboomGifts';
import { GiftIcon } from '../FloatingGift';

type Props = {
  phase: PrivateLivePhase | null;
  privateStartsAtMs: number | null;
  nowMs: number;
  requirements?: PrivateGiftRequirementProgress[] | null;
  isHost?: boolean;
};

/** Estado de recolección / countdown (timer solo tras 100% global). */
export function LivePrivacyCountdown({
  phase,
  privateStartsAtMs,
  nowMs,
  requirements = null,
}: Props) {
  if (phase === 'collecting') {
    const incomplete = (requirements || []).filter(
      (row) => row.receivedQuantity < row.requiredQuantity,
    );
    return (
      <div className="lb-live-privacy-countdown is-collecting" role="status">
        <p className="lb-live-privacy-countdown__title">
          <Unlock size={12} aria-hidden />
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
          <Lock size={12} aria-hidden />
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
