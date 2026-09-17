import { Lock } from 'lucide-react';
import { formatCountdown } from '../../../lib/livePrivateAccessFirestore';

type Props = {
  privateStartsAtMs: number | null;
  nowMs: number;
};

/** Aviso de cuenta regresiva (hora absoluta → remaining). */
export function LivePrivacyCountdown({ privateStartsAtMs, nowMs }: Props) {
  if (!privateStartsAtMs || privateStartsAtMs <= nowMs) return null;
  const remaining = privateStartsAtMs - nowMs;
  return (
    <p className="lb-live-privacy-countdown" role="status">
      <Lock size={12} aria-hidden />
      Este LIVE será privado en {formatCountdown(remaining)}
    </p>
  );
}
