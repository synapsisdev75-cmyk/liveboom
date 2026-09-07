import {
  BellOff,
  Gift,
  MessageCircle,
  Mic,
  MicOff,
  MoreVertical,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { BRAND_LOGO_SRC } from '../../lib/brand';
import { callMediaDeniedMessage, labelCallMicrophone, listCallMediaDevices } from '../../lib/callMedia';
import { UserAvatar } from '../profile/UserAvatar';
import type { ReactNode } from 'react';

export const VOICE_QUICK_REPLIES = [
  'No puedo hablar ahora.',
  'Te llamo luego.',
  'Estoy ocupado.',
  'Escríbeme por aquí.',
];

function canSelectAudioOutput() {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

async function trySpeakerSink(room: ReturnType<typeof useRoomContext>) {
  try {
    const switchDevice = (room as { switchActiveDevice?: (kind: MediaDeviceKind, id: string) => Promise<unknown> })
      .switchActiveDevice;
    if (typeof switchDevice !== 'function') return;
    if (!canSelectAudioOutput()) return;
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

type Person = {
  name: string;
  handle: string;
  avatar: string | null;
  uid?: string | null;
};

function BrandMark() {
  return <img src={BRAND_LOGO_SRC} alt="LiveBoom" className="lb-voice-card__logo" draggable={false} />;
}

function PersonBlock({ person, children }: { person: Person; children?: ReactNode }) {
  const handle = person.handle.replace(/^@/, '');
  return (
    <div className="lb-voice-card__person">
      {children}
      <p className="lb-voice-card__name">{person.name || (handle ? `@${handle}` : 'LiveBoom')}</p>
      {handle ? <p className="lb-voice-card__handle">@{handle}</p> : null}
    </div>
  );
}

function AvatarStage({
  person,
  mode,
  size = 108,
}: {
  person: Person;
  mode: 'out' | 'in' | 'on';
  size?: number;
}) {
  return (
    <div className={`lb-voice-avatar is-${mode}`}>
      {mode === 'out' ? (
        <span className="lb-voice-sidewaves" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      ) : null}
      <div className="lb-voice-avatar__core">
        {mode === 'in' ? (
          <>
            <span className="lb-voice-ripple" aria-hidden />
            <span className="lb-voice-ripple is-2" aria-hidden />
            <span className="lb-voice-ripple is-3" aria-hidden />
          </>
        ) : (
          <span className="lb-voice-halo" aria-hidden />
        )}
        <UserAvatar
          src={person.avatar}
          uid={person.uid}
          username={person.handle}
          displayName={person.name}
          size={size}
          ringClassName="ring-0"
        />
      </div>
      {mode === 'out' ? (
        <span className="lb-voice-sidewaves is-right" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      ) : null}
    </div>
  );
}

export function VoiceCallIncoming({
  person,
  accepting,
  error,
  ringMuted,
  repliesOpen,
  customReply,
  onCustomReplyChange,
  onAccept,
  onDecline,
  onMuteRing,
  onOpenReplies,
  onCloseReplies,
  onSendReply,
}: {
  person: Person;
  accepting?: boolean;
  error?: string | null;
  ringMuted: boolean;
  repliesOpen: boolean;
  customReply: string;
  onCustomReplyChange: (value: string) => void;
  onAccept: () => void;
  onDecline: () => void;
  onMuteRing: () => void;
  onOpenReplies: () => void;
  onCloseReplies: () => void;
  onSendReply: (text: string) => void;
}) {
  return (
    <article className="lb-voice-card is-in">
      <BrandMark />
      <PersonBlock person={person}>
        <AvatarStage person={person} mode="in" />
      </PersonBlock>
      <p className="lb-voice-card__status">Llamada entrante</p>
      <p className="lb-voice-card__sub">Quiere hablar contigo por voz</p>
      {error ? <p className="lb-voice-card__error">{error}</p> : null}
      {error ? (
        <div className="lb-voice-card__secondary">
          <button type="button" onClick={onAccept}>
            Reintentar
          </button>
          <button type="button" onClick={onDecline}>
            Cancelar
          </button>
        </div>
      ) : null}
      {accepting ? <p className="lb-voice-card__sub">Conectando llamada...</p> : null}

      {repliesOpen ? (
        <div className="lb-voice-replies">
          {VOICE_QUICK_REPLIES.map((line) => (
            <button key={line} type="button" className="lb-voice-reply" onClick={() => onSendReply(line)}>
              {line}
            </button>
          ))}
          <form
            className="lb-voice-reply-form"
            onSubmit={(event) => {
              event.preventDefault();
              const text = customReply.trim();
              if (text) onSendReply(text);
            }}
          >
            <input
              value={customReply}
              onChange={(event) => onCustomReplyChange(event.target.value)}
              placeholder="Escribe una respuesta..."
              maxLength={200}
            />
            <button type="submit" disabled={!customReply.trim()}>
              Enviar
            </button>
          </form>
          <button type="button" className="lb-voice-reply-cancel" onClick={onCloseReplies}>
            Volver
          </button>
        </div>
      ) : (
        <>
          <div className="lb-voice-card__main-actions">
            <button
              type="button"
              className="lb-voice-round is-decline"
              onClick={onDecline}
              disabled={accepting}
              aria-label="Rechazar"
            >
              <PhoneOff size={22} />
            </button>
            <button
              type="button"
              className="lb-voice-round is-accept"
              onClick={onAccept}
              disabled={accepting}
              aria-label="Aceptar"
            >
              <Phone size={22} />
            </button>
          </div>
          <div className="lb-voice-card__main-labels">
            <span>Rechazar</span>
            <span>Aceptar</span>
          </div>
          <div className="lb-voice-card__secondary">
            <button type="button" onClick={onOpenReplies}>
              <MessageCircle size={15} />
              Responder con mensaje
            </button>
            <button type="button" onClick={onMuteRing}>
              <BellOff size={15} />
              {ringMuted ? 'Timbre silenciado' : 'Silenciar llamada'}
            </button>
          </div>
        </>
      )}
    </article>
  );
}

function VoiceRoomControls({
  endLabel,
  onEnd,
  showSpeaker,
}: {
  endLabel: string;
  onEnd: () => void;
  showSpeaker: boolean;
}) {
  const room = useRoomContext();
  const [micOn, setMicOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
  const [micPicker, setMicPicker] = useState(false);
  const micHoldRef = useRef(0);
  const micHeldRef = useRef(false);

  useEffect(() => {
    if (!showSpeaker || !speakerOn) return;
    void trySpeakerSink(room);
  }, [room, showSpeaker, speakerOn]);

  useEffect(() => {
    let cancelled = false;
    void listCallMediaDevices().then((list) => {
      if (!cancelled) setAudioInputs(list.audio);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(micHoldRef.current);
    };
  }, []);

  useEffect(() => {
    if (!micPicker) return;
    const close = (event: PointerEvent) => {
      const node = event.target instanceof Element ? event.target : null;
      if (node?.closest('.lb-call-device-bar')) return;
      setMicPicker(false);
    };
    const timer = window.setTimeout(() => window.addEventListener('pointerdown', close), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', close);
    };
  }, [micPicker]);

  async function toggleMic() {
    const next = !micOn;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicOn(next);
      setMicError(null);
    } catch {
      setMicError('No pudimos conectar la llamada. Intenta nuevamente.');
    }
  }

  async function selectMicrophone(deviceId: string) {
    try {
      await room.switchActiveDevice('audioinput', deviceId);
      setActiveAudioId(deviceId);
      setMicPicker(false);
      setMicError(null);
    } catch (err) {
      setMicError(callMediaDeniedMessage(err, false));
    }
  }

  function openMicPicker() {
    if (audioInputs.length <= 1) return;
    setMicPicker((open) => !open);
  }

  return (
    <>
      {micPicker ? (
        <div className="lb-call-device-bar is-voice" role="listbox" aria-label="Micrófono" data-no-drag>
          <p className="lb-call-device-bar__title">Micrófono</p>
          {audioInputs.map((device, index) => (
            <button
              key={device.deviceId}
              type="button"
              role="option"
              aria-selected={device.deviceId === activeAudioId}
              className={`lb-call-device-item${device.deviceId === activeAudioId ? ' is-on' : ''}`}
              onClick={() => void selectMicrophone(device.deviceId)}
            >
              {labelCallMicrophone(device, index)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="lb-voice-card__controls">
        <button
          type="button"
          className={`lb-voice-round is-ghost${micOn ? '' : ' is-off'}`}
          data-no-drag
          onPointerDown={() => {
            micHeldRef.current = false;
            window.clearTimeout(micHoldRef.current);
            micHoldRef.current = window.setTimeout(() => {
              micHeldRef.current = true;
              openMicPicker();
            }, 480);
          }}
          onPointerUp={() => window.clearTimeout(micHoldRef.current)}
          onPointerCancel={() => window.clearTimeout(micHoldRef.current)}
          onClick={() => {
            if (micHeldRef.current) {
              micHeldRef.current = false;
              return;
            }
            void toggleMic();
          }}
          aria-label={micOn ? 'Silenciar micrófono' : 'Activar micrófono'}
        >
          {micOn ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        <button type="button" className="lb-voice-round is-end" data-no-drag onClick={onEnd} aria-label={endLabel}>
          <PhoneOff size={20} />
        </button>
        {showSpeaker ? (
          <button
            type="button"
            className={`lb-voice-round is-ghost${speakerOn ? '' : ' is-off'}`}
            data-no-drag
            onClick={() => {
              const next = !speakerOn;
              setSpeakerOn(next);
              if (next) void trySpeakerSink(room);
            }}
            aria-label={speakerOn ? 'Altavoz' : 'Auricular'}
          >
            {speakerOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        ) : (
          <span className="lb-voice-round is-ghost is-placeholder" aria-hidden />
        )}
      </div>
      <div className="lb-voice-card__ctrl-labels">
        <span>{micOn ? 'Silenciar micrófono' : 'Micrófono silenciado'}</span>
        <span>{endLabel}</span>
        {showSpeaker ? <span>Altavoz</span> : <span />}
      </div>
      {micError ? <p className="lb-voice-card__error">{micError}</p> : null}
    </>
  );
}

export function VoiceCallOutgoing({
  person,
  reconnecting,
  connecting,
  onCancel,
  onFollowChat,
}: {
  person: Person;
  reconnecting?: boolean;
  connecting?: boolean;
  onCancel: () => void;
  onFollowChat: () => void;
}) {
  return (
    <article className="lb-voice-card is-out is-float">
      <span className="lb-voice-card__grip" data-call-drag aria-hidden />
      <BrandMark />
      <PersonBlock person={person}>
        <AvatarStage person={person} mode="out" />
      </PersonBlock>
      <p className="lb-voice-card__status">
        {reconnecting ? 'Reconectando...' : connecting ? 'Conectando llamada...' : 'Llamando...'}
      </p>
      <VoiceRoomControls endLabel="Cancelar llamada" onEnd={onCancel} showSpeaker={canSelectAudioOutput()} />
      <button type="button" className="lb-voice-follow" data-no-drag onClick={onFollowChat}>
        <MessageCircle size={16} />
        <span>
          Seguir en el chat
          <em>La llamada continuará en segundo plano</em>
        </span>
      </button>
    </article>
  );
}

export function VoiceCallActive({
  person,
  elapsedLabel,
  reconnecting,
  lost,
  onHangup,
  onFollowChat,
}: {
  person: Person;
  elapsedLabel: string;
  reconnecting?: boolean;
  lost?: boolean;
  onHangup: () => void;
  onFollowChat: () => void;
}) {
  const state = reconnecting ? 'Reconectando...' : lost ? 'Conexión perdida' : 'En llamada';
  return (
    <article className="lb-voice-card is-on is-float">
      <span className="lb-voice-card__grip" data-call-drag aria-hidden />
      <BrandMark />
      <PersonBlock person={person}>
        <AvatarStage person={person} mode="on" />
      </PersonBlock>
      <p className="lb-voice-card__status">{state}</p>
      {!reconnecting && !lost ? <p className="lb-voice-card__clock">{elapsedLabel}</p> : null}
      <VoiceRoomControls endLabel="Finalizar" onEnd={onHangup} showSpeaker />
      <button type="button" className="lb-voice-follow" data-no-drag onClick={onFollowChat}>
        <MessageCircle size={16} />
        <span>
          Seguir en el chat
          <em>La llamada continuará en segundo plano</em>
        </span>
      </button>
    </article>
  );
}

export function VoiceCallMiniBar({
  person,
  label,
  onExpand,
  onHangup,
}: {
  person: Person;
  label: string;
  onExpand: () => void;
  onHangup: () => void;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="lb-voice-mini" data-call-drag>
      <button type="button" className="lb-voice-mini__main" data-call-drag onClick={onExpand}>
        <UserAvatar
          src={person.avatar}
          uid={person.uid}
          username={person.handle}
          displayName={person.name}
          size={32}
          ringClassName="ring-0"
        />
        <span>
          <strong>{person.name || `@${person.handle}`}</strong>
          <em>{label}</em>
        </span>
      </button>
      <button
        type="button"
        className="lb-voice-mini__gift"
        data-no-drag
        onClick={() => window.dispatchEvent(new CustomEvent('liveboom:open-chat-gifts'))}
        aria-label="Regalos"
      >
        <Gift size={14} />
      </button>
      <div className="lb-voice-mini__more">
        <button
          type="button"
          className="lb-voice-mini__dots"
          data-no-drag
          onClick={() => setMenu((open) => !open)}
          aria-label="Más opciones"
        >
          <MoreVertical size={16} />
        </button>
        {menu ? (
          <div className="lb-voice-mini__menu" data-no-drag>
            <button type="button" onClick={onExpand}>
              Volver a la llamada
            </button>
            <button type="button" onClick={onHangup}>
              Finalizar
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
