import { BadgeCheck, Mic, MicOff, PhoneOff, SwitchCamera, Video, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import { UserAvatar } from '../profile/UserAvatar';
import { CallWinBar } from './FloatingCallFrame';

type Person = {
  name: string;
  handle: string;
  avatar: string | null;
  uid?: string | null;
};

async function applyRingSpeaker(on: boolean) {
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

function VideoCallWave() {
  return (
    <div className="lb-video-ring-wave" aria-hidden>
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function VideoCallRingAvatar({ person }: { person: Person }) {
  return (
    <div className="lb-video-ring-avatar">
      <span className="lb-video-ring-avatar__halo" aria-hidden />
      <UserAvatar
        src={person.avatar}
        uid={person.uid}
        username={person.handle}
        displayName={person.name}
        size={128}
        ringClassName="ring-0"
      />
      <span className="lb-video-ring-avatar__badge" aria-hidden>
        <Video size={14} />
      </span>
    </div>
  );
}

function VideoCallRingIdentity({
  person,
  status,
}: {
  person: Person;
  status: string;
}) {
  const handle = person.handle.replace(/^@/, '');
  return (
    <>
      <VideoCallRingAvatar person={person} />
      <p className="lb-video-ring-screen__name">
        <span>{person.name || (handle ? `@${handle}` : 'LiveBoom')}</span>
        <BadgeCheck size={16} className="lb-video-ring-screen__badge" aria-hidden />
      </p>
      {handle ? <p className="lb-video-ring-screen__handle">@{handle}</p> : null}
      <p className="lb-video-ring-screen__type">
        <Video size={15} aria-hidden />
        Videollamada
      </p>
      <p className="lb-video-ring-screen__status" aria-live="polite">
        {status}
      </p>
      {status === 'Videollamando...' ? (
        <p className="lb-video-ring-screen__substatus">Conectando...</p>
      ) : null}
      <VideoCallWave />
      <p className="lb-video-ring-screen__quote">Las mejores conexiones se viven en video 💜</p>
    </>
  );
}

export function OutgoingVideoCallCard({
  person,
  connecting,
  micOn = true,
  onToggleMic,
  onFlipCamera,
  onCancel,
  onMinimize,
  onMaximize,
  onClose,
  maximized,
}: {
  person: Person;
  connecting?: boolean;
  micOn?: boolean;
  onToggleMic?: () => void;
  onFlipCamera?: () => void;
  onCancel: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  maximized?: boolean;
}) {
  const [speakerOn, setSpeakerOn] = useState(true);
  const status = connecting ? 'Conectando...' : 'Videollamando...';

  return (
    <article className="lb-video-ring-screen is-out" data-call-kind="video" data-call-drag>
      <CallWinBar
        showLogo={false}
        onMinimize={onMinimize}
        onMaximize={onMaximize}
        onClose={onClose}
        maximized={maximized}
      />
      <div className="lb-video-ring-screen__body">
        <VideoCallRingIdentity person={person} status={status} />
      </div>
      <div className="lb-video-ring-screen__actions is-out">
        <div className="lb-video-ring-screen__action is-mic">
          <button
            type="button"
            className={`lb-video-ring-speaker${micOn ? '' : ' is-off'}`}
            data-no-drag
            onClick={() => onToggleMic?.()}
            disabled={!onToggleMic}
            aria-label={micOn ? 'Silenciar' : 'Activar micrófono'}
          >
            {micOn ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          <span>Silenciar</span>
        </div>
        <div className="lb-video-ring-screen__action is-speaker">
          <button
            type="button"
            className={`lb-video-ring-speaker${speakerOn ? '' : ' is-off'}`}
            data-no-drag
            onClick={() => {
              const next = !speakerOn;
              setSpeakerOn(next);
              void applyRingSpeaker(next);
            }}
            aria-label="Cambiar altavoz"
          >
            {speakerOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <span>Altavoz</span>
        </div>
        <div className="lb-video-ring-screen__action is-flip">
          <button
            type="button"
            className="lb-video-ring-speaker"
            data-no-drag
            onClick={() => onFlipCamera?.()}
            disabled={!onFlipCamera}
            aria-label="Invertir cámara"
          >
            <SwitchCamera size={18} />
          </button>
          <span>Invertir cámara</span>
        </div>
        <div className="lb-video-ring-screen__action is-end">
          <button type="button" className="lb-video-ring-end" data-no-drag onClick={onCancel} aria-label="Cancelar">
            <PhoneOff size={22} />
          </button>
          <span>Cancelar</span>
        </div>
      </div>
    </article>
  );
}

export function IncomingVideoCallCard({
  person,
  accepting,
  connecting,
  error,
  paidLabel,
  onAccept,
  onDecline,
  onMinimize,
  onMaximize,
  onClose,
  maximized,
}: {
  person: Person;
  accepting?: boolean;
  connecting?: boolean;
  error?: string | null;
  paidLabel?: string | null;
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
    <article className="lb-video-ring-screen is-in" data-call-kind="video" data-call-drag>
      <CallWinBar
        showLogo={false}
        onMinimize={onMinimize}
        onMaximize={onMaximize}
        onClose={onClose}
        maximized={maximized}
      />
      <div className="lb-video-ring-screen__body">
        <VideoCallRingIdentity person={person} status={status} />
        {paidLabel && !pending ? <p className="lb-video-ring-screen__paid">{paidLabel}</p> : null}
        {error ? <p className="lb-voice-card__error">{error}</p> : null}
      </div>
      <div className="lb-video-ring-screen__actions is-in">
        <div className="lb-video-ring-screen__action">
          <button
            type="button"
            className="lb-video-ring-decline"
            data-no-drag
            onClick={onDecline}
            disabled={pending}
            aria-label="Rechazar"
          >
            <PhoneOff size={22} />
          </button>
          <span>Rechazar</span>
        </div>
        <div className="lb-video-ring-screen__action">
          <button
            type="button"
            className="lb-video-ring-accept"
            data-no-drag
            onClick={onAccept}
            disabled={pending}
            aria-label="Aceptar"
          >
            <Video size={22} />
          </button>
          <span>Aceptar</span>
        </div>
      </div>
    </article>
  );
}
