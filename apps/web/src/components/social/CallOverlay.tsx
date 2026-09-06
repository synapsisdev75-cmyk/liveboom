import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useRoomContext,
  useTracks,
  type TrackReference,
} from '@livekit/components-react';
import type { DeepAR } from 'deepar';
import { LocalVideoTrack, DisconnectReason, RoomEvent, Track } from 'livekit-client';
import {
  ChevronDown,
  Gift,
  Mic,
  MicOff,
  PhoneOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { CallRequestInbox } from './CallRequestInbox';
import { PaidCallMeter } from './PaidCallMeter';
import { startCallRing, stopCallRing, startOutgoingCallTone, stopOutgoingCallTone, playCallConnectedSound, playCallEndedSound } from '../../lib/alertSound';
import {
  listenCallAvailability,
  releaseOwnCallPresence,
  releaseStaleOwnCallPresence,
  setCallAvailability,
} from '../../lib/callAvailability';
import { readCallSession, clearCallSession } from '../../lib/callSessionPersist';
import { formatCallApiError, requestCallToken } from '../../lib/liveKitCallService';
import {
  callMediaDeniedMessage,
  ensureCallMediaPermission,
  inferCallCameraFacing,
  labelCallCamera,
  labelCallMicrophone,
  listCallMediaDevices,
} from '../../lib/callMedia';
import {
  applyCallFilter,
  createCallDeepAR,
  type CallFilterId,
} from '../../lib/deepar';
import {
  answerPrivateCall,
  beatPresence,
  isLivePrivateCallStatus,
  listenConversations,
  markInboxDelivered,
  peekPrivateCall,
  sendChatMessage,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import {
  connectedAtToMs,
  formatCallClock,
  useCallElapsed,
  useCallStore,
} from '../../store/callStore';
import { UserAvatar } from '../profile/UserAvatar';
import { IncomingCallCard } from './IncomingCallCard';
import { FloatingCallFrame, clearFloatingCallPosition } from './FloatingCallFrame';
import { VoiceCallActive, VoiceCallIncoming, VoiceCallOutgoing } from './VoiceCallPanels';
import { VideoCallEnded, VideoCallOutgoing } from './VideoCallPanels';

function CallReconnectBanner() {
  const room = useRoomContext();
  const recovering = useCallStore((state) => state.recovering);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const onRe = () => setText('Reconectando llamada...');
    const onOk = () => setText(null);
    const onLost = () => setText('Conexión perdida');
    room.on(RoomEvent.Reconnecting, onRe);
    room.on(RoomEvent.Reconnected, onOk);
    room.on(RoomEvent.Disconnected, onLost);
    return () => {
      room.off(RoomEvent.Reconnecting, onRe);
      room.off(RoomEvent.Reconnected, onOk);
      room.off(RoomEvent.Disconnected, onLost);
    };
  }, [room]);
  const label = recovering ? 'Reconectando llamada...' : text;
  if (!label) return null;
  return <p className="lb-call-banner">{label}</p>;
}

/** Reconecta si LiveKit cae pero la llamada sigue activa en el store. */
function CallAutoReconnect({ serverUrl, token }: { serverUrl: string; token: string }) {
  const room = useRoomContext();

  useEffect(() => {
    let timer = 0;
    let attempts = 0;

    const onLost = (reason?: DisconnectReason) => {
      const status = useCallStore.getState().status;
      if (status !== 'active' && status !== 'ringing-out') return;
      if (reason === DisconnectReason.CLIENT_INITIATED) return;
      if (attempts >= 5) return;
      attempts += 1;
      console.warn('[LiveKit] disconnected — retry', { reason, attempts });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (room.state === 'disconnected') {
          void room.connect(serverUrl, token).catch((error) => {
            console.error('[LiveKit ERROR]', { stage: 'reconnect', error });
          });
        }
      }, 700 * attempts);
    };

    const onOk = () => {
      attempts = 0;
    };

    room.on(RoomEvent.Disconnected, onLost);
    room.on(RoomEvent.Connected, onOk);
    room.on(RoomEvent.Reconnected, onOk);
    return () => {
      window.clearTimeout(timer);
      room.off(RoomEvent.Disconnected, onLost);
      room.off(RoomEvent.Connected, onOk);
      room.off(RoomEvent.Reconnected, onOk);
    };
  }, [room, serverUrl, token]);

  return null;
}

function useCallLinkState() {
  const room = useRoomContext();
  const [link, setLink] = useState<'ok' | 'reconnecting' | 'lost'>('ok');

  useEffect(() => {
    const onRe = () => setLink('reconnecting');
    const onOk = () => setLink('ok');
    const onLost = () => setLink('lost');
    room.on(RoomEvent.Reconnecting, onRe);
    room.on(RoomEvent.Reconnected, onOk);
    room.on(RoomEvent.Disconnected, onLost);
    return () => {
      room.off(RoomEvent.Reconnecting, onRe);
      room.off(RoomEvent.Reconnected, onOk);
      room.off(RoomEvent.Disconnected, onLost);
    };
  }, [room]);

  return link;
}

function CallAudioUnlock() {
  const room = useRoomContext();
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const sync = () => setBlocked(!room.canPlaybackAudio);
    sync();
    const onChange = () => sync();
    room.on(RoomEvent.AudioPlaybackStatusChanged, onChange);
    void room.startAudio().then(sync).catch(() => setBlocked(true));
    return () => {
      room.off(RoomEvent.AudioPlaybackStatusChanged, onChange);
    };
  }, [room]);

  if (!blocked) return null;
  return (
    <button
      type="button"
      className="lb-call-audio-unlock"
      onClick={() => {
        void room.startAudio().then(() => setBlocked(!room.canPlaybackAudio));
      }}
    >
      Activar audio
    </button>
  );
}

