import { BadgeCheck, Gift, Grid3x3, MessageCircle, Mic, MicOff, MoreHorizontal, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { UserAvatar } from '../profile/UserAvatar';
import { CallWinBar } from './FloatingCallFrame';
import { VoiceCallWave } from './VoiceCallRingParts';

export type ConnectedVoicePerson = {
  name: string;
  handle: string;
  avatar: string | null;
  uid?: string | null;
};

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'] as const;

async function trySpeakerSink(room: ReturnType<typeof useRoomContext>) {
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

function applySpeakerOutput(room: ReturnType<typeof useRoomContext>, speakerOn: boolean) {
  const volume = speakerOn ? 1 : 0;
  for (const participant of room.remoteParticipants.values()) {
    for (const pub of participant.audioTrackPublications.values()) {
      const track = pub.audioTrack;
      if (track && 'setVolume' in track && typeof track.setVolume === 'function') {
        track.setVolume(volume);
      }
    }
  }
  const root =
    document.querySelector('.lb-voice-call-session') ||
    document.querySelector('.lb-call-room--voice') ||
    document.querySelector('.lb-call-room');
  const nodes = root?.querySelectorAll<HTMLAudioElement>('audio') ?? [];
  nodes.forEach((audio) => {
    audio.muted = !speakerOn;
    audio.volume = volume;
  });
}

function sendDtmf(room: ReturnType<typeof useRoomContext>, digit: string) {
  const publish = (
    room.localParticipant as { publishDtmf?: (code: number, identity: string) => Promise<unknown> }
  ).publishDtmf;
  if (typeof publish !== 'function') return;
  const code = digit === '*' ? 10 : digit === '#' ? 11 : Number(digit);
  if (!Number.isFinite(code)) return;
  void publish(code, digit).catch(() => undefined);
}

function ConnectedVoiceWave() {
  const room = useRoomContext();
  const [level, setLevel] = useState(0.35);

  useEffect(() => {
    const timer = window.setInterval(() => {
      let peak = 0;
      room.remoteParticipants.forEach((participant) => {
        peak = Math.max(peak, participant.audioLevel || 0);
      });
      setLevel(peak > 0.02 ? Math.min(1, peak) : 0.28);
    }, 90);
    return () => window.clearInterval(timer);
  }, [room]);

  return (
    <div className="lb-voice-connected-wave" style={{ ['--lb-voice-level' as string]: String(0.72 + level * 0.38) }}>
      <VoiceCallWave />
    </div>
  );
}

export function ConnectedVoiceCallScreen({
  person,
  elapsedLabel,
  statusLabel,
  onHangup,
  onFollowChat,
  onMinimize,
  onMaximize,
  onClose,
  maximized,
}: {
  person: ConnectedVoicePerson;
  elapsedLabel: string;
  statusLabel?: string;
  onHangup: () => void;
  onFollowChat: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  maximized?: boolean;
}) {
  const room = useRoomContext();
  const handle = person.handle.replace(/^@/, '');
  const [micOn, setMicOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | 'keypad' | 'more'>(null);

  useEffect(() => {
    applySpeakerOutput(room, speakerOn);
  }, [room, speakerOn]);

  async function toggleMic() {
    const next = !micOn;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicOn(next);
      setMicError(null);
    } catch {
      setMicError(next ? 'No se pudo activar el micrófono' : 'No se pudo silenciar el micrófono');
    }
  }

  return (
    <article className="lb-voice-connected-screen" data-call-drag>
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
              {statusLabel || 'En llamada de voz'}
            </p>
            <p className="lb-video-connected-peer__clock">{elapsedLabel}</p>
          </div>
        </div>
        <CallWinBar
          showLogo={false}
          onMinimize={onMinimize}
          onMaximize={onMaximize}
          onClose={onClose}
          maximized={maximized}
        />
      </header>

      <div className="lb-voice-connected-body">
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
        </div>
        <ConnectedVoiceWave />
        <p className="lb-voice-connected-quote">Las mejores conexiones se viven en voz 💜</p>
      </div>

      {panel === 'keypad' ? (
        <div className="lb-voice-keypad" data-no-drag>
          {KEYPAD_KEYS.map((key) => (
            <button key={key} type="button" onClick={() => sendDtmf(room, key)} aria-label={`Tecla ${key}`}>
              {key}
            </button>
          ))}
        </div>
      ) : null}

      {panel === 'more' ? (
        <div className="lb-voice-more-sheet" data-no-drag>
          <button
            type="button"
            onClick={() => {
              setPanel(null);
              onFollowChat();
            }}
          >
            <MessageCircle size={16} />
            Seguir en el chat
          </button>
          <button
            type="button"
            onClick={() => {
              setPanel(null);
              window.dispatchEvent(new CustomEvent('liveboom:open-chat-gifts'));
            }}
          >
            <Gift size={16} />
            Regalos
          </button>
        </div>
      ) : null}

      <div className="lb-voice-connected-actions" data-no-drag>
        <div className="lb-voice-connected-action">
          <button
            type="button"
            className={`lb-video-connected-btn${micOn ? '' : ' is-off'}`}
            onClick={() => void toggleMic()}
            aria-label={micOn ? 'Silenciar micrófono' : 'Activar micrófono'}
            aria-pressed={!micOn}
          >
            {micOn ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          <span>{micOn ? 'Silenciar micrófono' : 'Micrófono silenciado'}</span>
        </div>
        <div className="lb-voice-connected-action">
          <button
            type="button"
            className={`lb-video-connected-btn${panel === 'keypad' ? ' is-on' : ''}`}
            onClick={() => setPanel((current) => (current === 'keypad' ? null : 'keypad'))}
            aria-label="Teclado"
            aria-expanded={panel === 'keypad'}
          >
            <Grid3x3 size={18} />
          </button>
          <span>Teclado</span>
        </div>
        <div className="lb-voice-connected-action is-end">
          <button type="button" className="lb-video-connected-end" onClick={onHangup} aria-label="Finalizar">
            <PhoneOff size={22} />
          </button>
          <span>Finalizar</span>
        </div>
        <div className="lb-voice-connected-action">
          <button
            type="button"
            className={`lb-video-connected-btn${speakerOn ? '' : ' is-off'}`}
            onClick={() => {
              const next = !speakerOn;
              setSpeakerOn(next);
              if (next) void trySpeakerSink(room);
            }}
            aria-label="Altavoz"
            aria-pressed={speakerOn}
          >
            {speakerOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <span>Altavoz</span>
        </div>
        <div className="lb-voice-connected-action">
          <button
            type="button"
            className={`lb-video-connected-btn${panel === 'more' ? ' is-on' : ''}`}
            onClick={() => setPanel((current) => (current === 'more' ? null : 'more'))}
            aria-label="Más opciones"
            aria-expanded={panel === 'more'}
          >
            <MoreHorizontal size={18} />
          </button>
          <span>Más opciones</span>
        </div>
      </div>
      {micError ? <p className="lb-video-connected-error">{micError}</p> : null}
    </article>
  );
}
