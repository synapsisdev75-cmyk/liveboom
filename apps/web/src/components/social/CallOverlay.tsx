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
  MessageCircle,
  Mic,
  MicOff,
  PhoneOff,
  PictureInPicture2,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
import {
  callConnectUserMessage,
  classifyCallConnectError,
  describeLiveKitError,
  formatCallApiError,
  logCallConnect,
  peekLiveKitGrant,
  requestCallToken,
  shouldHangupOnLiveKitError,
} from '../../lib/liveKitCallService';
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
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import {
  connectedAtToMs,
  formatCallClock,
  useCallElapsed,
  useCallStore,
  type IncomingCall,
} from '../../store/callStore';
import { UserAvatar } from '../profile/UserAvatar';
import { IncomingCallCard } from './IncomingCallCard';
import { CallHeaderDock } from './CallHeaderDock';
import {
  CallWinBar,
  FloatingCallFrame,
  clearCallChrome,
  clearFloatingCallPosition,
  readCallChrome,
  writeCallChrome,
  type CallChrome,
} from './FloatingCallFrame';
import { VoiceCallActive, VoiceCallIncoming, VoiceCallMiniBar, VoiceCallOutgoing } from './VoiceCallPanels';
import { VideoCallEnded, VideoCallMiniBar, VideoCallOutgoing } from './VideoCallPanels';
import { useChatCallSurface } from '../../lib/chatCallSurface';

function logCallTransition(extra: Record<string, unknown> = {}) {
  const store = useCallStore.getState();
  const me = useAuthStore.getState().profile?.firebaseUid || null;
  const saved = readCallSession();
  const peerUid = store.peer?.uid || store.incoming?.peer.uid || null;
  const asCallee = store.status === 'ringing-in' || saved?.role === 'callee';
  const inCall = store.status === 'active' || store.status === 'ringing-out' || store.status === 'ringing-in';
  const callType = store.incoming?.video || store.video ? 'video' : 'audio';
  const { roomState = null, overlayMounted = false, ...rest } = extra;
  console.info('[CallTransition]', {
    callId: store.callId || store.incoming?.callId || null,
    callType,
    'call.status': store.status,
    callerId: asCallee ? peerUid : me,
    receiverId: asCallee ? me : peerUid,
    tokenReady: Boolean(store.token && store.serverUrl),
    roomName: extra.roomName ?? null,
    roomState,
    roomConnected: extra.roomConnected ?? roomState === 'connected',
    audioTrackReady: extra.audioTrackReady ?? null,
    videoTrackReady: extra.videoTrackReady ?? false,
    activeCall: store.status === 'active' || store.status === 'ringing-out',
    overlayMounted: Boolean(overlayMounted),
    voiceCallMounted: Boolean(inCall && callType === 'audio' && overlayMounted),
    videoCallMounted: Boolean(inCall && callType === 'video' && overlayMounted),
    ...rest,
  });
}

class CallLiveKitBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error('[CallConnect] overlay render error', {
      name: error.name,
      message: error.message,
    });
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

const LIVEKIT_CONNECT_OPTIONS = {
  autoSubscribe: true,
  maxRetries: 5,
  peerConnectionTimeout: 30_000,
};