function CallConnectionSync() {
  const room = useRoomContext();
  const markActive = useCallStore((state) => state.markActive);

  useEffect(() => {
    const callId = useCallStore.getState().callId;
    console.info('[LiveKit] connecting room', { callId, roomName: room.name });
    const onConnected = () => {
      console.info('[LiveKit] room connected', { callId, roomName: room.name });
      useCallStore.getState().setRecovering(false);
      if (room.remoteParticipants.size > 0) promote();
    };
    const promote = () => {
      if (useCallStore.getState().status === 'ringing-out') markActive();
    };
    const maybePromote = () => {
      if (room.remoteParticipants.size > 0) promote();
    };
    const onLocalPub = (publication: { source?: string; kind?: string }) => {
      if (publication.kind === 'audio' || String(publication.source || '') === 'microphone') {
        console.info('[LiveKit] microphone published', { callId });
      }
      if (publication.kind === 'video') {
        console.info('[LiveKit] camera published', { callId, source: publication.source });
      }
    };
    const onSub = (track: { kind?: string }, _pub: unknown, participant: { isLocal?: boolean }) => {
      if (participant?.isLocal) return;
      if (track.kind === 'audio') console.info('[LiveKit] remote audio subscribed', { callId });
      if (track.kind === 'video') console.info('[LiveKit] remote video subscribed', { callId });
      maybePromote();
    };
    maybePromote();
    if (room.state === 'connected') onConnected();
    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.ParticipantConnected, promote);
    room.on(RoomEvent.TrackSubscribed, onSub);
    room.on(RoomEvent.LocalTrackPublished, onLocalPub);
    return () => {
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.ParticipantConnected, promote);
      room.off(RoomEvent.TrackSubscribed, onSub);
      room.off(RoomEvent.LocalTrackPublished, onLocalPub);
    };
  }, [room, markActive]);

  return null;
}

function firstAudioMediaTrack(room: ReturnType<typeof useRoomContext>) {
  for (const pub of room.localParticipant.audioTrackPublications.values()) {
    const media = pub.track?.mediaStreamTrack;
    if (media && media.readyState === 'live') return media;
  }
  for (const participant of room.remoteParticipants.values()) {
    for (const pub of participant.audioTrackPublications.values()) {
      const media = pub.track?.mediaStreamTrack;
      if (media && media.readyState === 'live') return media;
    }
  }
  return null;
}

export function CallVoiceWaveform({ active }: { active: boolean }) {
  const room = useRoomContext();
  const [levels, setLevels] = useState<number[]>(() => Array(18).fill(0.22));

  useEffect(() => {
    let raf = 0;
    let ctx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    const bins = new Uint8Array(32);
    const started = Date.now();
    let cancelled = false;

    function ambient(now: number) {
      const t = now / 320;
      return Array.from({ length: 18 }, (_, i) => {
        const wave = 0.28 + Math.sin(t + i * 0.45) * 0.18 + Math.sin(t * 1.7 + i) * 0.1;
        return Math.max(0.12, Math.min(1, wave));
      });
    }

    function detach() {
      try {
        source?.disconnect();
      } catch {
        /* ignore */
      }
      source = null;
      analyser = null;
    }

    function attach() {
      const media = firstAudioMediaTrack(room);
      if (!active || !media) {
        detach();
        return;
      }
      try {
        if (!ctx) ctx = new AudioContext();
        if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
        detach();
        source = ctx.createMediaStreamSource(new MediaStream([media]));
        analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.62;
        source.connect(analyser);
      } catch {
        detach();
      }
    }

    function tick() {
      if (cancelled) return;
      if (analyser) {
        analyser.getByteFrequencyData(bins);
        const step = Math.max(1, Math.floor(bins.length / 18));
        const next: number[] = [];
        let energy = 0;
        for (let i = 0; i < 18; i += 1) {
          let sum = 0;
          for (let j = 0; j < step; j += 1) sum += bins[i * step + j] || 0;
          const v = Math.min(1, sum / (step * 160));
          energy += v;
          next.push(v);
        }
        setLevels(energy < 0.9 ? ambient(Date.now() - started) : next);
      } else {
        setLevels(ambient(Date.now() - started));
      }
      raf = requestAnimationFrame(tick);
    }

    attach();
    tick();
    const refresh = () => attach();
    room.on(RoomEvent.LocalTrackPublished, refresh);
    room.on(RoomEvent.TrackSubscribed, refresh);
    room.on(RoomEvent.TrackUnsubscribed, refresh);
    room.on(RoomEvent.LocalTrackUnpublished, refresh);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      room.off(RoomEvent.LocalTrackPublished, refresh);
      room.off(RoomEvent.TrackSubscribed, refresh);
      room.off(RoomEvent.TrackUnsubscribed, refresh);
      room.off(RoomEvent.LocalTrackUnpublished, refresh);
      detach();
      if (ctx && ctx.state !== 'closed') void ctx.close();
    };
  }, [room, active]);

  return (
    <div className="lb-call-wave" aria-hidden>
      {levels.map((level, index) => (
        <span key={index} style={{ height: `${Math.round(18 + level * 82)}%` }} />
      ))}
    </div>
  );
}

export function useCoarseCallLayout() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const sync = () => {
      const narrow = window.matchMedia('(max-width: 767px)').matches;
      const touch = window.matchMedia('(pointer: coarse)').matches;
      setCoarse(narrow || (touch && window.innerWidth < 1024));
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, []);
  return coarse;
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
  const root = document.querySelector('.lb-call-room');
  const nodes = root?.querySelectorAll<HTMLAudioElement>('audio') ?? [];
  nodes.forEach((audio) => {
    audio.muted = !speakerOn;
    audio.volume = volume;
  });
}

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
    /* El navegador no expone salida; no romper la llamada. */
  }
}

function openCallGifts() {
  window.dispatchEvent(new CustomEvent('liveboom:open-chat-gifts'));
}

function cameraVideoConstraints(
  facing: 'user' | 'environment',
  deviceId: string | null,
): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facing } }),
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };
}

function attachLocalPreview(host: HTMLElement, track: MediaStreamTrack, mirror: boolean) {
  host.innerHTML = '';
  const videoEl = document.createElement('video');
  videoEl.srcObject = new MediaStream([track]);
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.autoplay = true;
  videoEl.className = 'h-full w-full bg-black object-contain';
  if (mirror) videoEl.style.transform = 'scaleX(-1)';
  host.appendChild(videoEl);
  void videoEl.play().catch(() => undefined);
}

