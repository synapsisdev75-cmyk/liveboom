import { BadgeCheck, Gift, Mic, MicOff, PhoneOff, SwitchCamera, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { useMaybeRoomContext } from '@livekit/components-react';
import { Track, RoomEvent, type LocalVideoTrack } from 'livekit-client';
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
}: {
  person: ConnectedVideoPerson;
  elapsedLabel: string;
  statusLabel?: string;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  maximized?: boolean;
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
      <div className="lb-video-connected-head__tools">
        <CallWinBar
          showLogo={false}
          onMinimize={onMinimize}
          onMaximize={onMaximize}
          maximized={maximized}
        />
      </div>
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
  camBusy,
  onToggleCam,
  onFlipCamera,
  flipBusy,
  flipDisabled,
  flipLabel = 'Girar cámara',
  onHangup,
}: {
  camOn: boolean;
  camBusy?: boolean;
  onToggleCam: () => void;
  onFlipCamera?: () => void;
  flipBusy?: boolean;
  flipDisabled?: boolean;
  flipLabel?: string;
  onHangup: () => void;
}) {
  const room = useMaybeRoomContext();
  const [micOn, setMicOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const micHoldRef = useRef(0);
  const flipEnabled = Boolean(onFlipCamera) && !flipDisabled;

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
    <div className={`lb-video-connected-actions${flipEnabled ? ' has-flip' : ''}`} data-no-drag>
      <div className="lb-video-connected-action">
        <button
          type="button"
          className={`lb-video-connected-btn${micOn ? ' is-on' : ' is-off'}`}
          onClick={() => void toggleMic()}
          aria-label={micOn ? 'Silenciar micrófono' : 'Activar micrófono'}
          aria-pressed={!micOn}
        >
          {micOn ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
      </div>
      <div className="lb-video-connected-action">
        <button
          type="button"
          className={`lb-video-connected-btn${camOn ? ' is-on' : ' is-off'}${camBusy ? ' is-busy' : ''}`}
          onClick={() => onToggleCam()}
          disabled={camBusy}
          aria-label={camOn ? 'Cerrar cámara' : 'Encender cámara'}
          aria-pressed={!camOn}
          aria-busy={camBusy || undefined}
        >
          {camOn ? <Video size={18} /> : <VideoOff size={18} />}
        </button>
      </div>
      {flipEnabled ? (
        <div className="lb-video-connected-action">
          <button
            type="button"
            className={`lb-video-connected-btn is-on${flipBusy ? ' is-busy' : ''}`}
            onClick={() => onFlipCamera?.()}
            disabled={Boolean(flipBusy)}
            aria-label={flipLabel}
            aria-busy={flipBusy || undefined}
          >
            <SwitchCamera size={18} />
          </button>
        </div>
      ) : null}
      <div className="lb-video-connected-action">
        <button
          type="button"
          className={`lb-video-connected-btn${speakerOn ? ' is-on' : ' is-off'}`}
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
      </div>
      <div className="lb-video-connected-action is-gift">
        <button
          type="button"
          className="lb-video-connected-btn is-gift is-on"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent('liveboom:open-chat-gifts', { detail: { layoutContext: 'llamadas_video' } }),
            )
          }
          aria-label="Regalos"
        >
          <Gift size={18} />
        </button>
      </div>
      <div className="lb-video-connected-action is-end">
        <button type="button" className="lb-video-connected-end" onClick={onHangup} aria-label="Finalizar">
          <PhoneOff size={22} />
        </button>
      </div>
      {micError ? <p className="lb-video-connected-error">{micError}</p> : null}
    </div>
  );
}

