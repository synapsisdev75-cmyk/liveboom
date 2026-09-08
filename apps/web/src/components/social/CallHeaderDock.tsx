import { Maximize2, Phone, PhoneOff, Video } from 'lucide-react';
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
  clock?: string;
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
  clock,
  onAccept,
  onReject,
  onRestore,
}: Props) {
  const title = name || (handle ? `@${handle}` : 'LiveBoom');
  const acceptLabel = incoming ? 'Aceptar' : 'Retomar';

  if (!incoming) {
    return (
      <div className="lb-call-header-dock is-compact" role="status">
        <button type="button" className="lb-call-header-dock__chip" onClick={onRestore}>
          {video ? <Video size={14} /> : <Phone size={14} />}
          <span>
            Llamada activa
            {clock ? ` · ${clock}` : ''}
          </span>
        </button>
        <button
          type="button"
          className="lb-call-header-dock__max"
          onClick={onRestore}
          aria-label="Maximizar"
        >
          <Maximize2 size={14} />
        </button>
        <button
          type="button"
          className="lb-call-header-dock__end"
          onClick={onReject}
          aria-label="Colgar"
        >
          <PhoneOff size={14} />
        </button>
      </div>
    );
  }

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
          onClick={onAccept}
          disabled={accepting}
          aria-label={acceptLabel}
        >
          {video ? <Video size={14} /> : <Phone size={14} />}
          {acceptLabel}
        </button>
        <button
          type="button"
          className="lb-call-header-dock__btn is-end"
          onClick={onReject}
          disabled={accepting}
          aria-label="Rechazar"
        >
          <PhoneOff size={14} />
          Rechazar
        </button>
      </div>
    </div>
  );
}