/** Callbacks estables: LiveKitRoom reconecta si onError/connectOptions cambian de identidad. */
function PrivateCallLiveKitRoom({
  callId,
  token,
  serverUrl,
  className,
  style,
  children,
  onFatalError,
}: {
  callId: string | null;
  token: string;
  serverUrl: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  onFatalError: (error: Error, sessionCallId?: string | null) => void;
}) {
  const fatalRef = useRef(onFatalError);
  fatalRef.current = onFatalError;
  const callIdRef = useRef(callId);
  callIdRef.current = callId;

  const onError = useCallback((error: Error) => {
    fatalRef.current(error, callIdRef.current);
  }, []);

  const onConnected = useCallback(() => {
    const store = useCallStore.getState();
    const grant = peekLiveKitGrant(store.token);
    console.info('[CONNECT]', {
      liveKitUrlPresent: Boolean(store.serverUrl),
      roomConnectStart: false,
      roomConnectSuccess: true,
      callId: store.callId,
      roomName: grant?.room || null,
      identity: grant?.identity || null,
    });
    logCallConnect('roomConnectSuccess', {
      callId: store.callId,
      roomName: grant?.room,
      identity: grant?.identity,
      liveKitUrlPresent: Boolean(store.serverUrl),
      tokenGenerated: Boolean(store.token),
      callStatus: store.status,
    });
  }, []);

  const onMediaDeviceFailure = useCallback((failure?: unknown, kind?: MediaDeviceKind) => {
    console.warn('[ERROR]', {
      name: 'MediaDeviceFailure',
      message: String(failure || ''),
      kind: kind || null,
      callId: useCallStore.getState().callId,
    });
  }, []);

  const onDisconnected = useCallback(() => {
    logCallTransition({ overlayMounted: true, roomState: 'disconnected', stage: 'livekit-disconnected' });
  }, []);

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={Boolean(token && serverUrl)}
      audio
      video={false}
      connectOptions={LIVEKIT_CONNECT_OPTIONS}
      className={className}
      style={style}
      onError={onError}
      onConnected={onConnected}
      onMediaDeviceFailure={onMediaDeviceFailure}
      onDisconnected={onDisconnected}
    >
      {children}
    </LiveKitRoom>
  );
}

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
            const info = describeLiveKitError(error);
            console.error('[ERROR]', { ...info, stage: 'reconnect' });
            console.error('LiveKit connection failed:', info.name, info.message);
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
    const store = useCallStore.getState();
    console.info('[CONNECT]', {
      liveKitUrlPresent: Boolean(store.serverUrl),
      roomConnectStart: true,
      roomConnectSuccess: room.state === 'connected',
      callId,
      roomName: room.name || null,
      roomState: room.state,
    });
    logCallConnect('roomConnectStart', {
      roomState: room.state,
      roomName: room.name,
      roomConnected: room.state === 'connected',
      overlayMounted: true,
      tokenGenerated: Boolean(store.token),
      liveKitUrlPresent: Boolean(store.serverUrl),
      callId: callId,
      callStatus: store.status,
      identity: useAuthStore.getState().profile?.firebaseUid || null,
    });
    const onConnected = () => {
      console.info('[LiveKit] room connected', { callId, roomName: room.name });
      logCallTransition({
        roomState: 'connected',
        roomName: room.name,
        roomConnected: true,
        overlayMounted: true,
        voiceCallMounted: !useCallStore.getState().video,
        videoCallMounted: Boolean(useCallStore.getState().video),
        stage: 'livekit-connected',
      });
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
  onOpenGifts,
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
  onOpenGifts?: () => void;
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
    <button
      type="button"
      className="lb-call-ctrl"
      onClick={() => (onOpenGifts ? onOpenGifts() : openCallGifts())}
      aria-label="Regalos"
    >
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
        {speakerBtn}
        <em>Audio</em>
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
  onExpand,
  onMinimize,
  onMaximize,
  onClose,
  onOpenGifts,
  minimized,
  maximized,
  suppressMini,
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
  onExpand?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  onOpenGifts?: () => void;
  minimized?: boolean;
  maximized?: boolean;
  suppressMini?: boolean;
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
  const stageRef = useRef<HTMLDivElement>(null);
  const pipRef = useRef<HTMLDivElement>(null);
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
  const pipReady = useRef(false);
  const nativePipSupported =
    typeof document !== 'undefined' && Boolean(document.pictureInPictureEnabled);

  function clampPipPos(x: number, y: number) {
    const stage = stageRef.current;
    const node = pipRef.current;
    if (!stage || !node) return { x, y };
    const pad = 8;
    const maxX = Math.max(pad, stage.clientWidth - node.offsetWidth - pad);
    const maxY = Math.max(pad, stage.clientHeight - node.offsetHeight - pad);
    return {
      x: Math.min(Math.max(x, pad), maxX),
      y: Math.min(Math.max(y, pad), maxY),
    };
  }

  function snapPipCorner(x: number, y: number) {
    const stage = stageRef.current;
    const node = pipRef.current;
    if (!stage || !node) return clampPipPos(x, y);
    const pad = 8;
    const maxX = Math.max(pad, stage.clientWidth - node.offsetWidth - pad);
    const maxY = Math.max(pad, stage.clientHeight - node.offsetHeight - pad);
    const corners = [
      { x: pad, y: pad },
      { x: maxX, y: pad },
      { x: pad, y: maxY },
      { x: maxX, y: maxY },
    ];
    let bestX = maxX;
    let bestY = pad;
    let bestD = Infinity;
    for (const corner of corners) {
      const d = (corner.x - x) ** 2 + (corner.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        bestX = corner.x;
        bestY = corner.y;
      }
    }
    return { x: bestX, y: bestY };
  }

  useLayoutEffect(() => {
    if (!video || minimized) return;
    const stage = stageRef.current;
    const node = pipRef.current;
    if (!stage || !node) return;
    setPip((prev) => {
      if (!pipReady.current) {
        pipReady.current = true;
        return {
          x: Math.max(8, stage.clientWidth - node.offsetWidth - 8),
          y: 8,
        };
      }
      return clampPipPos(prev.x, prev.y);
    });
  }, [video, minimized, maximized, remoteMain]);

  async function enterNativePip() {
    const videoEl = stageRef.current?.querySelector('video');
    if (!videoEl || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement === videoEl) {
        await document.exitPictureInPicture();
        return;
      }
      await videoEl.requestPictureInPicture();
    } catch {
      /* El navegador no permitió PiP; la ventana flotante sigue activa. */
    }
  }

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
          setError('Cámara no disponible');
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
      onOpenGifts={onOpenGifts}
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
    const roomLive = room.state === 'connected';
    const sessionLive = Boolean(connected && roomLive);
    const connecting = Boolean(connected) && !roomLive;
    const miniLabel = sessionLive
      ? lost
        ? 'Conexión perdida'
        : reconnecting
          ? 'Reconectando...'
          : `En llamada · ${formatCallClock(elapsed || 0)}`
      : reconnecting
        ? 'Reconectando...'
        : connecting
          ? 'Conectando llamada...'
          : 'Llamando...';
    return (
      <>
        <CallConnectionSync />
        <RoomAudioRenderer />
        <CallAudioUnlock />
        {minimized && !suppressMini ? (
          <VoiceCallMiniBar
            person={person}
            label={miniLabel}
            onExpand={() => onExpand?.()}
            onHangup={onHangup}
          />
        ) : null}
        <div className="lb-call-stage-keep" aria-hidden={minimized || undefined}>
          {sessionLive ? (
            <VoiceCallActive
              person={person}
              elapsedLabel={formatCallClock(elapsed || 0)}
              reconnecting={reconnecting}
              lost={lost}
              onHangup={onHangup}
              onFollowChat={() => onFollowChat?.()}
              onMinimize={onMinimize}
              onMaximize={onMaximize}
              onClose={onClose}
              maximized={maximized}
            />
          ) : (
            <VoiceCallOutgoing
              person={person}
              reconnecting={reconnecting}
              connecting={connecting}
              onCancel={onCancel || onHangup}
              onFollowChat={() => onFollowChat?.()}
              onMinimize={onMinimize}
              onMaximize={onMaximize}
              onClose={onClose}
              maximized={maximized}
            />
          )}
        </div>
      </>
    );
  }

  const videoMiniLabel =
    connected && room.state === 'connected'
      ? `En llamada · ${formatCallClock(elapsed || 0)}`
      : ringing
        ? 'Videollamando...'
        : 'Conectando...';

  return (
    <>
      <CallConnectionSync />
      <RoomAudioRenderer />
      <CallAudioUnlock />
      {minimized && !suppressMini ? (
        <VideoCallMiniBar
          person={{
            name: name || '',
            handle: handle || '',
            avatar: avatar || null,
            uid: peerUid,
          }}
          label={videoMiniLabel}
          onExpand={() => onExpand?.()}
          onHangup={onHangup}
        />
      ) : null}
      <div className="lb-call-stage-keep" aria-hidden={minimized || undefined}>
      <div className="lb-call-video-stage" data-call-drag ref={stageRef}>
        {connected && room.state === 'connected' ? (
          <div className="lb-video-hud" data-call-drag>
            <CallWinBar onMinimize={onMinimize} onMaximize={onMaximize} onClose={onClose} maximized={maximized} />
            <p>@{handle || 'usuario'}</p>
            <p>{formatCallClock(elapsed || 0)}</p>
            {onFollowChat ? (
              <button type="button" className="lb-video-chip" data-no-drag onClick={() => onFollowChat()}>
                <MessageCircle size={14} /> Seguir en el chat
              </button>
            ) : null}
            {nativePipSupported && remoteMain ? (
              <button type="button" className="lb-video-chip" data-no-drag onClick={() => void enterNativePip()}>
                <PictureInPicture2 size={14} /> PiP
              </button>
            ) : null}
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
              {connected && room.state === 'connected' ? (
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
                  onMinimize={onMinimize}
                  onMaximize={onMaximize}
                  onClose={onClose}
                  maximized={maximized}
                />
              ) : (
                <p>Conectando llamada...</p>
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
          ref={pipRef}
          className={`lb-call-video-local${camOn ? '' : ' is-off'}`}
          style={{ left: pip.x, top: pip.y }}
          onPointerDown={(event) => {
            event.stopPropagation();
            pipDrag.current = { x: event.clientX, y: event.clientY, ox: pip.x, oy: pip.y };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!pipDrag.current) return;
            setPip(
              clampPipPos(
                pipDrag.current.ox + event.clientX - pipDrag.current.x,
                pipDrag.current.oy + event.clientY - pipDrag.current.y,
              ),
            );
          }}
          onPointerUp={() => {
            if (pipDrag.current) {
              setPip((prev) => snapPipCorner(prev.x, prev.y));
            }
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
      </div>
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
  const prevStatusRef = useRef(status);
  const lastOwnedCallIdRef = useRef<string | null>(null);
  const recoveredRef = useRef(false);
  const [selfBusyCallId, setSelfBusyCallId] = useState<string | null>(null);
  const [heldIncoming, setHeldIncoming] = useState<IncomingCall | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [chrome, setChrome] = useState<CallChrome>(() => readCallChrome());
  const chromeRef = useRef(chrome);
  chromeRef.current = chrome;
  const lastExpandedRef = useRef<CallChrome>(chrome === 'minimized' || chrome === 'hidden' ? 'normal' : chrome);
  const livekitFatalRef = useRef(false);
  const chatSurface = useChatCallSurface();

  function setCallChrome(next: CallChrome) {
    if (next !== 'minimized' && next !== 'hidden') lastExpandedRef.current = next;
    chromeRef.current = next;
    setChrome(next);
    writeCallChrome(next);
  }

  function minimizeCall() {
    if (chromeRef.current !== 'minimized' && chromeRef.current !== 'hidden') {
      lastExpandedRef.current = chromeRef.current;
    }
    setCallChrome('minimized');
  }

  function restoreCall() {
    const last = lastExpandedRef.current;
    const next = last === 'minimized' || last === 'hidden' ? 'normal' : last;
    setCallChrome(next);
  }

  function toggleMaximize() {
    setCallChrome(chromeRef.current === 'maximized' ? 'normal' : 'maximized');
  }

  function hideCall() {
    if (chromeRef.current !== 'minimized' && chromeRef.current !== 'hidden') {
      lastExpandedRef.current = chromeRef.current;
    }
    setCallChrome('hidden');
  }

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
    if (status === 'idle') {
      clearFloatingCallPosition();
      clearCallChrome();
      chromeRef.current = 'normal';
      lastExpandedRef.current = 'normal';
      setChrome('normal');
    }
  }, [status]);

  useEffect(() => {
    setRingMuted(false);
    setPermError(null);
    if (incoming?.callId) {
      setCallChrome('normal');
    }
  }, [incoming?.callId]);

  useEffect(() => {
    const callChat = chatId || incoming?.chatId;
    const inHost = Boolean(chatSurface && callChat && chatSurface.chatId === callChat);
    if (!inHost) return;
    if (chrome !== 'normal' && chrome !== 'maximized') return;
    if (status !== 'ringing-out' && status !== 'active') return;
    setOverlayReady(true);
  }, [chatSurface, chatId, incoming?.chatId, chrome, status]);

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
    if (recovering && status === 'idle') return;
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
  }, [status, callId, chatId, incoming, peer, profile, recovering]);

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
    logCallTransition({ overlayMounted: true, stage: 'accept-start', roomState: null });
    const denied = await ensureCallMediaPermission(incoming.video);
    if (denied) {
      setPermError(denied);
      setAccepting(false);
      return;
    }
    try {
      const session = await requestCallToken(incoming.callId, incoming.chatId);
      await answerPrivateCall(incoming.chatId);
      setHeldIncoming(incoming);
      setOverlayReady(false);
      beginIncomingAccepted({
        chatId: incoming.chatId,
        callId: incoming.callId,
        peer: incoming.peer,
        video: incoming.video,
        token: session.token,
        serverUrl: session.serverUrl,
      });
      logCallTransition({ overlayMounted: true, stage: 'accept-token-ready', roomState: 'connecting' });
    } catch (error) {
      setPermError(formatCallApiError(error));
      logCallTransition({ overlayMounted: true, stage: 'accept-error', roomState: 'failed' });
    } finally {
      setAccepting(false);
    }
  }

  useEffect(() => {
    if (incoming) setHeldIncoming(incoming);
  }, [incoming]);

  useEffect(() => {
    if (status === 'idle') {
      setHeldIncoming(null);
      setOverlayReady(false);
      livekitFatalRef.current = false;
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'ringing-out' && status !== 'active') return;
    if (!token || !serverUrl || !peer) setOverlayReady(false);
  }, [status, token, serverUrl, peer]);

  useEffect(() => {
    logCallTransition({
      overlayMounted: status === 'ringing-in' || status === 'ringing-out' || status === 'active',
      roomState: token && serverUrl ? 'pending' : null,
      stage: 'store',
    });
  }, [status, token, serverUrl, callId, incoming?.callId, overlayReady]);

  useEffect(() => {
    const readySession = (status === 'ringing-out' || status === 'active') && Boolean(token && serverUrl && peer);
    if (!readySession || overlayReady) return;
    const timer = window.setTimeout(() => setOverlayReady(true), 1200);
    return () => window.clearTimeout(timer);
  }, [status, token, serverUrl, peer, overlayReady]);

  function returnToChat(peerHandle?: string | null) {
    const target = peerHandle?.replace(/^@/, '');
    navigate(target ? `/mensajes?con=${encodeURIComponent(target)}` : '/mensajes');
  }

  function failLiveKit(error: Error, sessionCallId?: string | null) {
    const store = useCallStore.getState();
    const info = describeLiveKitError(error);
    const kind = classifyCallConnectError(error);
    const grant = peekLiveKitGrant(store.token);
    const me = profile?.firebaseUid || null;
    const peerUid = store.peer?.uid || store.incoming?.peer.uid || null;
    const asCallee = store.status === 'ringing-in' || readCallSession()?.role === 'callee';
    const video = Boolean(store.video || store.incoming?.video);
    console.error('[ERROR]', {
      name: info.name,
      message: info.message,
      stack: info.stack,
      status: info.status,
      reason: info.reason,
      code: info.code,
      kind,
      callId: store.callId || store.incoming?.callId || null,
      sessionCallId: sessionCallId || null,
      roomName: grant?.room || null,
      callerId: asCallee ? peerUid : me,
      receiverId: asCallee ? me : peerUid,
      identity: grant?.identity || me,
      tokenGenerated: Boolean(store.token),
      liveKitUrlPresent: Boolean(store.serverUrl),
      callStatus: store.status,
    });
    console.error('LiveKit connection failed:', info.name, info.message, info.reason || '', info.status || '');
    if (sessionCallId && store.callId && sessionCallId !== store.callId) {
      console.warn('[CallConnect] error de sesión anterior, se ignora');
      return;
    }
    if (kind === 'permission' || kind === 'camera' || kind === 'media') {
      setConnectError(callConnectUserMessage(kind, video));
      window.setTimeout(() => setConnectError(null), 4000);
      return;
    }
    if (!shouldHangupOnLiveKitError(error)) {
      console.warn('[CallConnect] LiveKit error no fatal, se mantiene la llamada', info);
      return;
    }
    if (livekitFatalRef.current) return;
    livekitFatalRef.current = true;
    logCallConnect('roomConnectError', {
      callId: store.callId,
      roomName: grant?.room,
      identity: grant?.identity,
      liveKitUrlPresent: Boolean(store.serverUrl),
      callStatus: store.status,
      tokenGenerated: Boolean(store.token),
      ...info,
    });
    setConnectError(callConnectUserMessage('connection', video));
    const peerHandle = store.peer?.username || heldIncoming?.peer.username || incoming?.peer.username;
    void hangup(undefined, { error: `${info.name}: ${info.message}` }).then(() => {
      returnToChat(peerHandle);
      window.setTimeout(() => setConnectError(null), 4000);
    });
  }

  if (!profile) return null;

  const incomingPanel = incoming || heldIncoming;
  const showCall = Boolean(
    !livekitFatalRef.current && (status === 'ringing-out' || status === 'active') && token && serverUrl && peer,
  );
  const showIncoming = Boolean(
    (status === 'ringing-in' && incoming) ||
      (incomingPanel && (status === 'active' || status === 'ringing-out') && !overlayReady),
  );
  const showConnectingHint =
    !showIncoming && (status === 'ringing-out' || status === 'active') && (!showCall || !overlayReady);
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
  const hintUi =
    connectError ? (
      createPortal(<p className="lb-call-recover is-error">{connectError}</p>, document.body)
    ) : recovering && !showCall ? (
      createPortal(<p className="lb-call-recover">Reconectando llamada...</p>, document.body)
    ) : showConnectingHint ? (
      createPortal(<p className="lb-call-recover">Conectando llamada...</p>, document.body)
    ) : null;

  if (!showIncoming && !showCall) {
    return (
      <>
        {requestUi}
        {endedUi}
        {hintUi}
      </>
    );
  }

  const name = (showIncoming && incomingPanel ? incomingPanel.peer.displayName : peer?.displayName) || '';
  const handle = (showIncoming && incomingPanel ? incomingPanel.peer.username : peer?.username) || '';
  const avatar = (showIncoming && incomingPanel ? incomingPanel.peer.avatarUrl : peer?.avatarUrl) || null;
  const peerUid = showIncoming && incomingPanel ? incomingPanel.peer.uid : peer?.uid;
  const isVideo = showIncoming && incomingPanel ? Boolean(incomingPanel.video) : video;
  const person = { name, handle, avatar, uid: peerUid };
  const livekitStyle = isVideo
    ? { width: '100%', height: '100%', minHeight: 0, background: 'transparent' as const }
    : { width: 'fit-content' as const, height: 'auto' as const, minHeight: 0, background: 'transparent' as const };

  const incomingOnly = Boolean(showIncoming && incomingPanel && !showCall);
  const callChatKey = chatId || incomingPanel?.chatId || incoming?.chatId || null;
  const matchingDock =
    chatSurface && callChatKey && chatSurface.chatId === callChatKey ? chatSurface.dock : null;
  const compact = chrome === 'minimized' || (chrome === 'hidden' && !matchingDock);
  const maximized = chrome === 'maximized';
  const showHeaderDock = chrome === 'hidden' && Boolean(matchingDock);
  const incomingUi =
    incomingOnly ? (
      isVideo ? (
        <IncomingCallCard
          name={name}
          handle={handle}
          avatar={avatar}
          uid={peerUid}
          video={isVideo}
          accepting={accepting || (status === 'active' && !overlayReady)}
          error={permError}
          rateBlasts={incomingPanel?.rateBlasts}
          giftName={incomingPanel?.giftName}
          giftEmoji={incomingPanel?.giftEmoji}
          onAccept={() => void accept()}
          onDecline={() => hangupWithCooldown('declined')}
          onMinimize={minimizeCall}
          onMaximize={toggleMaximize}
          onClose={hideCall}
          maximized={maximized}
        />
      ) : (
        <VoiceCallIncoming
          person={person}
          accepting={accepting || (status === 'active' && !overlayReady)}
          error={permError}
          onAccept={() => void accept()}
          onDecline={() => hangupWithCooldown('declined')}
          onMinimize={minimizeCall}
          onMaximize={toggleMaximize}
          onClose={hideCall}
          maximized={maximized}
        />
      )
    ) : null;

  const incomingMini =
    incomingOnly && compact ? (
      isVideo ? (
        <VideoCallMiniBar
          person={person}
          label="Videollamada · Te está llamando..."
          onExpand={restoreCall}
          onHangup={() => hangupWithCooldown('declined')}
        />
      ) : (
        <VoiceCallMiniBar
          person={person}
          label="Llamada de voz · Te está llamando..."
          ringing
          onExpand={restoreCall}
          onHangup={() => hangupWithCooldown('declined')}
        />
      )
    ) : null;

  const headerDock = showHeaderDock ? (
    <CallHeaderDock
      name={name}
      handle={handle}
      avatar={avatar}
      uid={peerUid}
      video={isVideo}
      incoming={incomingOnly}
      accepting={accepting}
      statusLabel={
        incomingOnly
          ? isVideo
            ? 'Videollamada · Te está llamando...'
            : 'Llamada de voz · Te está llamando...'
          : status === 'active'
            ? `En llamada · ${formatCallClock(elapsed)}`
            : 'Llamando...'
      }
      onAccept={() => void accept()}
      onReject={() => hangupWithCooldown(incomingOnly ? 'declined' : undefined)}
      onRestore={restoreCall}
    />
  ) : null;

  const callStage = (
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
                hideCall();
                navigate(handle ? `/mensajes?con=${encodeURIComponent(handle)}` : '/mensajes');
              }}
              onExpand={restoreCall}
              onMinimize={minimizeCall}
              onMaximize={toggleMaximize}
              onClose={hideCall}
              minimized={compact || showHeaderDock}
              maximized={maximized}
              suppressMini={showHeaderDock}
              onOpenGifts={() => {
                try {
                  sessionStorage.setItem('lb_open_call_gifts', '1');
                } catch {
                  /* ignore */
                }
                minimizeCall();
                if (handle) {
                  const target = `/mensajes?con=${encodeURIComponent(handle)}`;
                  const here = `${location.pathname}${location.search}`;
                  if (!here.includes(`con=${encodeURIComponent(handle)}`)) {
                    navigate(target);
                  }
                }
                window.dispatchEvent(new CustomEvent('liveboom:open-chat-gifts'));
              }}
            />
  );

  const activeUi = !showCall ? null : isVideo ? (
    <div className={`lb-call-active${compact ? ' is-video-mini' : ''}`}>
      <div className="lb-call-lk is-video">
        <CallLiveKitBoundary key={`lk-bound-${callId || 'video'}`}>
          <PrivateCallLiveKitRoom
            callId={callId}
            token={token || ''}
            serverUrl={serverUrl || ''}
            className="lb-call-room"
            style={livekitStyle}
            onFatalError={failLiveKit}
          >
            <CallAutoReconnect serverUrl={serverUrl || ''} token={token || ''} />
            <CallReconnectBanner />
            {callStage}
            {status === 'active' ? <PaidCallMeter /> : null}
          </PrivateCallLiveKitRoom>
        </CallLiveKitBoundary>
      </div>
    </div>
  ) : (
    <CallLiveKitBoundary key={`lk-bound-${callId || 'voice'}`}>
      <PrivateCallLiveKitRoom
        callId={callId}
        token={token || ''}
        serverUrl={serverUrl || ''}
        className="lb-call-room--voice"
        style={livekitStyle}
        onFatalError={failLiveKit}
      >
        <CallAutoReconnect serverUrl={serverUrl || ''} token={token || ''} />
        {callStage}
        {status === 'active' ? <PaidCallMeter /> : null}
      </PrivateCallLiveKitRoom>
    </CallLiveKitBoundary>
  );

  const incomingFrame =
    incomingOnly && !showHeaderDock
      ? createPortal(
          <FloatingCallFrame video={isVideo} compact={compact} incoming maximized={maximized}>
            {compact ? incomingMini : incomingUi}
          </FloatingCallFrame>,
          document.body,
        )
      : null;

  const activeFrame = activeUi
    ? createPortal(
        <FloatingCallFrame
          video={isVideo}
          compact={compact || showHeaderDock}
          maximized={maximized && !showHeaderDock}
          parked={showHeaderDock}
          onReady={() => {
            setOverlayReady(true);
            logCallTransition({ overlayMounted: true, roomState: token ? 'connecting' : null, stage: 'overlay-ready' });
          }}
        >
          {activeUi}
        </FloatingCallFrame>,
        document.body,
      )
    : null;

  return (
    <>
      {requestUi}
      {endedUi}
      {hintUi}
      {headerDock && matchingDock ? createPortal(headerDock, matchingDock) : null}
      {incomingFrame}
      {activeFrame}
    </>
  );
}