/** Barra con cámara/flip vía LiveKit room (connecting / fallback). */
export function ConnectedVideoCallBarFromRoom({ onHangup }: { onHangup: () => void }) {
  const room = useMaybeRoomContext();
  const [camOn, setCamOn] = useState(true);
  const [camBusy, setCamBusy] = useState(false);
  const [flipBusy, setFlipBusy] = useState(false);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [finePointer, setFinePointer] = useState(false);
  const [videoCount, setVideoCount] = useState(0);
  const busyRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = () => setFinePointer(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void navigator.mediaDevices
      .enumerateDevices()
      .then((list) => {
        if (!cancelled) setVideoCount(list.filter((item) => item.kind === 'videoinput').length);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [room, camOn]);

  useEffect(() => {
    if (!room) return;
    const sync = () => {
      try {
        let enabled = false;
        for (const pub of room.localParticipant.videoTrackPublications.values()) {
          if (pub.source !== Track.Source.Camera) continue;
          const track = pub.track as LocalVideoTrack | null;
          const media = track?.mediaStreamTrack;
          if (media?.readyState === 'live' && media.enabled && !track?.isMuted) {
            enabled = true;
            break;
          }
          if (pub.isMuted === false && pub.track) enabled = true;
        }
        setCamOn(enabled || room.localParticipant.isCameraEnabled);
      } catch {
        /* sala aún sin pubs */
      }
    };
    sync();
    room.on(RoomEvent.LocalTrackPublished, sync);
    room.on(RoomEvent.LocalTrackUnpublished, sync);
    room.on(RoomEvent.TrackMuted, sync);
    room.on(RoomEvent.TrackUnmuted, sync);
    return () => {
      room.off(RoomEvent.LocalTrackPublished, sync);
      room.off(RoomEvent.LocalTrackUnpublished, sync);
      room.off(RoomEvent.TrackMuted, sync);
      room.off(RoomEvent.TrackUnmuted, sync);
    };
  }, [room]);

  function rebindLocalPreview(mirrorUser: boolean) {
    const el = document.querySelector('.lb-call-stage-keep .lb-call-video-local video') as HTMLVideoElement | null;
    if (!el || !room) return;
    let camera: LocalVideoTrack | null = null;
    for (const pub of room.localParticipant.videoTrackPublications.values()) {
      if (pub.source === Track.Source.Camera && pub.track) {
        camera = pub.track as LocalVideoTrack;
        break;
      }
    }
    const media = camera?.mediaStreamTrack;
    if (!media) return;
    el.srcObject = null;
    el.muted = true;
    el.playsInline = true;
    el.style.transform = mirrorUser ? 'scaleX(-1)' : '';
    el.srcObject = new MediaStream([media]);
    void el.play().catch(() => undefined);
  }

  async function toggleCam() {
    const local = room?.localParticipant;
    if (!local || busyRef.current) return;
    busyRef.current = true;
    setCamBusy(true);
    const next = !camOn;
    try {
      await local.setCameraEnabled(next);
      setCamOn(next);
    } catch {
      /* permiso / dispositivo */
    } finally {
      busyRef.current = false;
      setCamBusy(false);
    }
  }

  async function flipOrSwitchCam() {
    const local = room?.localParticipant;
    if (!local || flipBusy || busyRef.current) return;

    if (finePointer) {
      if (videoCount <= 1) return;
      setFlipBusy(true);
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((item) => item.kind === 'videoinput');
        let currentId: string | undefined;
        for (const pub of local.videoTrackPublications.values()) {
          if (pub.source !== Track.Source.Camera) continue;
          currentId = pub.track?.mediaStreamTrack?.getSettings().deviceId;
          break;
        }
        const other = cams.find((item) => item.deviceId !== currentId);
        if (other && room) {
          await room.switchActiveDevice('videoinput', other.deviceId);
          rebindLocalPreview(true);
        }
      } catch {
        /* sin otra cámara */
      } finally {
        setFlipBusy(false);
      }
      return;
    }

    setFlipBusy(true);
    const nextFacing = facing === 'user' ? 'environment' : 'user';
    try {
      let camera: LocalVideoTrack | null = null;
      for (const pub of local.videoTrackPublications.values()) {
        if (pub.source === Track.Source.Camera && pub.track) {
          camera = pub.track as LocalVideoTrack;
          break;
        }
      }
      if (camera) {
        await camera.restartTrack({
          facingMode: nextFacing,
          resolution: { width: 1280, height: 720 },
        });
      } else {
        await local.setCameraEnabled(true, { facingMode: nextFacing });
      }
      setFacing(nextFacing);
      setCamOn(true);
      window.setTimeout(() => rebindLocalPreview(nextFacing === 'user'), 50);
    } catch {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((item) => item.kind === 'videoinput');
        const currentId = cams.find((item) => {
          for (const pub of local.videoTrackPublications.values()) {
            if (pub.source !== Track.Source.Camera) continue;
            return pub.track?.mediaStreamTrack?.getSettings().deviceId === item.deviceId;
          }
          return false;
        })?.deviceId;
        const other = cams.find((item) => item.deviceId !== currentId) || cams[0];
        if (other && room) {
          await room.switchActiveDevice('videoinput', other.deviceId);
          setFacing(nextFacing);
          rebindLocalPreview(nextFacing === 'user');
        }
      } catch {
        /* sin otra cámara */
      }
    } finally {
      setFlipBusy(false);
    }
  }

  return (
    <ConnectedVideoCallBar
      camOn={camOn}
      camBusy={camBusy}
      flipBusy={flipBusy}
      flipDisabled={finePointer && videoCount <= 1}
      flipLabel={finePointer ? 'Cambiar cámara' : 'Girar cámara'}
      onToggleCam={() => void toggleCam()}
      onFlipCamera={() => void flipOrSwitchCam()}
      onHangup={onHangup}
    />
  );
}