function CallDeviceList({
  title,
  devices,
  activeId,
  sheet,
  onSelect,
  onClose,
  labelFor,
}: {
  title: string;
  devices: MediaDeviceInfo[];
  activeId?: string | null;
  sheet?: boolean;
  onSelect: (deviceId: string) => void;
  onClose: () => void;
  labelFor: (device: MediaDeviceInfo, index: number) => string;
}) {
  return (
    <>
      <button
        type="button"
        className="lb-call-device-dismiss"
        aria-label="Cerrar selector"
        onClick={onClose}
      />
      <div
        className={`lb-call-device-bar${sheet ? ' is-sheet' : ''}`}
        role="listbox"
        aria-label={title}
        data-no-drag
      >
        <p className="lb-call-device-bar__title">{title}</p>
        {devices.length === 0 ? (
          <p className="lb-call-device-bar__empty">No se detectaron dispositivos</p>
        ) : (
          devices.map((device, index) => {
            const active = Boolean(activeId) && device.deviceId === activeId;
            return (
              <button
                key={device.deviceId}
                type="button"
                role="option"
                aria-selected={active}
                className={`lb-call-device-item${active ? ' is-on' : ''}`}
                onClick={() => onSelect(device.deviceId)}
              >
                {labelFor(device, index)}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

function CallInCallBar({
  video,
  camOn,
  onCameraClick,
  onCameraHold,
  onMicHold,
  onOpenMicDevices,
  showMicPickerBtn,
  onHangup,
  voiceUi,
}: {
  video: boolean;
  camOn: boolean;
  onCameraClick?: () => void;
  onCameraHold?: () => void;
  onMicHold?: () => void;
  onOpenMicDevices?: () => void;
  showMicPickerBtn?: boolean;
  onHangup: () => void;
  voiceUi?: boolean;
}) {
  const room = useRoomContext();
  const [micOn, setMicOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const camHoldRef = useRef(0);
  const micHoldRef = useRef(0);
  const camHeldRef = useRef(false);
  const micHeldRef = useRef(false);

  useEffect(() => {
    applySpeakerOutput(room, speakerOn);
  }, [room, speakerOn]);

  useEffect(() => {
    return () => {
      window.clearTimeout(camHoldRef.current);
      window.clearTimeout(micHoldRef.current);
    };
  }, []);

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

  const micBtn = (
    <span className="lb-call-ctrl-stack">
      <button
        type="button"
        className={`lb-call-ctrl${micOn ? ' is-on' : ' is-muted'}`}
        onPointerDown={() => {
          micHeldRef.current = false;
          window.clearTimeout(micHoldRef.current);
          micHoldRef.current = window.setTimeout(() => {
            micHeldRef.current = true;
            onMicHold?.();
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
        aria-pressed={micOn}
      >
        {micOn ? <Mic size={18} /> : <MicOff size={18} />}
      </button>
      {showMicPickerBtn ? (
        <button
          type="button"
          className="lb-call-ctrl-caret"
          onClick={(event) => {
            event.stopPropagation();
            onOpenMicDevices?.();
          }}
          aria-label="Elegir micrófono"
        >
          <ChevronDown size={10} />
        </button>
      ) : null}
    </span>
  );
  const speakerBtn = (
    <button
      type="button"
      className={`lb-call-ctrl${speakerOn ? ' is-on' : ' is-muted'}`}
      onClick={() => {
        const next = !speakerOn;
        setSpeakerOn(next);
        if (next) void trySpeakerSink(room);
      }}
      aria-label={speakerOn ? 'Silenciar altavoz' : 'Activar altavoz'}
      aria-pressed={speakerOn}
    >
      {speakerOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
    </button>
  );
  const endBtn = (
    <button type="button" className="lb-call-ctrl lb-call-ctrl--end" onClick={onHangup} aria-label="Finalizar llamada">
      <PhoneOff size={18} />
    </button>
  );
  const giftBtn = (
    <button type="button" className="lb-call-ctrl" onClick={openCallGifts} aria-label="Regalos">
      <Gift size={18} />
    </button>
  );

  if (voiceUi) {
    return (
      <div className="lb-call-voice-controls-wrap">
        <div className="lb-call-voice-controls">
          <span className="lb-call-voice-ctrl">
            {micBtn}
            <span>{micOn ? 'Micrófono activado' : 'Micrófono silenciado'}</span>
          </span>
          <span className="lb-call-voice-ctrl">
            {speakerBtn}
            <span>{speakerOn ? 'Altavoz activado' : 'Altavoz silenciado'}</span>
          </span>
          <span className="lb-call-voice-ctrl">
            {giftBtn}
            <span>Regalos</span>
          </span>
          <span className="lb-call-voice-ctrl">
            {endBtn}
            <span>Finalizar</span>
          </span>
        </div>
        {micError ? <p className="lb-call-voice-error">{micError}</p> : null}
      </div>
    );
  }

  return (
    <div className="lb-video-controls">
      {video ? (
        <span className="lb-video-ctrl">
          <button
            type="button"
            className={`lb-call-ctrl${camOn ? ' is-on' : ''}`}
            onPointerDown={() => {
              camHeldRef.current = false;
              window.clearTimeout(camHoldRef.current);
              camHoldRef.current = window.setTimeout(() => {
                camHeldRef.current = true;
                onCameraHold?.();
              }, 480);
            }}
            onPointerUp={() => window.clearTimeout(camHoldRef.current)}
            onPointerCancel={() => window.clearTimeout(camHoldRef.current)}
            onClick={() => {
              if (camHeldRef.current) {
                camHeldRef.current = false;
                return;
              }
              onCameraClick?.();
            }}
            aria-label="Cámara"
          >
            {camOn ? <Video size={18} /> : <VideoOff size={18} />}
          </button>
          <em>Cámara</em>
        </span>
      ) : null}
      <span className="lb-video-ctrl">
        {micBtn}
        <em>Micrófono</em>
      </span>
      <span className="lb-video-ctrl">
        {endBtn}
        <em>Finalizar</em>
      </span>
      <span className="lb-video-ctrl lb-video-ctrl--gift">
        {giftBtn}
        <em>Regalos</em>
      </span>
      {micError ? <p className="lb-call-voice-error">{micError}</p> : null}
    </div>
  );
}

function CallStage({
  video,
  ringing,
  connected,
  elapsed,
  name,
  handle,
  avatar,
  peerUid,
  onHangup,
  onCancel,
  onFollowChat,
}: {
  video: boolean;
  ringing?: boolean;
  connected?: boolean;
  elapsed?: number;
  name?: string;
  handle?: string;
  avatar?: string | null;
  peerUid?: string;
  onHangup: () => void;
  onCancel?: () => void;
  onFollowChat?: () => void;
}) {
  const room = useRoomContext();
  const link = useCallLinkState();
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: false },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);
  const remoteScreens = tracks.filter(
    (track): track is TrackReference =>
      Boolean(track.publication) && !track.participant.isLocal && track.source === Track.Source.ScreenShare,
  );
  const remoteCameras = tracks.filter(
    (track): track is TrackReference =>
      Boolean(track.publication) && !track.participant.isLocal && track.source === Track.Source.Camera,
  );
  const remoteMain = remoteScreens[0] || remoteCameras[0];

  const previewRef = useRef<HTMLDivElement>(null);
  const deepArRef = useRef<DeepAR | null>(null);
  const publishedRef = useRef<LocalVideoTrack | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const filterId: CallFilterId = 'none';
  const coarse = useCoarseCallLayout();
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [ready, setReady] = useState(false);
  const [arEnabled, setArEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [camOn, setCamOn] = useState(true);
  const [picker, setPicker] = useState<null | 'camera' | 'mic'>(null);
  const [camHint, setCamHint] = useState<string | null>(null);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [cameraDeviceId, setCameraDeviceId] = useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
  const [pip, setPip] = useState({ x: 0, y: 0 });
  const pipDrag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    if (!video) return;
    let cancelled = false;

    async function publishPlainCamera(host: HTMLElement) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: cameraVideoConstraints(facing, cameraDeviceId),
        audio: false,
      });
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const mediaTrack = stream.getVideoTracks()[0];
      if (!mediaTrack) throw new Error('Sin cámara');
      attachLocalPreview(host, mediaTrack, facing === 'user');
      const localTrack = new LocalVideoTrack(mediaTrack, undefined, false);
      publishedRef.current = localTrack;
      setActiveVideoId(mediaTrack.getSettings().deviceId || cameraDeviceId);
      await room.localParticipant.publishTrack(localTrack, {
        source: Track.Source.Camera,
        name: 'camera',
      });
      setArEnabled(false);
      setReady(true);
      setError(null);
    }

    async function boot() {
      const host = previewRef.current;
      if (!host) return;
      setError(null);
      setReady(false);
      setArEnabled(false);
      try {
        await new Promise<void>((resolve) => {
          if (room.state === 'connected') {
            resolve();
            return;
          }
          const onConnected = () => {
            room.off(RoomEvent.Connected, onConnected);
            resolve();
          };
          room.on(RoomEvent.Connected, onConnected);
        });
        if (cancelled) return;

        // DeepAR a veces hace alert() si la licencia no incluye este dominio.
        const nativeAlert = window.alert;
        window.alert = () => undefined;
        let deepAR: DeepAR | null = null;
        try {
          deepAR = await createCallDeepAR(host, facing);
        } catch (err) {
          console.warn('[call] DeepAR no disponible, cámara normal', err);
          deepAR = null;
        } finally {
          window.alert = nativeAlert;
        }

        if (cancelled) {
          deepAR?.shutdown();
          return;
        }

        if (!deepAR) {
          await publishPlainCamera(host);
          return;
        }

        try {
          deepArRef.current = deepAR;
          await deepAR.startCamera({
            mirror: facing === 'user',
            mediaStreamConstraints: {
              video: cameraVideoConstraints(facing, cameraDeviceId),
              audio: false,
            },
          });
          if (cancelled) return;

          await applyCallFilter(deepAR, filterId);
          if (cancelled) return;

          const canvas = deepAR.getCanvas();
          const stream = canvas.captureStream(24);
          streamRef.current = stream;
          const mediaTrack = stream.getVideoTracks()[0];
          if (!mediaTrack) throw new Error('Sin track de video DeepAR');

          const localTrack = new LocalVideoTrack(mediaTrack, undefined, true);
          publishedRef.current = localTrack;
          setActiveVideoId(cameraDeviceId);
          await room.localParticipant.publishTrack(localTrack, {
            source: Track.Source.Camera,
            name: 'camera-ar',
          });
          if (!cancelled) {
            setArEnabled(true);
            setReady(true);
          }
        } catch (err) {
          console.warn('[call] DeepAR falló, fallback cámara', err);
          try {
            deepAR.stopCamera();
            deepAR.shutdown();
          } catch {
            /* ignore */
          }
          deepArRef.current = null;
          host.innerHTML = '';
          await publishPlainCamera(host);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError('No se pudo iniciar la cámara. Revisa permisos del navegador.');
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
      const pub = publishedRef.current;
      publishedRef.current = null;
      if (pub) {
        void room.localParticipant.unpublishTrack(pub).catch(() => undefined);
        pub.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const instance = deepArRef.current;
      deepArRef.current = null;
      if (instance) {
        try {
          instance.stopCamera();
          instance.shutdown();
        } catch {
          /* ignore */
        }
      }
      if (previewRef.current) previewRef.current.innerHTML = '';
      setReady(false);
      setArEnabled(false);
    };
    // Solo al entrar a la sala de video. Cambiar cámara usa restartTrack, no remonta la room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, room]);

  useEffect(() => {
    const instance = deepArRef.current;
    if (!instance || !ready || !arEnabled) return;
    void applyCallFilter(instance, filterId).catch((err) => console.error(err));
  }, [filterId, ready, arEnabled]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void listCallMediaDevices().then((list) => {
        if (cancelled) return;
        setVideoInputs(list.video);
        setAudioInputs(list.audio);
      });
    };
    refresh();
    const devices = navigator.mediaDevices;
    devices?.addEventListener?.('devicechange', refresh);
    return () => {
      cancelled = true;
      devices?.removeEventListener?.('devicechange', refresh);
    };
  }, []);

  useEffect(() => {
    if (!camHint) return;
    const timer = window.setTimeout(() => setCamHint(null), 1600);
    return () => window.clearTimeout(timer);
  }, [camHint]);

  useEffect(() => {
    const getter = (room as { getActiveDevice?: (kind: MediaDeviceKind) => string }).getActiveDevice;
    if (typeof getter === 'function') {
      const id = getter('audioinput');
      if (id) setActiveAudioId(id);
    }
  }, [room]);

  function toggleCam() {
    const pub = publishedRef.current;
    if (!pub) return;
    if (camOn) void pub.mute();
    else void pub.unmute();
    setCamOn((value) => !value);
  }

  async function applyCameraDevice(deviceId: string, nextFacing: 'user' | 'environment') {
    const host = previewRef.current;
    const constraints = cameraVideoConstraints(nextFacing, deviceId);

    if (arEnabled && deepArRef.current) {
      try {
        deepArRef.current.stopCamera();
        deepArRef.current.shutdown();
      } catch {
        /* ignore */
      }
      deepArRef.current = null;
      setArEnabled(false);
      const old = publishedRef.current;
      if (old) {
        await room.localParticipant.unpublishTrack(old).catch(() => undefined);
        old.stop();
        publishedRef.current = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      const mediaTrack = stream.getVideoTracks()[0];
      if (!mediaTrack) throw new Error('Sin cámara');
      if (host) attachLocalPreview(host, mediaTrack, nextFacing === 'user');
      const localTrack = new LocalVideoTrack(mediaTrack, undefined, false);
      publishedRef.current = localTrack;
      await room.localParticipant.publishTrack(localTrack, {
        source: Track.Source.Camera,
        name: 'camera',
      });
    } else {
      const pub = publishedRef.current;
      if (!pub) {
        setCameraDeviceId(deviceId);
        setFacing(nextFacing);
        return;
      }
      await pub.restartTrack({
        deviceId,
        facingMode: nextFacing,
        resolution: { width: 1280, height: 720 },
      });
      const media = pub.mediaStreamTrack;
      if (host && media) attachLocalPreview(host, media, nextFacing === 'user');
    }

    const activeId = publishedRef.current?.mediaStreamTrack.getSettings().deviceId || deviceId;
    setFacing(nextFacing);
    setCameraDeviceId(deviceId);
    setActiveVideoId(activeId);
  }

  async function handleCameraClick() {
    if (!camOn) {
      toggleCam();
      return;
    }
    const list = videoInputs.length ? videoInputs : (await listCallMediaDevices()).video;
    if (list.length && list !== videoInputs) setVideoInputs(list);
    if (list.length <= 1) {
      const only = list[0];
      const facingHint = inferCallCameraFacing(only?.label || '');
      setCamHint(
        !only
          ? 'No se detectó cámara'
          : facingHint === 'environment'
            ? 'Cámara trasera'
            : facingHint === 'user'
              ? 'Cámara frontal'
              : only.label || 'Cámara',
      );
      setPicker(null);
      return;
    }
    setPicker((current) => (current === 'camera' ? null : 'camera'));
  }

  async function selectCamera(deviceId: string) {
    const device = videoInputs.find((item) => item.deviceId === deviceId);
    const inferred = inferCallCameraFacing(device?.label || '');
    const nextFacing = inferred === 'environment' || inferred === 'user' ? inferred : facing;
    try {
      await applyCameraDevice(deviceId, nextFacing);
      setCamHint(
        nextFacing === 'user' ? 'Cámara frontal' : nextFacing === 'environment' ? 'Cámara trasera' : device?.label || 'Cámara',
      );
      setPicker(null);
      setError(null);
    } catch (err) {
      setError(callMediaDeniedMessage(err, true));
    }
  }

  async function selectMicrophone(deviceId: string) {
    try {
      await room.switchActiveDevice('audioinput', deviceId);
      setActiveAudioId(deviceId);
      setPicker(null);
      setError(null);
    } catch (err) {
      setError(callMediaDeniedMessage(err, false));
    }
  }

  function openMicPicker() {
    if (audioInputs.length <= 1) return;
    setPicker((current) => (current === 'mic' ? null : 'mic'));
  }

  const controls = (
    <CallInCallBar
      video={video}
      camOn={camOn}
      onCameraClick={video ? () => void handleCameraClick() : undefined}
      onCameraHold={video ? toggleCam : undefined}
      onMicHold={openMicPicker}
      onOpenMicDevices={openMicPicker}
      showMicPickerBtn={!coarse && audioInputs.length > 1}
      onHangup={onHangup}
      voiceUi={!video}
    />
  );

  if (!video) {
    const person = {
      name: name || '',
      handle: handle || '',
      avatar: avatar || null,
      uid: peerUid,
    };
    const reconnecting = link === 'reconnecting';
    const lost = link === 'lost';
    return (
      <>
        <CallConnectionSync />
        <RoomAudioRenderer />
        <CallAudioUnlock />
        {connected ? (
          <VoiceCallActive
            person={person}
            elapsedLabel={formatCallClock(elapsed || 0)}
            reconnecting={reconnecting}
            lost={lost}
            onHangup={onHangup}
            onFollowChat={() => onFollowChat?.()}
          />
        ) : (
          <VoiceCallOutgoing
            person={person}
            reconnecting={reconnecting}
            onCancel={onCancel || onHangup}
            onFollowChat={() => onFollowChat?.()}
          />
        )}
      </>
    );
  }

  return (
    <>
      <CallConnectionSync />
      <RoomAudioRenderer />
      <CallAudioUnlock />
      <div className="lb-call-video-stage" data-call-drag>
        {connected ? (
          <div className="lb-video-hud" data-call-drag>
            <p>@{handle || 'usuario'}</p>
            <p>{formatCallClock(elapsed || 0)}</p>
          </div>
        ) : null}
        {camHint ? (
          <p className="lb-call-cam-hint" role="status">
            {camHint}
          </p>
        ) : null}
        {picker === 'camera' ? (
          <CallDeviceList
            title="Cámara"
            devices={videoInputs}
            activeId={activeVideoId || cameraDeviceId}
            sheet={coarse}
            onSelect={(id) => void selectCamera(id)}
            onClose={() => setPicker(null)}
            labelFor={(device, index) => labelCallCamera(device, index, coarse)}
          />
        ) : null}
        {picker === 'mic' ? (
          <CallDeviceList
            title="Micrófono"
            devices={audioInputs}
            activeId={activeAudioId}
            sheet={coarse}
            onSelect={(id) => void selectMicrophone(id)}
            onClose={() => setPicker(null)}
            labelFor={labelCallMicrophone}
          />
        ) : null}
        <div className="lb-call-video-remote">
          {!remoteMain ? (
            <div className="lb-call-video-wait">
              {connected ? (
                <>
                  <UserAvatar
                    src={avatar || null}
                    uid={peerUid}
                    username={handle}
                    displayName={name}
                    size={96}
                    ringClassName="ring-0"
                  />
                  <p>{name || (handle ? `@${handle}` : 'LiveBoom')}</p>
                  <p>Cámara desactivada</p>
                </>
              ) : ringing ? (
                <VideoCallOutgoing
                  person={{
                    name: name || '',
                    handle: handle || '',
                    avatar: avatar || null,
                    uid: peerUid,
                  }}
                  onCancel={onCancel || onHangup}
                />
              ) : (
                <p>Conectando...</p>
              )}
            </div>
          ) : (
            <VideoTrack
              key={`${remoteMain.participant.identity}-${remoteMain.source}`}
              trackRef={remoteMain}
              className="h-full w-full object-contain"
            />
          )}
        </div>
        <div
          className={`lb-call-video-local${camOn ? '' : ' is-off'}`}
          style={{ transform: `translate(${pip.x}px, ${pip.y}px)` }}
          onPointerDown={(event) => {
            pipDrag.current = { x: event.clientX, y: event.clientY, ox: pip.x, oy: pip.y };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!pipDrag.current) return;
            setPip({
              x: pipDrag.current.ox + event.clientX - pipDrag.current.x,
              y: pipDrag.current.oy + event.clientY - pipDrag.current.y,
            });
          }}
          onPointerUp={() => {
            pipDrag.current = null;
          }}
        >
          <div
            ref={previewRef}
            className="h-full w-full bg-black [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-contain [&_video]:h-full [&_video]:w-full [&_video]:object-contain"
          />
          {!ready && !error ? (
            <p className="pointer-events-none absolute inset-0 grid place-items-center text-[11px] text-zinc-400">
              Cámara…
            </p>
          ) : null}
          {error ? (
            <p className="pointer-events-none absolute inset-0 grid place-items-center px-2 text-center text-[11px] text-rose-300">
              {error}
            </p>
          ) : null}
          {!camOn ? (
            <p className="pointer-events-none absolute inset-0 grid place-items-center bg-black/70 text-[10px] text-zinc-400">
              Cámara off
            </p>
          ) : null}
        </div>
      </div>

      {controls}
    </>
  );
}

export function CallOverlay() {
  const profile = useAuthStore((state) => state.profile);
  const location = useLocation();
  const navigate = useNavigate();
  const status = useCallStore((state) => state.status);
  const peer = useCallStore((state) => state.peer);
  const video = useCallStore((state) => state.video);
  const token = useCallStore((state) => state.token);
  const serverUrl = useCallStore((state) => state.serverUrl);
  const chatId = useCallStore((state) => state.chatId);
  const callId = useCallStore((state) => state.callId);
  const incoming = useCallStore((state) => state.incoming);
  const setIncoming = useCallStore((state) => state.setIncoming);
  const beginOutgoing = useCallStore((state) => state.beginOutgoing);
  const beginIncomingAccepted = useCallStore((state) => state.beginIncomingAccepted);
  const markActive = useCallStore((state) => state.markActive);
  const hangup = useCallStore((state) => state.hangup);
  const recovering = useCallStore((state) => state.recovering);
  const setRecovering = useCallStore((state) => state.setRecovering);
  const endedSummary = useCallStore((state) => state.endedSummary);
  const clearEndedSummary = useCallStore((state) => state.clearEndedSummary);
  const cooldownRef = useRef<Record<string, number>>({});
  const [ringMuted, setRingMuted] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const elapsed = useCallElapsed();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [customReply, setCustomReply] = useState('');
  const prevStatusRef = useRef(status);
  const lastOwnedCallIdRef = useRef<string | null>(null);
  const recoveredRef = useRef(false);
  const [selfBusyCallId, setSelfBusyCallId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || recoveredRef.current) return;
    recoveredRef.current = true;
    const saved = readCallSession();
    void (async () => {
      if (!saved) {
        await releaseStaleOwnCallPresence(profile.firebaseUid).catch(() => undefined);
        return;
      }
      setRecovering(true);
      try {
        const remote = await peekPrivateCall(saved.chatId);
        if (!remote || !isLivePrivateCallStatus(remote.status)) {
          clearCallSession();
          await releaseOwnCallPresence(profile.firebaseUid, saved.callId).catch(() => undefined);
          setRecovering(false);
          return;
        }
        if (remote.status === 'ringing' && saved.role === 'callee') {
          setIncoming({
            chatId: saved.chatId,
            callId: remote.id || saved.callId,
            video: remote.video,
            peer: saved.peer,
          });
          setRecovering(false);
          return;
        }
        const session = await requestCallToken(remote.id || saved.callId, saved.chatId);
        const payload = {
          chatId: saved.chatId,
          callId: session.callId || remote.id || saved.callId,
          peer: saved.peer,
          video: Boolean(saved.video || remote.video),
          token: session.token,
          serverUrl: session.serverUrl,
        };
        if (remote.status === 'active') {
          if (saved.role === 'callee') beginIncomingAccepted(payload);
          else beginOutgoing(payload);
          const started = saved.connectedAt || connectedAtToMs(remote.connectedAt);
          if (started) markActive(started);
          else markActive();
        } else {
          beginOutgoing(payload);
        }
      } catch {
        clearCallSession();
        await releaseOwnCallPresence(profile.firebaseUid, saved.callId).catch(() => undefined);
        setRecovering(false);
      }
    })();
  }, [profile, beginIncomingAccepted, beginOutgoing, markActive, setIncoming, setRecovering]);

  useEffect(() => {
    if (!recovering) return;
    const timer = window.setTimeout(() => {
      useCallStore.getState().setRecovering(false);
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [recovering]);

  useEffect(() => {
    if (status === 'idle' || status === 'ringing-in') {
      setRepliesOpen(false);
      setCustomReply('');
    }
    if (status === 'idle') clearFloatingCallPosition();
  }, [status]);

  useEffect(() => {
    setRingMuted(false);
    setPermError(null);
  }, [incoming?.callId]);

  function hangupWithCooldown(outcome?: 'completed' | 'missed' | 'cancelled' | 'declined') {
    const store = useCallStore.getState();
    const id = store.chatId || store.incoming?.chatId;
    if (id) cooldownRef.current[id] = Date.now();
    void hangup(outcome);
  }

  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev !== 'active' && status === 'active' && !useCallStore.getState().recovering) {
      playCallConnectedSound();
    }
    if (prev === 'active' && status === 'idle') playCallEndedSound();
    prevStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (status !== 'ringing-out' || recovering) {
      stopOutgoingCallTone();
      return;
    }
    startOutgoingCallTone();
    return () => stopOutgoingCallTone();
  }, [status, video, recovering]);

  useEffect(() => {
    if (!profile) return;
    return listenCallAvailability(profile.firebaseUid, (availability) => {
      setSelfBusyCallId(availability.available ? null : availability.activeCallId);
    });
  }, [profile?.firebaseUid]);

  useEffect(() => {
    if (!profile) return;
    if (status === 'ringing-out' || status === 'ringing-in' || status === 'active') {
      const id = callId || incoming?.callId || null;
      lastOwnedCallIdRef.current = id;
      const tick = () => {
        void setCallAvailability(profile.firebaseUid, {
          available: false,
          callId: id,
          chatId: chatId || incoming?.chatId || null,
          peerUid: peer?.uid || incoming?.peer.uid || null,
        }).catch(() => undefined);
      };
      tick();
      const timer = window.setInterval(tick, 20_000);
      return () => window.clearInterval(timer);
    }
    const owned = lastOwnedCallIdRef.current;
    lastOwnedCallIdRef.current = null;
    if (owned) {
      void releaseOwnCallPresence(profile.firebaseUid, owned).catch(() => undefined);
    }
  }, [status, callId, chatId, incoming, peer, profile]);

  useEffect(() => {
    if (!profile) return;
    void beatPresence(profile.firebaseUid);
    const timer = window.setInterval(() => {
      void beatPresence(profile.firebaseUid);
    }, 25_000);
    return () => window.clearInterval(timer);
  }, [profile?.firebaseUid]);

  // Si estoy en línea (app abierta), marco como entregados los mensajes entrantes
  // aunque no tenga el chat abierto → el remitente ve ✓✓ gris.
  useEffect(() => {
    if (!profile) return;
    let chatIds: string[] = [];
    const run = () => {
      if (chatIds.length === 0) return;
      void markInboxDelivered(profile.firebaseUid, chatIds);
    };
    const unsub = listenConversations(profile.firebaseUid, (list) => {
      chatIds = list.map((item) => item.chatId);
      run();
    });
    const onVis = () => run();
    document.addEventListener('visibilitychange', onVis);
    const timer = window.setInterval(run, 20_000);
    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(timer);
    };
  }, [profile?.firebaseUid]);

  useEffect(() => {
    if (!profile) return;
    let hangupTimer = 0;
    const unsub = listenConversations(profile.firebaseUid, (list) => {
      const store = useCallStore.getState();
      if (store.recovering && store.status === 'idle') return;
      if (store.chatId) {
        const mine = list.find((item) => item.chatId === store.chatId);
        if (mine?.call?.status === 'active' && (store.status === 'ringing-out' || store.status === 'active')) {
          window.clearTimeout(hangupTimer);
          markActive(connectedAtToMs(mine.call.connectedAt));
        }
        // Debounce: un snapshot intermedio sin `call` no debe cortar la LiveKit mid-call.
        if (mine && mine.call == null && (store.status === 'ringing-out' || store.status === 'active')) {
          window.clearTimeout(hangupTimer);
          hangupTimer = window.setTimeout(() => {
            const latest = useCallStore.getState();
            if (latest.recovering) return;
            if (latest.status !== 'ringing-out' && latest.status !== 'active') return;
            if (latest.chatId !== store.chatId) return;
            void hangup(undefined, { skipHistory: true });
          }, 2500);
          return;
        }
        if (mine?.call) {
          window.clearTimeout(hangupTimer);
        }
      }
      if (store.status === 'active' || store.status === 'ringing-out') return;

      if (store.status === 'ringing-in' && store.incoming) {
        const current = list.find((item) => item.chatId === store.incoming?.chatId);
        if (!current?.call || current.call.status !== 'ringing' || current.call.fromUid === profile.firebaseUid) {
          setIncoming(null);
        }
        return;
      }

      const occupying = list.find((item) => {
        const call = item.call;
        if (!call) return false;
        const mine = call.fromUid === profile.firebaseUid || call.toUid === profile.firebaseUid;
        if (!mine) return false;
        if (call.status === 'active') return true;
        if (call.status === 'ringing' && call.fromUid === profile.firebaseUid) return true;
        return false;
      });

      const ringing = list
        .filter((item) => {
          const call = item.call;
          if (!call || call.status !== 'ringing' || call.fromUid === profile.firebaseUid) return false;
          if (Date.now() - (cooldownRef.current[item.chatId] || 0) < 2500) return false;
          const age = Date.now() - new Date(call.createdAt).getTime();
          return age < 50_000;
        })
        .sort((a, b) => String(b.call?.createdAt || '').localeCompare(String(a.call?.createdAt || '')))[0];

      if (!ringing?.call) {
        if (store.incoming) setIncoming(null);
        return;
      }
      if (occupying && occupying.chatId !== ringing.chatId) {
        if (store.incoming) setIncoming(null);
        return;
      }
      if (selfBusyCallId && selfBusyCallId !== ringing.call.id) {
        if (store.incoming) setIncoming(null);
        return;
      }
      setIncoming({
        chatId: ringing.chatId,
        callId: ringing.call.id,
        video: ringing.call.video,
        rateBlasts: ringing.call.rateSnapshot?.rateBlasts || 0,
        giftName: ringing.call.rateSnapshot?.giftName || null,
        giftEmoji: ringing.call.rateSnapshot?.giftEmoji || null,
        peer: {
          uid: ringing.call.fromUid,
          username: ringing.call.fromHandle || ringing.username,
          displayName: ringing.call.fromName || ringing.displayName,
          avatarUrl: ringing.call.fromAvatar || ringing.avatarUrl,
        },
      });
    });
    return () => {
      window.clearTimeout(hangupTimer);
      unsub();
    };
  }, [profile?.firebaseUid, hangup, markActive, setIncoming, selfBusyCallId]);

  useEffect(() => {
    if (status !== 'ringing-in' || ringMuted) {
      stopCallRing();
      return;
    }
    startCallRing();
    return () => stopCallRing();
  }, [status, ringMuted]);

  useEffect(() => {
    if (status !== 'ringing-out' || recovering) return;
    const timer = window.setTimeout(() => {
      hangupWithCooldown('missed');
    }, 45_000);
    return () => window.clearTimeout(timer);
  }, [status, hangup, recovering]);

  useEffect(() => {
    if (status !== 'ringing-in' || recovering) return;
    const timer = window.setTimeout(() => {
      hangupWithCooldown('missed');
    }, 45_000);
    return () => window.clearTimeout(timer);
  }, [status, hangup, recovering]);

  async function accept() {
    if (!incoming || !profile || accepting) return;
    setPermError(null);
    setAccepting(true);
    const denied = await ensureCallMediaPermission(incoming.video);
    if (denied) {
      setPermError(denied);
      setAccepting(false);
      return;
    }
    try {
      const session = await requestCallToken(incoming.callId, incoming.chatId);
      await answerPrivateCall(incoming.chatId);
      beginIncomingAccepted({
        chatId: incoming.chatId,
        callId: incoming.callId,
        peer: incoming.peer,
        video: incoming.video,
        token: session.token,
        serverUrl: session.serverUrl,
      });
    } catch (error) {
      setPermError(formatCallApiError(error));
    } finally {
      setAccepting(false);
    }
  }

  async function sendVoiceReply(text: string) {
    if (!incoming || !profile) return;
    const body = text.trim();
    if (!body) return;
    try {
      await sendChatMessage(
        {
          firebaseUid: profile.firebaseUid,
          handle: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
        incoming.peer,
        body,
      );
    } catch {
      /* el rechazo de la llamada sigue */
    }
    hangupWithCooldown('declined');
  }

  useLayoutEffect(() => {
    setHost(document.getElementById('lb-chat-call-host'));
  }, [status, location.pathname, location.search]);

  if (!profile) return null;

  const showIncoming = status === 'ringing-in' && incoming;
  const showCall = (status === 'ringing-out' || status === 'active') && token && serverUrl && peer;
  const requestUi = status === 'idle' ? <CallRequestInbox /> : null;
  const endedUi = endedSummary ? (
    <VideoCallEnded
      summary={endedSummary}
      onClose={() => clearEndedSummary()}
      onDetails={() => {
        clearEndedSummary();
        if (endedSummary.handle) navigate(`/mensajes?con=${encodeURIComponent(endedSummary.handle)}`);
      }}
    />
  ) : null;

  if (!showIncoming && !showCall) {
    return (
      <>
        {requestUi}
        {endedUi}
        {recovering
          ? createPortal(<p className="lb-call-recover">Reconectando llamada...</p>, document.body)
          : null}
      </>
    );
  }

  const name = (showIncoming ? incoming?.peer.displayName : peer?.displayName) || '';
  const handle = (showIncoming ? incoming?.peer.username : peer?.username) || '';
  const avatar = (showIncoming ? incoming?.peer.avatarUrl : peer?.avatarUrl) || null;
  const peerUid = showIncoming ? incoming?.peer.uid : peer?.uid;
  const isVideo = showIncoming ? Boolean(incoming?.video) : video;
  const person = { name, handle, avatar, uid: peerUid };

  const incomingUi =
    showIncoming && incoming ? (
      isVideo ? (
        <IncomingCallCard
          name={name}
          handle={handle}
          avatar={avatar}
          uid={peerUid}
          video={isVideo}
          accepting={accepting}
          error={permError}
          ringMuted={ringMuted}
          rateBlasts={incoming.rateBlasts}
          giftName={incoming.giftName}
          giftEmoji={incoming.giftEmoji}
          onAccept={() => void accept()}
          onDecline={() => hangupWithCooldown('declined')}
          onMuteRing={() => setRingMuted(true)}
          onMessage={() => {
            if (handle) navigate(`/mensajes?con=${encodeURIComponent(handle)}`);
          }}
          onRemindLater={() => hangupWithCooldown('declined')}
        />
      ) : (
        <VoiceCallIncoming
          person={person}
          accepting={accepting}
          error={permError}
          ringMuted={ringMuted}
          repliesOpen={repliesOpen}
          customReply={customReply}
          onCustomReplyChange={setCustomReply}
          onAccept={() => void accept()}
          onDecline={() => hangupWithCooldown('declined')}
          onMuteRing={() => setRingMuted(true)}
          onOpenReplies={() => setRepliesOpen(true)}
          onCloseReplies={() => setRepliesOpen(false)}
          onSendReply={(text) => void sendVoiceReply(text)}
        />
      )
    ) : null;

  const activeUi = showCall ? (
    <div className={`lb-call-active${isVideo ? '' : ' is-voice'}`}>
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        audio
        video={false}
        connectOptions={{
          autoSubscribe: true,
          maxRetries: 5,
          peerConnectionTimeout: 30_000,
        }}
        className={isVideo ? 'lb-call-room' : 'lb-call-room lb-call-room--voice'}
      >
        <CallAutoReconnect serverUrl={serverUrl} token={token} />
        {isVideo ? <CallReconnectBanner /> : null}
        <CallStage
          video={isVideo}
          ringing={status === 'ringing-out'}
          connected={status === 'active'}
          elapsed={elapsed}
          name={name}
          handle={handle}
          avatar={avatar}
          peerUid={peerUid}
          onHangup={() => hangupWithCooldown()}
          onCancel={() => hangupWithCooldown('cancelled')}
          onFollowChat={() => {
            navigate(handle ? `/mensajes?con=${encodeURIComponent(handle)}` : '/mensajes');
          }}
        />
        {status === 'active' ? <PaidCallMeter /> : null}
      </LiveKitRoom>
    </div>
  ) : null;

  return (
    <>
      {requestUi}
      {endedUi}
      {incomingUi
        ? host
          ? createPortal(incomingUi, host)
          : createPortal(<div className="lb-call-fallback is-incoming">{incomingUi}</div>, document.body)
        : null}
      {activeUi
        ? createPortal(
            <FloatingCallFrame video={isVideo}>
              {activeUi}
            </FloatingCallFrame>,
            document.body,
          )
        : null}
    </>
  );
}
