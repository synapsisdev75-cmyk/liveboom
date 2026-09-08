import { PhoneOff, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import { VoiceCallFrame, VoiceCallIdentity, type RingPerson } from './VoiceCallRingParts';

async function applyOutgoingSpeaker(on: boolean) {
  if (!on) return;
  if (typeof HTMLMediaElement === 'undefined' || !('setSinkId' in HTMLMediaElement.prototype)) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((item) => item.kind === 'audiooutput');
    const preferred =
      outputs.find((item) => /speaker|altavoz|loudspeaker/i.test(item.label)) ||
      outputs.find((item) => item.deviceId === 'default');
    if (!preferred?.deviceId) return;
    await Promise.all(
      Array.from(document.querySelectorAll('audio')).map((node) => {
        const el = node as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
        return el.setSinkId?.(preferred.deviceId) ?? Promise.resolve();
      }),
    );
  } catch {
    /* Sin salida seleccionable en este navegador. */
  }
}

export function OutgoingVoiceCallScreen({
  person,
  reconnecting,
  onCancel,
  onMinimize,
  onMaximize,
  onClose,
  maximized,
}: {
  person: RingPerson;
  reconnecting?: boolean;
  onCancel: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  maximized?: boolean;
}) {
  const [speakerOn, setSpeakerOn] = useState(true);
  const status = reconnecting ? 'Reconectando...' : 'Llamando...';

  return (
    <VoiceCallFrame
      variant="out"
      onMinimize={onMinimize}
      onMaximize={onMaximize}
      onClose={onClose}
      maximized={maximized}
      actions={
        <div className="lb-video-ring-screen__actions is-out">
          <div className="lb-video-ring-screen__action is-end">
            <button type="button" className="lb-video-ring-end" data-no-drag onClick={onCancel} aria-label="Cancelar">
              <PhoneOff size={22} />
            </button>
            <span>Cancelar</span>
          </div>
          <div className="lb-video-ring-screen__action is-speaker">
            <button
              type="button"
              className={`lb-video-ring-speaker${speakerOn ? '' : ' is-off'}`}
              data-no-drag
              onClick={() => {
                const next = !speakerOn;
                setSpeakerOn(next);
                void applyOutgoingSpeaker(next);
              }}
              aria-label="Cambiar altavoz"
            >
              {speakerOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <span>Cambiar altavoz</span>
          </div>
        </div>
      }
    >
      <VoiceCallIdentity person={person} status={status} />
    </VoiceCallFrame>
  );
}

export { OutgoingVoiceCallScreen as OutgoingVoiceCallCard };
