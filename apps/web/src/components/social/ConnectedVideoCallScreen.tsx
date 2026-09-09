import { BadgeCheck, Gift, Mic, MicOff, PhoneOff, SwitchCamera, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { useMaybeRoomContext } from '@livekit/components-react';
import { UserAvatar } from '../profile/UserAvatar';
import { CallWinBar } from './FloatingCallFrame';

export type ConnectedVideoPerson = {
  name: string;
  handle: string;
  avatar: string | null;
  uid?: string | null;
};

async function trySpeakerSink(room: NonNullable<ReturnType<typeof useMaybeRoomContext>>) {
  try {
    const switchDevice = (room as { switchActiveDevice?: (kind: MediaDeviceKind, id: string) => Promise<unknown> })
      .switchActiveDevice;
    if (typeof switchDevice !== 'function') return;
    if (typeof HTMLMediaElement === 'undefined' || !('setSinkId' in HTMLMediaElement.prototype)) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((item) => item.kind === 'audiooutput');
    const preferred =
      outputs.find((item) => /speaker|altavoz|loudspeaker/i.test(item.label)) ||
      outputs.find((item) => item.deviceId === 'default');
    if (preferred?.deviceId) await switchDevice('audiooutput', preferred.deviceId);
  } catch {
    /* Sin salida seleccionable en este navegador. */
  }
}

function applySpeakerOutput(room: NonNullable<ReturnType<typeof useMaybeRoomContext>>, speakerOn: boolean) {
  const volume = speakerOn ? 1 : 0;
  try {
    for (const participant of room.remoteParticipants?.values() ?? []) {
      for (const pub of participant.audioTrackPublications.values()) {
        const track = pub.audioTrack;
        if (track && 'setVolume' in track && typeof track.setVolume === 'function') {
          track.setVolume(volume);
        }
      }
    }
  } catch {
    /* Sala aún sin participantes. */
  }
  const root = document.querySelector('.lb-call-room');
  const nodes = [
    ...(root?.querySelectorAll<HTMLAudioElement>('audio') ?? []),
    ...document.querySelectorAll<HTMLAudioElement>('.lb-call-remote-audio audio'),
  ];
  nodes.forEach((audio) => {
    audio.muted = !speakerOn;
    audio.volume = volume;
  });
}

export function ConnectedVideoCallHeader({
  person,
  elapsedLabel,
  statusLabel,
  onMinimize,
  onMaximize,
  onClose: _onClose,
  maximized,
  onFlipCamera,
  flipCameraLabel,
  flipPickerOpen,
}: {
  person: ConnectedVideoPerson;
  elapsedLabel: string;
  statusLabel?: string;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  maximized?: boolean;
  onFlipCamera?: () => void;
  flipCameraLabel?: string;
  flipPickerOpen?: boolean;
}) {
  const handle = person.handle.replace(/^@/, '');
  return (
    <header className="lb-video-connected-head" data-call-drag>
      <div className="lb-video-connected-peer">
        <div className="lb-video-connected-peer__avatar">
          <UserAvatar
            src={person.avatar}
            uid={person.uid}
            username={person.handle}
            displayName={person.name}
            size={48}
            ringClassName="ring-0"
          />
        </div>
        <div className="lb-video-connected-peer__meta">
          <p className="lb-video-connected-peer__name">
            <span>{person.name || (handle ? `@${handle}` : 'LiveBoom')}</span>
            <BadgeCheck size={14} className="lb-video-connected-peer__badge" aria-hidden />
          </p>
          {handle ? <p className="lb-video-connected-peer__handle">@{handle}</p> : null}
          <p className="lb-video-connected-peer__status">
            <span className="lb-video-connected-peer__dot" aria-hidden />
            {statusLabel || 'En videollamada'}
          </p>
          <p className="lb-video-connected-peer__clock">{elapsedLabel}</p>
        </div>
      </div>
      <CallWinBar
        showLogo={false}
        onMinimize={onMinimize}
        onMaximize={onMaximize}
        maximized={maximized}
        extraEnd={
          onFlipCamera ? (
            <button
              type="button"
              className="lb-call-winbtn"
              data-no-drag
              onClick={onFlipCamera}
              aria-label={flipCameraLabel || 'Voltear cámara'}
              aria-expanded={flipPickerOpen}
              aria-haspopup={flipPickerOpen === undefined ? undefined : 'listbox'}
            >
              <SwitchCamera size={14} />
            </button>
          ) : null
        }
      />
    </header>
  );
}

/** Contenedor visual maestro de videollamada. Solo layout; los handlers los pasa el padre. */
export function VideoCallShell({
  person,
  elapsedLabel,
  statusLabel,
  onMinimize,
  onMaximize,
  onClose,
  maximized,
  onFlipCamera,
  flipCameraLabel,
  flipPickerOpen,
  stageRef,
  stage,
  footer,
  className,
}: {
  person: ConnectedVideoPerson;
  elapsedLabel: string;
  statusLabel?: string;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  maximized?: boolean;
  onFlipCamera?: () => void;
  flipCameraLabel?: string;
  flipPickerOpen?: boolean;
  stageRef?: Ref<HTMLDivElement | null>;
  stage: ReactNode;
  footer: ReactNode;
  className?: string;
}) {
  return (
    <article className={['lb-video-connected-screen', className].filter(Boolean).join(' ')}>
      <ConnectedVideoCallHeader
        person={person}
        elapsedLabel={elapsedLabel}
        statusLabel={statusLabel}
        onMinimize={onMinimize}
        onMaximize={onMaximize}
        onClose={onClose}
        maximized={maximized}
        onFlipCamera={onFlipCamera}
        flipCameraLabel={flipCameraLabel}
        flipPickerOpen={flipPickerOpen}
      />
      <div className="lb-call-video-stage" data-call-drag ref={stageRef}>
        {stage}
      </div>
      {footer}
    </article>
  );
}

export function ConnectedVideoCallBar({
  camOn,
  onToggleCam,
  onHangup,
}: {
  camOn: boolean;
  onToggleCam: () => void;
  onHangup: () => void;
}) {
  const room = useMaybeRoomContext();
  const [micOn, setMicOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const micHoldRef = useRef(0);

  useEffect(() => {
    if (!room) return;
    applySpeakerOutput(room, speakerOn);
  }, [room, speakerOn]);

  useEffect(() => {
    return () => window.clearTimeout(micHoldRef.current);
  }, []);

  async function toggleMic() {
    const next = !micOn;
    try {
      const local = room?.localParticipant;
      if (!local) return;
      await local.setMicrophoneEnabled(next);
      setMicOn(next);
      setMicError(null);
    } catch {
      setMicError(next ? 'No se pudo activar el micrófono' : 'No se pudo silenciar el micrófono');
    }
  }

  return (
    <div className="lb-video-connected-actions" data-no-drag>
      <div className="lb-video-connected-action">
        <button
          type="button"
          className={`lb-video-connected-btn${micOn ? '' : ' is-off'}`}
          onClick={() => void toggleMic()}
          aria-label={micOn ? 'Silenciar micrófono' : 'Activar micrófono'}
          aria-pressed={!micOn}
        >
          {micOn ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        <span>Micrófono</span>
      </div>
      <div className="lb-video-connected-action">
        <button
          type="button"
          className={`lb-video-connected-btn${camOn ? '' : ' is-off'}`}
          onClick={onToggleCam}
          aria-label={camOn ? 'Apagar cámara' : 'Encender cámara'}
          aria-pressed={!camOn}
        >
          {camOn ? <Video size={18} /> : <VideoOff size={18} />}
        </button>
        <span>{camOn ? 'Cámara' : 'Cámara OFF'}</span>
      </div>
      <div className="lb-video-connected-action">
        <button
          type="button"
          className={`lb-video-connected-btn${speakerOn ? '' : ' is-off'}`}
          onClick={() => {
            const next = !speakerOn;
            setSpeakerOn(next);
            if (next && room) void trySpeakerSink(room);
          }}
          aria-label="Cambiar altavoz"
          aria-pressed={speakerOn}
        >
          {speakerOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <span>Altavoz</span>
      </div>
      <div className="lb-video-connected-action is-gift">
        <button
          type="button"
          className="lb-video-connected-btn is-gift"
          onClick={() => window.dispatchEvent(new CustomEvent('liveboom:open-chat-gifts'))}
          aria-label="Regalos"
        >
          <Gift size={18} />
        </button>
        <span>Regalos</span>
      </div>
      <div className="lb-video-connected-action is-end">
        <button type="button" className="lb-video-connected-end" onClick={onHangup} aria-label="Finalizar">
          <PhoneOff size={22} />
        </button>
        <span>Finalizar</span>
      </div>
      {micError ? <p className="lb-video-connected-error">{micError}</p> : null}
    </div>
  );
}
