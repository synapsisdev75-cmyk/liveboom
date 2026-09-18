import { Check, ChevronDown, X } from 'lucide-react';
import { UserAvatar } from '../../profile/UserAvatar';
import type { PrivateAccessRequest } from '../../../lib/livePrivateAccessFirestore';
import { findLiveGift } from '../../../lib/liveboomGifts';

type Props = {
  open: boolean;
  requests: PrivateAccessRequest[];
  busyUid?: string | null;
  onClose: () => void;
  onAccept: (uid: string) => void;
  onReject: (uid: string) => void;
  onAcceptAll?: () => void;
  focusUid?: string | null;
};

function relativeTime(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora';
  if (min === 1) return 'hace 1 min';
  return `hace ${min} min`;
}

export function LivePrivacyRequestsSheet({
  open,
  requests,
  busyUid,
  onClose,
  onAccept,
  onReject,
  onAcceptAll,
  focusUid,
}: Props) {
  if (!open || requests.length === 0) return null;
  const busyAll = busyUid === '*';
  const rowBusy = (uid: string) => busyAll || busyUid === uid;
  const ordered = focusUid
    ? [
        ...requests.filter((r) => r.uid === focusUid),
        ...requests.filter((r) => r.uid !== focusUid),
      ]
    : requests;

  return (
    <div className="lb-live-privacy-sheet" role="dialog" aria-modal="true">
      <div className="lb-live-privacy-sheet__backdrop" onClick={onClose} aria-hidden />
      <div className="lb-live-privacy-sheet__panel">
        <div className="lb-live-privacy-sheet__head">
          <p className="lb-live-privacy-sheet__title">
            Solicitudes de acceso ({requests.length})
          </p>
          <button type="button" onClick={onClose} className="lb-live-privacy-sheet__collapse" aria-label="Cerrar">
            <ChevronDown size={18} />
          </button>
        </div>
        <div className="lb-live-privacy-sheet__list">
          {ordered.map((row) => (
            <div key={row.uid} className="lb-live-privacy-sheet__row">
              <UserAvatar
                uid={row.uid}
                src={row.avatarUrl}
                username={row.username}
                displayName={row.displayName}
                size={40}
              />
              <div className="lb-live-privacy-sheet__meta">
                <p className="lb-live-privacy-sheet__name">{row.displayName}</p>
                <p className="lb-live-privacy-sheet__sub">
                  Envió {row.giftId ? findLiveGift(row.giftId)?.name || row.giftId : 'el regalo'} para entrar
                </p>
              </div>
              <span className="lb-live-privacy-sheet__time">{relativeTime(row.createdAtMs)}</span>
              <div className="lb-live-privacy-sheet__actions">
                <button
                  type="button"
                  disabled={rowBusy(row.uid)}
                  className="lb-live-privacy-sheet__reject"
                  onClick={() => onReject(row.uid)}
                  aria-label="Rechazar"
                >
                  <X size={16} />
                </button>
                <button
                  type="button"
                  disabled={rowBusy(row.uid)}
                  className="lb-live-privacy-sheet__accept"
                  onClick={() => onAccept(row.uid)}
                  aria-label="Aceptar"
                >
                  <Check size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {onAcceptAll ? (
          <button
            type="button"
            className="lb-live-privacy-sheet__accept-all"
            disabled={Boolean(busyUid)}
            onClick={onAcceptAll}
          >
            {busyAll ? 'Aceptando…' : 'Aceptar a todos'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
