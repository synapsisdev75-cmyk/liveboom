import { Phone, PhoneOff, Video } from 'lucide-react';
import { UserAvatar } from '../profile/UserAvatar';

type Props = {
  name: string;
  handle: string;
  avatar: string | null;
  uid?: string | null;
  video: boolean;
  incoming: boolean;
  accepting?: boolean;
  statusLabel: string;
  onAccept: () => void;
  onReject: () => void;
  onRestore: () => void;
};

export function CallHeaderDock({
  name,
  handle,
  avatar,
  uid,
  video,
  incoming,
  accepting,
  statusLabel,
  onAccept,
  onReject,
  onRestore,
}: Props) {
  const title = name || (handle ? `@${handle}` : 'LiveBoom');
  const acceptLabel = incoming ? 'Aceptar' : 'Retomar';

  return (
    <div className="lb-call-header-dock" role="status">
      <button type="button" className="lb-call-header-dock__main" onClick={onRestore}>
        <UserAvatar
          src={avatar}
          uid={uid}
          username={handle}
          displayName={name}
          size={32}
          ringClassName="ring-0"
        />
        <span className="lb-call-header-dock__copy">
          <strong>{title}</strong>
          <em>{statusLabel}</em>
        </span>
      </button>
      <div className="lb-call-header-dock__actions">
        <button
          type="button"
          className="lb-call-header-dock__btn is-accept"
          onClick={incoming ? onAccept : onRestore}
          disabled={accepting}
          aria-label={acceptLabel}
        >
          {video && incoming ? <Video size={14} /> : <Phone size={14} />}
          {acceptLabel}
        </button>
        <button
          type="button"
          className="lb-call-header-dock__btn is-end"
          onClick={onReject}
          disabled={accepting}
          aria-label={incoming ? 'Rechazar' : 'Colgar'}
        >
          <PhoneOff size={14} />
          {incoming ? 'Rechazar' : 'Colgar'}
        </button>
      </div>
    </div>
  );
}
