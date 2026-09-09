import { Phone, PhoneOff } from 'lucide-react';
import { VoiceCallFrame, VoiceCallIdentity, type RingPerson } from './VoiceCallRingParts';

export function IncomingVoiceCallScreen({
  person,
  accepting,
  connecting,
  error,
  onAccept,
  onDecline,
  onMinimize,
  onMaximize,
  onClose,
  maximized,
}: {
  person: RingPerson;
  accepting?: boolean;
  connecting?: boolean;
  error?: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  maximized?: boolean;
}) {
  const pending = Boolean(connecting || accepting);
  const status = pending ? 'Conectando...' : 'Te está llamando...';

  return (
    <VoiceCallFrame
      variant="in"
      onMinimize={onMinimize}
      onMaximize={onMaximize}
      onClose={onClose}
      maximized={maximized}
      actions={
        <div className="lb-voice-in-screen__actions">
          <div className="lb-voice-in-screen__action">
            <button
              type="button"
              className="lb-voice-in-decline"
              data-no-drag
              onClick={onDecline}
              disabled={pending}
              aria-label="Rechazar"
            >
              <PhoneOff size={22} />
            </button>
            <span>Rechazar</span>
          </div>
          <div className="lb-voice-in-screen__action">
            <button
              type="button"
              className="lb-voice-in-accept"
              data-no-drag
              onClick={onAccept}
              disabled={pending}
              aria-label="Aceptar"
            >
              <Phone size={22} />
            </button>
            <span>Aceptar</span>
          </div>
        </div>
      }
    >
      <VoiceCallIdentity person={person} status={status} />
      {error ? <p className="lb-voice-card__error">{error}</p> : null}
    </VoiceCallFrame>
  );
}

export { IncomingVoiceCallScreen as IncomingVoiceCallCard };
