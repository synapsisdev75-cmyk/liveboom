import {
  RoomAudioRenderer,
  RoomContext,
  useMaybeRoomContext,
} from '@livekit/components-react';
import type { DeepAR } from 'deepar';
import { LocalAudioTrack, LocalVideoTrack, DisconnectReason, Room, RoomEvent, Track } from 'livekit-client';
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
import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ErrorInfo, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { CallRequestInbox } from './CallRequestInbox';
import { PaidCallMeter } from './PaidCallMeter';
import { startCallRing, stopCallRing, startOutgoingCallTone, stopOutgoingCallTone, playCallConnectedSound, playCallEndedSound } from '../../lib/alertSound';
import {
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
  releasePendingCallMicrophone,
  takePendingCallMicrophone,
} from '../../lib/callMedia';
import {
  applyCallFilter,
  type CallFilterId,
} from '../../lib/deepar';
import {
  answerPrivateCall,
  beatPresence,
  isLivePrivateCallStatus,
  listenChatCall,
  listenConversations,
  markInboxDelivered,
  peekPrivateCall,
  type PrivateCall,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import {
  connectedAtToMs,
  formatCallClock,
  useCallElapsed,
  useCallStore,
  type IncomingCall,
} from '../../store/callStore';
import { IncomingVideoCallCard } from './VideoCallRingCards';
import { ConnectedVideoCallBar, VideoCallShell } from './ConnectedVideoCallScreen';
import { PrivateCallRemoteVideo } from './PrivateCallRemoteVideo';
import { VideoCallSessionFrame, VoiceCallSessionFrame } from './CallSessionFrames';
import { CallHeaderDock } from './CallHeaderDock';
import {
  FloatingCallFrame,
  clearCallChrome,
  clearFloatingCallPosition,
} from './FloatingCallFrame';
import { VoiceCallActive, VoiceCallIncoming, VoiceCallMiniBar, VoiceCallOutgoing } from './VoiceCallPanels';
import { VideoCallEnded, VideoCallMiniBar, VideoCallOutgoing } from './VideoCallPanels';
import { useChatCallSurface } from '../../lib/chatCallSurface';
import { LIVEKIT_VOICE_STYLE } from './privateCallLayout';
import './privateCallContain.css';

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

function incomingFromCall(
  chatId: string,
  call: PrivateCall,
  conv?: { username?: string; displayName?: string; avatarUrl?: string | null },
): IncomingCall {
  return {
    chatId,
    callId: call.id,
    video: call.video,
    rateBlasts: call.rateSnapshot?.rateBlasts || 0,
    giftName: call.rateSnapshot?.giftName || null,
    giftEmoji: call.rateSnapshot?.giftEmoji || null,
    peer: {
      uid: call.fromUid,
      username: call.fromHandle || conv?.username || '',
      displayName: call.fromName || conv?.displayName || '',
      avatarUrl: call.fromAvatar || conv?.avatarUrl || null,
    },
  };
}

function callCreatedAtMs(call: PrivateCall): number {
  const ms = Number(call.createdAtMs);
  if (Number.isFinite(ms) && ms > 0) return ms;
  const parsed = Date.parse(call.createdAt);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
}

const LIVEKIT_CONNECT_OPTIONS = {
  autoSubscribe: true,
  maxRetries: 5,
  peerConnectionTimeout: 30_000,
};

const PRIVATE_CALL_ROOM_OPTIONS = {
  adaptiveStream: false,
  dynacast: true,
  webAudioMix: false,
  audioCaptureDefaults: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

class CallOverlayErrorBoundary extends Component<
  {
    children: ReactNode;
    compact?: boolean;
    onReset?: () => void;
    onCatch?: () => void;
    fallback?: ReactNode;
  },
  { error: string | null }
> {
  state = { error: null as string | null };
  private retries = 0;
  private retryTimer = 0;

  static getDerivedStateFromError(error: Error) {
    return { error: error.message || 'Error en la videollamada' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[CALL] overlay crash', error.message, info.componentStack);
    this.props.onCatch?.();
    if (this.retries >= 2) return;
    this.retries += 1;
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => {
      this.setState({ error: null });
      this.props.onReset?.();
    }, 200);
  }

  componentWillUnmount() {
    window.clearTimeout(this.retryTimer);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return null;
    }
    return this.props.children;
  }
}

function callLocalParticipant(room: ReturnType<typeof useMaybeRoomContext>) {
  return room?.localParticipant ?? null;
}

function roomHasRemoteMedia(room: ReturnType<typeof useMaybeRoomContext>) {
  if (!room || room.state !== 'connected') return false;
  try {
    for (const participant of room.remoteParticipants.values()) {
      for (const pub of participant.audioTrackPublications.values()) {
        if (pub.track) return true;
      }
      for (const pub of participant.videoTrackPublications.values()) {
        if (pub.track) return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function callSessionIsLive(connected: boolean | undefined, room: ReturnType<typeof useMaybeRoomContext>) {
  return Boolean(connected) || roomHasRemoteMedia(room);
}

function useRemoteCallMedia() {
  const room = useMaybeRoomContext();
  const [live, setLive] = useState(() => roomHasRemoteMedia(room));
  useEffect(() => {
    if (!room) {
      setLive(false);
      return;
    }
    const sync = () => setLive(roomHasRemoteMedia(room));
    sync();
    room.on(RoomEvent.TrackSubscribed, sync);
    room.on(RoomEvent.TrackUnsubscribed, sync);
    room.on(RoomEvent.Connected, sync);
    room.on(RoomEvent.ParticipantConnected, sync);
    return () => {
      room.off(RoomEvent.TrackSubscribed, sync);
      room.off(RoomEvent.TrackUnsubscribed, sync);
      room.off(RoomEvent.Connected, sync);
      room.off(RoomEvent.ParticipantConnected, sync);
    };
  }, [room]);
  return live;
}

function SafeCallRemoteAudio() {
  const room = useMaybeRoomContext();
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!room || !host) return;
    const liveRoom = room;
    const liveHost = host;
    const nodes = new Map<string, HTMLAudioElement>();

    function attachEl(
      el: HTMLAudioElement,
      track: { attach: (node: HTMLAudioElement) => unknown; mediaStreamTrack?: MediaStreamTrack },
    ) {
      el.autoplay = true;
      el.muted = false;
      el.volume = 1;
      el.setAttribute('playsinline', 'true');
      try {
        track.attach(el);
      } catch (error) {
        console.warn('[CALL] remote audio attach', error);
      }
      if (!el.srcObject && track.mediaStreamTrack) {
        el.srcObject = new MediaStream([track.mediaStreamTrack]);
      }
      el.muted = false;
      el.volume = 1;
      void el.play().catch((error) => console.warn('[CALL] remote audio play', error));
    }

    function sync() {
      try {
        void liveRoom.startAudio().catch(() => undefined);
        const seen = new Set<string>();
        for (const participant of liveRoom.remoteParticipants.values()) {
          for (const pub of participant.audioTrackPublications.values()) {
            if (!pub.isSubscribed) {
              try {
                pub.setSubscribed(true);
              } catch {
                /* ignore */
              }
            }
            const track = pub.track;
            const id = String(pub.trackSid || pub.trackName || participant.identity);
            if (!track || !id) continue;
            seen.add(id);
            let el = nodes.get(id);
            if (!el) {
              el = document.createElement('audio');
              liveHost.appendChild(el);
              nodes.set(id, el);
            }
            attachEl(el, track);
          }
        }
        for (const [id, el] of nodes) {
          if (seen.has(id)) continue;
          el.remove();
          nodes.delete(id);
        }
      } catch (error) {
        console.warn('[CALL] remote audio', error);
      }
    }

    sync();
    liveRoom.on(RoomEvent.TrackSubscribed, sync);
    liveRoom.on(RoomEvent.TrackUnsubscribed, sync);
    liveRoom.on(RoomEvent.TrackMuted, sync);
    liveRoom.on(RoomEvent.TrackUnmuted, sync);
    liveRoom.on(RoomEvent.ParticipantConnected, sync);
    liveRoom.on(RoomEvent.ParticipantDisconnected, sync);
    liveRoom.on(RoomEvent.Connected, sync);
    liveRoom.on(RoomEvent.AudioPlaybackStatusChanged, sync);
    return () => {
      liveRoom.off(RoomEvent.TrackSubscribed, sync);
      liveRoom.off(RoomEvent.TrackUnsubscribed, sync);
      liveRoom.off(RoomEvent.TrackMuted, sync);
      liveRoom.off(RoomEvent.TrackUnmuted, sync);
      liveRoom.off(RoomEvent.ParticipantConnected, sync);
      liveRoom.off(RoomEvent.ParticipantDisconnected, sync);
      liveRoom.off(RoomEvent.Connected, sync);
      liveRoom.off(RoomEvent.AudioPlaybackStatusChanged, sync);
      nodes.forEach((el) => el.remove());
      nodes.clear();
    };
  }, [room]);

  if (!room) return null;
  return <div ref={hostRef} className="lb-call-remote-audio" aria-hidden />;
}

/** Sala LiveKit propia (igual que LIVE): existe desde el primer render y ambos entran al mismo room. */
function PrivateCallLiveKitRoom({
  callId,
  token,
  serverUrl,
  className,
  style,
  children,
  onFatalError,
  onRoomConnected,
  publishCamera,
}: {
  callId: string | null;
  token: string;
  serverUrl: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  onFatalError: (error: Error, sessionCallId?: string | null) => void;
  onRoomConnected?: () => void;
  publishCamera?: boolean;
}) {
  const fatalRef = useRef(onFatalError);
  fatalRef.current = onFatalError;
  const callIdRef = useRef(callId);
  callIdRef.current = callId;
  const onRoomConnectedRef = useRef(onRoomConnected);
  onRoomConnectedRef.current = onRoomConnected;
  const publishCameraRef = useRef(publishCamera);
  publishCameraRef.current = publishCamera;
  const room = useMemo(() => new Room(PRIVATE_CALL_ROOM_OPTIONS), [callId]);

  useEffect(() => {
    return () => {
      void room.disconnect();
    };
  }, [room]);

  useEffect(() => {
    if (!token || !serverUrl) return;
    let cancelled = false;
    let unlockCleanup: (() => void) | undefined;
    const grant = peekLiveKitGrant(token);
    const store = useCallStore.getState();
    console.info('[VIDEO CALL] room container connect', {
      callId: callIdRef.current,
      roomName: grant?.room || null,
      identity: grant?.identity || store.peer?.uid || null,
      liveKitUrlPresent: Boolean(serverUrl),
    });
    logCallConnect('roomConnectStart', {
      callId: callIdRef.current,
      roomName: grant?.room,
      identity: grant?.identity,
      liveKitUrlPresent: Boolean(serverUrl),
      tokenGenerated: true,
      callStatus: store.status,
    });

    const onDisconnected = () => {
      if (cancelled) return;
      logCallTransition({ overlayMounted: true, roomState: 'disconnected', stage: 'livekit-disconnected' });
    };
    const onMediaFail = (error: Error) => {
      console.warn('[ERROR]', {
        name: 'MediaDeviceFailure',
        message: error?.message || String(error || ''),
        callId: callIdRef.current,
      });
    };
    const onConnected = () => {
      if (cancelled) return;
      const live = useCallStore.getState();
      const liveGrant = peekLiveKitGrant(live.token);
      console.info('[CONNECT]', {
        liveKitUrlPresent: Boolean(live.serverUrl),
        roomConnectStart: false,
        roomConnectSuccess: true,
        callId: live.callId,
        roomName: liveGrant?.room || room.name || null,
        identity: liveGrant?.identity || null,
      });
      logCallConnect('roomConnectSuccess', {
        callId: live.callId,
        roomName: liveGrant?.room || room.name,
        identity: liveGrant?.identity,
        liveKitUrlPresent: Boolean(live.serverUrl),
        tokenGenerated: Boolean(live.token),
        callStatus: live.status,
      });
      onRoomConnectedRef.current?.();
    };

    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.MediaDevicesError, onMediaFail);
    room.on(RoomEvent.Connected, onConnected);

    async function join() {
      try {
        if (room.state === 'disconnected') {
          await room.connect(serverUrl, token, LIVEKIT_CONNECT_OPTIONS);
        }
        if (cancelled) return;
        await enableRoomMicrophone(room);
        await room.startAudio().catch((error) => {
          console.warn('[CALL] startAudio', error);
        });
        const unlockAudio = () => {
          void room.startAudio().catch(() => undefined);
        };
        window.addEventListener('pointerdown', unlockAudio);
        window.addEventListener('click', unlockAudio);
        unlockCleanup = () => {
          window.removeEventListener('pointerdown', unlockAudio);
          window.removeEventListener('click', unlockAudio);
        };
        if (cancelled) return;
        if (publishCameraRef.current) {
          await enableRoomCamera(room);
        }
        if (cancelled) return;
        if (room.state === 'connected') onConnected();
      } catch (error) {
        if (!cancelled) fatalRef.current(error as Error, callIdRef.current);
      }
    }

    void join();
    return () => {
      cancelled = true;
      unlockCleanup?.();
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.MediaDevicesError, onMediaFail);
      room.off(RoomEvent.Connected, onConnected);
    };
  }, [room, token, serverUrl]);

  useEffect(() => {
    if (!publishCamera || room.state !== 'connected') return;
    void enableRoomCamera(room);
  }, [publishCamera, room]);

  return (
    <RoomContext.Provider value={room}>
      <div className={['lk-room-container', className].filter(Boolean).join(' ')} style={style}>
        {children}
      </div>
    </RoomContext.Provider>
  );
}

/** Capa de video dentro de la sala: si el stage se cae, la sala y esta capa siguen. */
function PrivateCallVideoSession({
  children,
  fallback,
  epoch,
  onReset,
}: {
  children: ReactNode;
  fallback: ReactNode;
  epoch: number;
  onReset: () => void;
}) {
  return (
    <div className="lb-private-call-video-session">
      <CallOverlayErrorBoundary onReset={onReset} fallback={fallback}>
        <div key={epoch} className="lb-private-call-video-stage">
          {children}
        </div>
      </CallOverlayErrorBoundary>
    </div>
  );
}

function CallReconnectBanner() {
  const room = useMaybeRoomContext();
  const recovering = useCallStore((state) => state.recovering);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!room) return;
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
  const room = useMaybeRoomContext();

  useEffect(() => {
    if (!room) return;
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
  const room = useMaybeRoomContext();
  const [link, setLink] = useState<'ok' | 'reconnecting' | 'lost'>('ok');

  useEffect(() => {
    if (!room) return;
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
  const room = useMaybeRoomContext();
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!room) return;
    const sync = () => setBlocked(!room.canPlaybackAudio);
    sync();
    const onChange = () => sync();
    room.on(RoomEvent.AudioPlaybackStatusChanged, onChange);
    void room.startAudio().then(sync).catch(() => setBlocked(true));
    return () => {
      room.off(RoomEvent.AudioPlaybackStatusChanged, onChange);
    };
  }, [room]);

  if (!room || !blocked) return null;
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

function CallConnectionSync({ onReady }: { onReady?: () => void }) {
  const room = useMaybeRoomContext();
  const markActive = useCallStore((state) => state.markActive);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (!room) return;
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
      const videoCall = Boolean(useCallStore.getState().video);
      if (videoCall) console.info('[VIDEO CALL] connected', { callId, roomName: room.name, status: useCallStore.getState().status });
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
      onReadyRef.current?.();
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
      if (track.kind === 'video') {
        console.info('[LiveKit] remote video subscribed', { callId });
        if (useCallStore.getState().video) console.info('[VIDEO CALL] remote track subscribed');
      }
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

function firstAudioMediaTrack(room: ReturnType<typeof useMaybeRoomContext>) {
  if (!room) return null;
  try {
    for (const pub of room.localParticipant?.audioTrackPublications.values() ?? []) {
      const media = pub.track?.mediaStreamTrack;
      if (media && media.readyState === 'live') return media;
    }
    for (const participant of room.remoteParticipants.values()) {
      for (const pub of participant.audioTrackPublications.values()) {
        const media = pub.track?.mediaStreamTrack;
        if (media && media.readyState === 'live') return media;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function CallVoiceWaveform({ active }: { active: boolean }) {
  const room = useMaybeRoomContext();
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

    if (!room) {
      tick();
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
      };
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

function applySpeakerOutput(room: ReturnType<typeof useMaybeRoomContext>, speakerOn: boolean) {
  const volume = speakerOn ? 1 : 0;
  try {
    for (const participant of room?.remoteParticipants?.values() ?? []) {
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

async function trySpeakerSink(room: ReturnType<typeof useMaybeRoomContext>) {
  if (!room) return;
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

function pickLocalCameraTrack(room: ReturnType<typeof useMaybeRoomContext>) {
  try {
    for (const pub of room?.localParticipant?.videoTrackPublications.values() ?? []) {
      if (pub.source === Track.Source.Camera && pub.track?.mediaStreamTrack) {
        return pub.track as LocalVideoTrack;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function pickLocalMicTrack(room: ReturnType<typeof useMaybeRoomContext>) {
  try {
    for (const pub of room?.localParticipant?.audioTrackPublications.values() ?? []) {
      if (pub.source === Track.Source.Microphone && pub.track?.mediaStreamTrack) {
        return pub.track;
      }
    }
  } catch {
    return null;
  }
  return null;
}

const micEnableInflight = new WeakMap<Room, Promise<boolean>>();

async function enableRoomMicrophone(room: Room) {
  const local = room.localParticipant;
  if (!local) return false;
  if (pickLocalMicTrack(room)) {
    console.info('[CALL] mic already in room');
    releasePendingCallMicrophone();
    return true;
  }
  const pending = micEnableInflight.get(room);
  if (pending) return pending;
  const run = (async () => {
    try {
      const pending = takePendingCallMicrophone();
      if (pending && pending.readyState === 'live') {
        try {
          const localTrack = new LocalAudioTrack(pending, undefined, false);
          await local.publishTrack(localTrack, {
            source: Track.Source.Microphone,
            name: 'microphone',
          });
        } catch (error) {
          console.warn('[CALL] mic publish pending failed', error);
          try {
            pending.stop();
          } catch {
            /* ignore */
          }
          await local.setMicrophoneEnabled(true);
        }
      } else {
        pending?.stop();
        await local.setMicrophoneEnabled(true);
      }
      for (let i = 0; i < 40; i += 1) {
        if (pickLocalMicTrack(room)) {
          console.info('[CALL] mic published into room');
          return true;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
      console.warn('[CALL] mic publish failed', 'no track after setMicrophoneEnabled');
      return false;
    } catch (error) {
      console.warn('[CALL] mic publish failed', error);
      return false;
    } finally {
      micEnableInflight.delete(room);
    }
  })();
  micEnableInflight.set(room, run);
  return run;
}

const cameraEnableInflight = new WeakMap<Room, Promise<boolean>>();

async function enableRoomCamera(room: Room) {
  const local = room.localParticipant;
  if (!local) return false;
  if (pickLocalCameraTrack(room)) {
    console.info('[VIDEO CALL] camera already in room');
    return true;
  }
  const pending = cameraEnableInflight.get(room);
  if (pending) return pending;
  const run = (async () => {
    try {
      await local.setCameraEnabled(true);
      for (let i = 0; i < 40; i += 1) {
        if (pickLocalCameraTrack(room)) {
          console.info('[VIDEO CALL] camera published into room');
          return true;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
      console.warn('[VIDEO CALL] camera publish failed', 'no track after setCameraEnabled');
      return false;
    } catch (error) {
      console.warn('[VIDEO CALL] camera publish failed', error);
      return false;
    } finally {
      cameraEnableInflight.delete(room);
    }
  })();
  cameraEnableInflight.set(room, run);
  return run;
}

/** Une el track de cámara de la sala al <video> local (PIP), en PC y móvil. */
function useCallLocalPreview(videoRef: RefObject<HTMLVideoElement | null>, active: boolean) {
  const room = useMaybeRoomContext();
  useEffect(() => {
    if (!active || !room) return;
    const liveRoom = room;
    let cancelled = false;
    let timer = 0;

    function attach() {
      if (cancelled) return;
      const el = videoRef.current;
      if (!el) {
        timer = window.setTimeout(attach, 50);
        return;
      }
      try {
        const track = pickLocalCameraTrack(liveRoom);
        const media = track?.mediaStreamTrack;
        if (!media) return;
        let mirror = true;
        try {
          mirror = media.getSettings().facingMode !== 'environment';
        } catch {
          mirror = true;
        }
        bindLocalVideoEl(el, media, mirror);
      } catch (error) {
        console.warn('[VIDEO CALL] local preview attach', error);
      }
    }

    attach();
    liveRoom.on(RoomEvent.Connected, attach);
    liveRoom.on(RoomEvent.LocalTrackPublished, attach);
    liveRoom.on(RoomEvent.LocalTrackUnpublished, attach);
    liveRoom.on(RoomEvent.TrackMuted, attach);
    liveRoom.on(RoomEvent.TrackUnmuted, attach);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      liveRoom.off(RoomEvent.Connected, attach);
      liveRoom.off(RoomEvent.LocalTrackPublished, attach);
      liveRoom.off(RoomEvent.LocalTrackUnpublished, attach);
      liveRoom.off(RoomEvent.TrackMuted, attach);
      liveRoom.off(RoomEvent.TrackUnmuted, attach);
    };
  }, [room, active, videoRef]);
}

function bindLocalVideoEl(el: HTMLVideoElement | null, track: MediaStreamTrack | null, mirror: boolean) {
  if (!el) {
    console.warn('[VIDEO CALL] localVideoRef.current is null');
    return;
  }
  el.muted = true;
  el.playsInline = true;
  el.setAttribute('playsinline', 'true');
  el.setAttribute('webkit-playsinline', 'true');
  el.autoplay = true;
  el.style.transform = mirror ? 'scaleX(-1)' : '';
  if (!track) {
    el.srcObject = null;
    return;
  }
  const stream = new MediaStream([track]);
  el.srcObject = stream;
  console.info('[VIDEO CALL] local srcObject assigned', {
    videoTracks: stream.getVideoTracks().length,
    readyState: track.readyState,
    enabled: track.enabled,
    muted: track.muted,
  });
  void el.play().then(
    () => console.info('[VIDEO CALL] local track attached', { readyState: track.readyState, enabled: track.enabled, muted: track.muted }),
    (error) => console.warn('[VIDEO CALL] local play() failed', error),
  );
}

function ConnectingVideoCallStage({
  name,
  handle,
  avatar,
  peerUid,
  onHangup,
  onMinimize,
  onMaximize,
  onClose,
  maximized,
  elapsedLabel = '00:00',
  statusLabel = 'Conectando videollamada...',
}: {
  name?: string;
  handle?: string;
  avatar?: string | null;
  peerUid?: string;
  onHangup: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  maximized?: boolean;
  elapsedLabel?: string;
  statusLabel?: string;
}) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const remoteLive = useRemoteCallMedia();
  const mediaLive = statusLabel === 'Videollamada en curso' || remoteLive;
  useCallLocalPreview(localVideoRef, true);

  useEffect(() => {
    console.info('[VIDEO CALL] connecting stage mounted', {
      local: Boolean(localVideoRef.current),
    });
  }, []);

  return (
    <div className="lb-call-stage-keep is-connected">
      <VideoCallShell
        person={{
          name: name || '',
          handle: handle || '',
          avatar: avatar || null,
          uid: peerUid,
        }}
        elapsedLabel={elapsedLabel}
        statusLabel={mediaLive ? 'Videollamada en curso' : statusLabel}
        onMinimize={onMinimize}
        onMaximize={onMaximize}
        onClose={onClose}
        maximized={maximized}
        stageRef={stageRef}
        stage={
          <>
            <PrivateCallRemoteVideo
              name={name}
              handle={handle}
              avatar={avatar}
              peerUid={peerUid}
              waitingLabel={mediaLive ? 'Videollamada en curso' : 'Conectando videollamada...'}
            />
            {mediaLive ? null : (
              <p className="lb-video-shell-wait__overlay">Conectando videollamada...</p>
            )}
            <div className="lb-call-video-local" style={{ left: 'auto', right: '0.5rem', top: '0.5rem' }}>
              <video
                ref={localVideoRef}
                className="h-full w-full bg-black object-contain"
                autoPlay
                muted
                playsInline
              />
            </div>
          </>
        }
        footer={<ConnectedVideoCallBar camOn onToggleCam={() => undefined} onHangup={onHangup} />}
      />
    </div>
  );
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

export function CallInCallBar({
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
  const room = useMaybeRoomContext();
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
      const local = callLocalParticipant(room);
      if (!local) return;
      await local.setMicrophoneEnabled(next);
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

function VoiceCallStage({
  connected,
  elapsed,
  name,
  handle,
  avatar,
  peerUid,
  onHangup,
  onFollowChat,
  onExpand,
  onMinimize,
  onMaximize,
  onClose,
  minimized,
  maximized,
  suppressMini,
}: {
  connected?: boolean;
  elapsed?: number;
  name?: string;
  handle?: string;
  avatar?: string | null;
  peerUid?: string;
  onHangup: () => void;
  onFollowChat?: () => void;
  onExpand?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  minimized?: boolean;
  maximized?: boolean;
  suppressMini?: boolean;
}) {
  const room = useMaybeRoomContext();
  const link = useCallLinkState();
  const person = {
    name: name || '',
    handle: handle || '',
    avatar: avatar || null,
    uid: peerUid,
  };
  const reconnecting = link === 'reconnecting';
  const lost = link === 'lost';
  const roomLive = room?.state === 'connected';
  const sessionLive = Boolean(connected && roomLive);
  const connecting = Boolean(connected) && !roomLive && !roomHasRemoteMedia(room);
  const miniLabel = sessionLive || roomHasRemoteMedia(room)
    ? lost
      ? 'Conexión perdida'
      : reconnecting
        ? 'Reconectando...'
        : `En llamada · ${formatCallClock(elapsed || 0)}`
    : reconnecting
      ? 'Reconectando...'
      : connected
        ? `En llamada · ${formatCallClock(elapsed || 0)}`
        : connecting
          ? 'Conectando llamada...'
          : 'Llamando...';

  return (
    <>
      <CallConnectionSync />
      {callLocalParticipant(room) ? <RoomAudioRenderer /> : null}
      <CallAudioUnlock />
      {minimized && !suppressMini ? (
        <VoiceCallMiniBar
          person={person}
          label={miniLabel}
          onExpand={() => onExpand?.()}
          onHangup={onHangup}
        />
      ) : null}
      {connected ? (
        <div className="lb-call-stage-keep is-connected" aria-hidden={minimized || undefined}>
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
        </div>
      ) : null}
    </>
  );
}

function VideoCallStage({
  ringing,
  connected,
  elapsed,
  name,
  handle,
  avatar,
  peerUid,
  onHangup,
  onExpand,
  onMinimize,
  onMaximize,
  onClose,
  onOpenChat,
  onLivekitReady,
  minimized,
  maximized,
  suppressMini,
  mediaActive,
}: {
  ringing?: boolean;
  connected?: boolean;
  elapsed?: number;
  name?: string;
  handle?: string;
  avatar?: string | null;
  peerUid?: string;
  onHangup: () => void;
  onCancel?: () => void;
  onExpand?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  onOpenChat?: () => void;
  onLivekitReady?: () => void;
  minimized?: boolean;
  maximized?: boolean;
  suppressMini?: boolean;
  mediaActive?: boolean;
}) {
  const room = useMaybeRoomContext();
  const roomRef = useRef(room);
  roomRef.current = room;
  const remoteLive = useRemoteCallMedia();
  const inCall = callSessionIsLive(connected, room) || remoteLive;

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pipRef = useRef<HTMLDivElement>(null);
  useCallLocalPreview(localVideoRef, Boolean(mediaActive));
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
    if (minimized) return;
    try {
      const stage = stageRef.current;
      const node = pipRef.current;
      if (!stage || !node) return;
      setPip((prev) => {
        if (!pipReady.current) {
          pipReady.current = true;
          return {
            x: Math.max(8, stage.clientWidth - node.offsetWidth - 8),
            y: Math.max(8, stage.clientHeight - node.offsetHeight - 8),
          };
        }
        return clampPipPos(prev.x, prev.y);
      });
    } catch (error) {
      console.warn('[VIDEO CALL] pip layout', error);
    }
  }, [minimized, maximized]);

  useEffect(() => {
    console.info('[VIDEO CALL] component mounted');
    return () => console.info('[VIDEO CALL] component unmounted');
  }, []);

  useEffect(() => {
    if (!mediaActive) return;
    let cancelled = false;

    async function refreshDevices() {
      const list = await listCallMediaDevices();
      if (cancelled) return;
      setVideoInputs(list.video);
      setAudioInputs(list.audio);
    }

    async function boot() {
      let videoEl = localVideoRef.current;
      for (let i = 0; i < 40 && !videoEl; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 50));
        if (cancelled) return;
        videoEl = localVideoRef.current;
      }
      if (!videoEl) {
        console.warn('[VIDEO CALL] localVideoRef.current is null');
        if (!cancelled) setError('Cámara no disponible');
        return;
      }
      let liveRoom = roomRef.current;
      for (let i = 0; i < 80 && !liveRoom; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 50));
        if (cancelled) return;
        liveRoom = roomRef.current;
      }
      if (!liveRoom) {
        if (!cancelled) setError('Conectando sala de video...');
        return;
      }
      setError(null);
      setReady(false);
      setArEnabled(false);
      try {
        if (liveRoom.state !== 'connected') {
          const joined = await new Promise<boolean>((resolve) => {
            const finish = (ok: boolean) => {
              window.clearTimeout(timer);
              liveRoom.off(RoomEvent.Connected, onConnected);
              resolve(ok);
            };
            const timer = window.setTimeout(() => finish(false), 15_000);
            const onConnected = () => finish(true);
            liveRoom.on(RoomEvent.Connected, onConnected);
            if (liveRoom.state === 'connected') finish(true);
          });
          if (!joined) {
            if (!cancelled) setError('No se pudo conectar la sala de video.');
            return;
          }
        }
        if (cancelled) return;
        const existing = pickLocalCameraTrack(liveRoom);
        if (existing?.mediaStreamTrack) {
          bindLocalVideoEl(videoEl, existing.mediaStreamTrack, facing === 'user');
          publishedRef.current = existing;
          setReady(true);
          setError(null);
          void refreshDevices();
          return;
        }
        const published = await enableRoomCamera(liveRoom);
        if (cancelled) return;
        const track = pickLocalCameraTrack(liveRoom);
        const media = track?.mediaStreamTrack;
        if (published && media && track) {
          bindLocalVideoEl(videoEl, media, facing === 'user');
          publishedRef.current = track;
          setActiveVideoId(media.getSettings().deviceId || cameraDeviceId);
          setReady(true);
          setError(null);
          void refreshDevices();
          return;
        }
        if (!cancelled) setError('Cámara no disponible');
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError(callMediaDeniedMessage(err, true) || 'Cámara no disponible');
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
    // Cámara solo al colgar / salir de mediaActive. No parar tracks si cambia room o se minimiza.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaActive]);

  useEffect(() => {
    if (!mediaActive || !ready) return;
    const videoEl = localVideoRef.current;
    if (videoEl) void videoEl.play().catch(() => undefined);
  }, [mediaActive, ready]);

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
    if (!room) return;
    const getter = (room as { getActiveDevice?: (kind: MediaDeviceKind) => string }).getActiveDevice;
    if (typeof getter === 'function') {
      const id = getter('audioinput');
      if (id) setActiveAudioId(id);
    }
  }, [room]);

  function toggleCam() {
    const pub = publishedRef.current;
    if (pub) {
      if (camOn) void pub.mute();
      else void pub.unmute();
      setCamOn((value) => !value);
      return;
    }
    void callLocalParticipant(room)?.setCameraEnabled(!camOn).then(() => setCamOn((value) => !value));
  }

  async function flipCamera() {
    const nextFacing = facing === 'user' ? 'environment' : 'user';
    const opposite = videoInputs.find((device) => {
      const inferred = inferCallCameraFacing(device.label || '');
      return inferred === nextFacing;
    });
    const fallback = videoInputs.find((device) => device.deviceId !== (activeVideoId || cameraDeviceId));
    const target = opposite || fallback;
    if (!target) {
      setFacing(nextFacing);
      setCamHint(nextFacing === 'user' ? 'Cámara frontal' : 'Cámara trasera');
      return;
    }
    try {
      await applyCameraDevice(target.deviceId, nextFacing);
      setCamHint(nextFacing === 'user' ? 'Cámara frontal' : 'Cámara trasera');
    } catch (err) {
      setFacing(nextFacing);
      setError(callMediaDeniedMessage(err, true));
    }
  }

  async function applyCameraDevice(deviceId: string, nextFacing: 'user' | 'environment') {
    const videoEl = localVideoRef.current;
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
        await callLocalParticipant(room)?.unpublishTrack(old).catch(() => undefined);
        old.stop();
        publishedRef.current = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      const mediaTrack = stream.getVideoTracks()[0];
      if (!mediaTrack) throw new Error('Sin cámara');
      bindLocalVideoEl(videoEl, mediaTrack, nextFacing === 'user');
      const localTrack = new LocalVideoTrack(mediaTrack, undefined, false);
      publishedRef.current = localTrack;
      const publisher = callLocalParticipant(room);
      if (!publisher) throw new Error('Sala de video no lista');
      await publisher.publishTrack(localTrack, {
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
      if (media) bindLocalVideoEl(videoEl, media, nextFacing === 'user');
    }

    const activeId = publishedRef.current?.mediaStreamTrack.getSettings().deviceId || deviceId;
    setFacing(nextFacing);
    setCameraDeviceId(deviceId);
    setActiveVideoId(activeId);
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
    if (!room) return;
    try {
      await room.switchActiveDevice('audioinput', deviceId);
      setActiveAudioId(deviceId);
      setPicker(null);
      setError(null);
    } catch (err) {
      setError(callMediaDeniedMessage(err, false));
    }
  }

  const videoMiniLabel =
    inCall
      ? `En llamada · ${formatCallClock(elapsed || 0)}`
      : ringing
        ? 'Videollamando...'
        : 'Conectando...';

  return (
    <>
      <CallConnectionSync onReady={onLivekitReady} />
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
      <div
        className={`lb-call-stage-keep is-connected${minimized ? ' is-minimized-hold' : ''}`}
        aria-hidden={minimized || undefined}
      >
      <VideoCallShell
        person={{
          name: name || '',
          handle: handle || '',
          avatar: avatar || null,
          uid: peerUid,
        }}
        elapsedLabel={formatCallClock(elapsed || 0)}
        statusLabel={inCall ? 'Videollamada en curso' : 'Conectando videollamada...'}
        onMinimize={onMinimize}
        onMaximize={onMaximize}
        onClose={onClose}
        maximized={maximized}
        stageRef={stageRef}
        stage={
          <>
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
        <PrivateCallRemoteVideo
          name={name}
          handle={handle}
          avatar={avatar}
          peerUid={peerUid}
          waitingLabel={error || (inCall ? 'Videollamada en curso' : camOn ? 'Conectando videollamada...' : 'Cámara apagada')}
        />
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
          <video
            ref={localVideoRef}
            className="h-full w-full bg-black object-contain"
            autoPlay
            muted
            playsInline
          />
          {error ? (
            <p className="pointer-events-none absolute inset-0 grid place-items-center px-2 text-center text-[11px] text-rose-300">
              {error}
            </p>
          ) : null}
          {!camOn ? (
            <p className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] text-zinc-400">
              Cámara apagada
          </p>
        ) : null}
          {connected ? (
            <span className="lb-video-connected-you" aria-hidden>
              Tú
            </span>
          ) : null}
        </div>
          </>
        }
        footer={
        <ConnectedVideoCallBar
          camOn={camOn}
          onToggleCam={toggleCam}
          onFlipCamera={() => void flipCamera()}
          onHangup={onHangup}
          onOpenChat={onOpenChat}
        />
        }
      />
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
  const [heldIncoming, setHeldIncoming] = useState<IncomingCall | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [callViewMode, setCallViewModeState] = useState<'expanded' | 'minimized'>('expanded');
  const callViewModeRef = useRef(callViewMode);
  callViewModeRef.current = callViewMode;
  const [uiPhase, setUiPhaseState] = useState<'ringing' | 'connecting' | 'connected'>('ringing');
  const uiPhaseRef = useRef(uiPhase);
  uiPhaseRef.current = uiPhase;
  const [livekitReady, setLivekitReadyState] = useState(false);
  const livekitReadyRef = useRef(false);
  const [livekitEpoch, setLivekitEpoch] = useState(0);
  const [stageEpoch, setStageEpoch] = useState(0);
  const [fillHost, setFillHost] = useState(false);
  const chromeStatusRef = useRef(status);
  const livekitFatalRef = useRef(false);
  const outgoingStartedRef = useRef<string | null>(null);
  const chatSurface = useChatCallSurface();

  function setCallViewMode(next: 'expanded' | 'minimized', reason: string) {
    callViewModeRef.current = next;
    setCallViewModeState(next);
    console.info('[CALL UI]', next === 'minimized' ? 'view -> MINIMIZED' : 'view -> EXPANDED', reason);
  }

  function setUiPhase(next: 'ringing' | 'connecting' | 'connected', reason: string) {
    if (uiPhaseRef.current === next) return;
    uiPhaseRef.current = next;
    setUiPhaseState(next);
    console.info(
      '[CALL UI]',
      next === 'ringing' ? 'status -> RINGING' : next === 'connecting' ? 'status -> CONNECTING' : 'status -> CONNECTED',
      reason,
    );
  }

  function setLivekitReady(next: boolean, reason: string) {
    if (livekitReadyRef.current === next) return;
    livekitReadyRef.current = next;
    setLivekitReadyState(next);
    console.info('[VIDEO CALL]', next ? 'livekit ready' : 'livekit reset', reason);
  }

  function minimizeCall() {
    setCallViewMode('minimized', 'user-minimize');
  }

  function restoreCall() {
    setFillHost(false);
    setCallViewMode('expanded', 'user-maximize');
  }

  function toggleMaximize() {
    if (callViewModeRef.current === 'minimized') restoreCall();
    else setFillHost((open) => !open);
  }

  function hideCall() {
    setCallViewMode('minimized', 'user-close');
  }

  function handleLiveKitConnected() {
    setLivekitReady(true, 'room-connected');
    if (useCallStore.getState().status === 'active') {
      setUiPhase('connected', 'livekit');
    }
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
    const prev = chromeStatusRef.current;
    chromeStatusRef.current = status;
    if (status === 'idle') {
      clearFloatingCallPosition();
      clearCallChrome();
      setFillHost(false);
      setCallViewMode('expanded', 'status-idle');
      setUiPhase('ringing', 'status-idle');
      setLivekitReady(false, 'status-idle');
      return;
    }
    if (status === 'ringing-in' && uiPhaseRef.current !== 'connecting' && uiPhaseRef.current !== 'connected') {
      console.info('[VIDEO CALL] incoming ringing');
      setUiPhase('ringing', 'status-ringing-in');
    } else if (status === 'ringing-out' && uiPhaseRef.current !== 'connected') {
      console.info('[VIDEO CALL] outgoing ringing');
      setUiPhase('ringing', 'status-ringing-out');
    }
    if (prev !== 'active' && status === 'active') {
      console.info('[CALL UI] store -> active (view unchanged)', callViewModeRef.current);
      if (useCallStore.getState().video && !livekitReadyRef.current) {
        console.info('[VIDEO CALL] connecting');
        setUiPhase('connecting', 'store-active-wait-livekit');
      } else {
        setUiPhase('connected', 'store-active');
      }
    }
  }, [status, incoming, heldIncoming]);

  useEffect(() => {
    setRingMuted(false);
    setPermError(null);
    if (incoming?.callId) {
      setFillHost(false);
      setCallViewMode('expanded', 'incoming-id');
      if (uiPhaseRef.current !== 'connecting' && uiPhaseRef.current !== 'connected') {
        setUiPhase('ringing', 'incoming-id');
      }
    }
  }, [incoming?.callId]);

  useEffect(() => {
    if (status === 'idle') outgoingStartedRef.current = null;
    if (status !== 'ringing-out' || !callId) return;
    if (outgoingStartedRef.current === callId) return;
    outgoingStartedRef.current = callId;
    setFillHost(false);
    setCallViewMode('expanded', 'outgoing-id');
    if (uiPhaseRef.current !== 'connected') setUiPhase('ringing', 'outgoing-id');
  }, [status, callId]);

  useEffect(() => {
    const callChat = chatId || incoming?.chatId;
    const inHost = Boolean(chatSurface && callChat && chatSurface.chatId === callChat);
    if (!inHost) return;
    if (callViewMode === 'minimized') return;
    if (status !== 'ringing-out' && status !== 'active') return;
    setOverlayReady(true);
  }, [chatSurface, chatId, incoming?.chatId, callViewMode, status]);

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
    const me = profile.firebaseUid;
    let hangupTimer = 0;

    function offerIncoming(
      chatId: string,
      call: PrivateCall,
      conv?: { username?: string; displayName?: string; avatarUrl?: string | null },
    ) {
      const store = useCallStore.getState();
      if (store.status === 'active' || store.status === 'ringing-out') return false;
      if (!call || call.status !== 'ringing') return false;
      if (call.fromUid === me) return false;
      if (call.toUid && call.toUid !== me) {
        console.info('[CALL] incoming skip', { reason: 'not-for-me', chatId, callId: call.id, toUid: call.toUid });
        return false;
      }
      if (Date.now() - (cooldownRef.current[chatId] || 0) < 1200) {
        console.info('[CALL] incoming skip', { reason: 'cooldown', chatId, callId: call.id });
        return false;
      }
      const age = Date.now() - callCreatedAtMs(call);
      if (Number.isFinite(age) && age > 90_000) {
        console.info('[CALL] incoming skip', { reason: 'stale', chatId, callId: call.id, age });
        return false;
      }
      if (store.status === 'ringing-in' && store.incoming?.callId === call.id && store.incoming.chatId === chatId) {
        return true;
      }
      console.info('[CALL] incoming offer', {
        callId: call.id,
        chatId,
        fromUid: call.fromUid,
        video: call.video,
      });
      setIncoming(incomingFromCall(chatId, call, conv));
      return true;
    }

    function pickIncomingFromList(
      list: { chatId: string; call: PrivateCall | null; username?: string; displayName?: string; avatarUrl?: string | null }[],
    ) {
      const store = useCallStore.getState();
      if (store.status === 'active' || store.status === 'ringing-out') return;

      const ringing = list
        .filter((item) => item.call?.status === 'ringing' && item.call.fromUid !== me)
        .sort((a, b) => callCreatedAtMs(b.call as PrivateCall) - callCreatedAtMs(a.call as PrivateCall));

      for (const item of ringing) {
        if (item.call && offerIncoming(item.chatId, item.call, item)) return;
      }

      if (store.status === 'ringing-in' && store.incoming) {
        const current = list.find((item) => item.chatId === store.incoming?.chatId);
        if (!current) return;
        if (!current.call || current.call.status !== 'ringing' || current.call.fromUid === me) {
          console.info('[CALL] incoming skip', { reason: 'cleared', chatId: store.incoming.chatId });
          setIncoming(null);
        }
      }
    }

    const unsub = listenConversations(me, (list) => {
      pickIncomingFromList(list);

      const store = useCallStore.getState();
      if (!store.chatId) return;
      if (store.status !== 'ringing-out' && store.status !== 'active') return;
      const mine = list.find((item) => item.chatId === store.chatId);
      if (mine?.call?.status === 'active' && (store.status === 'ringing-out' || store.status === 'active')) {
        window.clearTimeout(hangupTimer);
        markActive(connectedAtToMs(mine.call.connectedAt));
      }
      if (mine && mine.call == null && (store.status === 'ringing-out' || store.status === 'active')) {
        const acceptedAgo = store.activeStartedAt ? Date.now() - store.activeStartedAt : 0;
        if (store.status === 'active' && acceptedAgo < 12_000) {
          window.clearTimeout(hangupTimer);
          return;
        }
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
    });
    return () => {
      window.clearTimeout(hangupTimer);
      unsub();
    };
  }, [profile?.firebaseUid, hangup, markActive, setIncoming]);

  useEffect(() => {
    if (!profile) return;
    const openId = chatSurface?.chatId;
    if (!openId) return;
    const me = profile.firebaseUid;
    return listenChatCall(openId, (call) => {
      const store = useCallStore.getState();
      if (store.status === 'active' || store.status === 'ringing-out') return;
      if (call?.status === 'ringing' && call.fromUid !== me) {
        if (call.toUid && call.toUid !== me) return;
        if (Date.now() - (cooldownRef.current[openId] || 0) < 1200) return;
        const age = Date.now() - callCreatedAtMs(call);
        if (Number.isFinite(age) && age > 90_000) return;
        if (store.incoming?.callId === call.id && store.incoming.chatId === openId) return;
        console.info('[CALL] incoming offer', {
          callId: call.id,
          chatId: openId,
          fromUid: call.fromUid,
          source: 'open-chat',
          video: call.video,
        });
        setIncoming(incomingFromCall(openId, call));
        return;
      }
      if (store.status === 'ringing-in' && store.incoming?.chatId === openId) {
        if (!call || call.status !== 'ringing' || call.fromUid === me) {
          console.info('[CALL] incoming skip', { reason: 'open-chat-cleared', chatId: openId });
          setIncoming(null);
        }
      }
    });
  }, [profile?.firebaseUid, chatSurface?.chatId, setIncoming]);

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
      console.info('[VIDEO CALL] accept clicked');
      console.info('[CALL UI] accept clicked');
      setUiPhase('connecting', 'accept');
      setFillHost(false);
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
      releasePendingCallMicrophone();
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
      setLivekitReady(false, 'idle-cleanup');
      return;
    }
    if (status === 'active') {
      setHeldIncoming(null);
      if (livekitReadyRef.current) setUiPhase('connected', 'active-livekit');
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'ringing-out' && status !== 'active') return;
    if (!token || !serverUrl || !peer) setOverlayReady(false);
  }, [status, token, serverUrl, peer]);

  useEffect(() => {
    const store = useCallStore.getState();
    if (!store.video && !store.incoming?.video && !heldIncoming?.video) return;
    console.info('[VIDEO CALL STATE]', {
      callId: store.callId || store.incoming?.callId || heldIncoming?.callId || null,
      type: 'video',
      direction: store.incoming || (status === 'ringing-in' || heldIncoming) ? 'incoming' : store.status === 'ringing-out' ? 'outgoing' : store.status,
      status: store.status,
      callViewMode,
      incoming: !!store.incoming,
      outgoing: store.status === 'ringing-out',
      roomState: livekitReady ? 'connected' : store.token ? 'pending' : null,
      uiPhase,
    });
  }, [status, uiPhase, callViewMode, incoming, heldIncoming, callId, livekitReady, token]);

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
  const isVideo = Boolean(video || incomingPanel?.video);
  const placingOutgoing = status === 'ringing-out' && Boolean(peer);
  const showCall = Boolean(
    !livekitFatalRef.current && (status === 'ringing-out' || status === 'active') && token && serverUrl && peer,
  );
  const incomingConnecting = uiPhase === 'connecting' || accepting;
  const videoConnectingUi = Boolean(
    isVideo && incomingConnecting && (status === 'ringing-in' || Boolean(heldIncoming)) && !showCall,
  );
  const videoSessionActive = Boolean(isVideo && (status === 'active' || videoConnectingUi));
  const calleeChrome = Boolean(status === 'ringing-in' && incomingPanel && !incomingConnecting);
  const showIncoming = Boolean(calleeChrome || (status === 'ringing-in' && incoming));
  const showConnectingHint =
    uiPhase === 'connecting' &&
    status !== 'active' &&
    !livekitReady &&
    !calleeChrome &&
    !showCall &&
    !placingOutgoing &&
    !videoConnectingUi;
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

  if (!showIncoming && !showCall && !placingOutgoing && !videoConnectingUi) {
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
  const person = { name, handle, avatar, uid: peerUid };
  const incomingChrome = calleeChrome;
  const callChatKey = chatId || incomingPanel?.chatId || incoming?.chatId || null;
  const matchingDock =
    chatSurface && callChatKey && chatSurface.chatId === callChatKey ? chatSurface.dock : null;
  const viewMinimized = callViewMode === 'minimized';
  const matchingHost = Boolean(chatSurface && callChatKey && chatSurface.chatId === callChatKey);
  const compact = viewMinimized && !matchingDock;
  const maximized = !viewMinimized && fillHost && matchingHost;
  const showHeaderDock = viewMinimized && Boolean(matchingDock);
  const callerSession = (status === 'ringing-out' || status === 'active') && !incoming && !heldIncoming;
  const showIncomingCard = incomingChrome && !viewMinimized;
  const showOutgoingCard = Boolean(
    !viewMinimized && status === 'ringing-out' && (callerSession || placingOutgoing),
  );
  const incomingMiniVisible = incomingChrome && compact;
  const holdLiveKit = Boolean(
    showCall && (showIncomingCard || showOutgoingCard || showHeaderDock || incomingMiniVisible),
  );
  const livekitStyle = isVideo
    ? { width: '100%', height: 'auto' as const, minHeight: 0, background: 'transparent' }
    : LIVEKIT_VOICE_STYLE;
  const expandedSlot = !viewMinimized && (showIncomingCard || showOutgoingCard || showCall || videoConnectingUi);
  const incomingUi =
    incomingChrome && !compact ? (
      isVideo ? (
        <IncomingVideoCallCard
          person={person}
          accepting={accepting}
          connecting={incomingConnecting}
          error={permError}
          paidLabel={
            incomingPanel?.rateBlasts
              ? `${incomingPanel.giftEmoji || '🎁'} ${incomingPanel.giftName || 'Regalo'} · ${incomingPanel.rateBlasts} Blasts / minuto`
              : null
          }
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
          accepting={accepting}
          connecting={incomingConnecting}
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

  const outgoingUi = showOutgoingCard ? (
    isVideo ? (
      <VideoCallOutgoing
        person={person}
        connecting={uiPhase === 'connecting' && status === 'active'}
        elapsedLabel={formatCallClock(elapsed)}
        onCancel={() => hangupWithCooldown('cancelled')}
        onMinimize={minimizeCall}
        onMaximize={toggleMaximize}
        onClose={hideCall}
        maximized={maximized}
      />
    ) : (
      <VoiceCallOutgoing
        person={person}
        standalone
        connecting={status === 'ringing-out'}
        elapsedLabel={formatCallClock(elapsed)}
        onCancel={() => hangupWithCooldown('cancelled')}
        onFollowChat={() => {
          restoreCall();
          navigate(handle ? `/mensajes?con=${encodeURIComponent(handle)}` : '/mensajes');
        }}
        onMinimize={minimizeCall}
        onMaximize={toggleMaximize}
        onClose={hideCall}
        maximized={maximized}
      />
    )
  ) : null;

  const incomingMini =
    incomingChrome && compact ? (
      isVideo ? (
        <VideoCallMiniBar
          person={person}
          label={incomingConnecting ? 'Conectando...' : 'Videollamada · Te está llamando...'}
          onExpand={restoreCall}
          onHangup={() => hangupWithCooldown('declined')}
        />
      ) : (
        <VoiceCallMiniBar
          person={person}
          label={incomingConnecting ? 'Conectando...' : 'Llamada de voz · Te está llamando...'}
          ringing={!incomingConnecting}
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
      incoming={incomingChrome}
      accepting={accepting}
      clock={formatCallClock(elapsed)}
      statusLabel={
        incomingChrome
          ? incomingConnecting
            ? 'Conectando...'
            : isVideo
              ? 'Videollamada · Te está llamando...'
              : 'Llamada de voz · Te está llamando...'
          : status === 'active'
            ? `Llamada activa · ${formatCallClock(elapsed)}`
            : 'Llamando...'
      }
      onAccept={() => void accept()}
      onReject={() => hangupWithCooldown(incomingChrome ? 'declined' : undefined)}
      onRestore={restoreCall}
    />
  ) : null;

  const keepConnectingShell = Boolean(isVideo && !viewMinimized && videoConnectingUi);

  function renderConnectingStage() {
    return (
      <ConnectingVideoCallStage
        name={name}
        handle={handle}
        avatar={avatar}
        peerUid={peerUid}
        onHangup={() => hangupWithCooldown(incomingChrome ? 'declined' : undefined)}
        onMinimize={minimizeCall}
        onMaximize={toggleMaximize}
        onClose={hideCall}
        maximized={maximized}
        elapsedLabel={formatCallClock(elapsed)}
        statusLabel={status === 'active' ? 'Videollamada en curso' : 'Conectando videollamada...'}
      />
    );
  }

  const connectingLive = keepConnectingShell ? (
    <div className="lb-video-connecting-cover">{renderConnectingStage()}</div>
  ) : null;

  const callStage = isVideo ? (
            <VideoCallStage
              ringing={status === 'ringing-out'}
              connected={videoSessionActive}
              elapsed={elapsed}
              name={name}
              handle={handle}
              avatar={avatar}
              peerUid={peerUid}
              onHangup={() => hangupWithCooldown()}
              onCancel={() => hangupWithCooldown('cancelled')}
              onExpand={restoreCall}
              onMinimize={minimizeCall}
              onMaximize={toggleMaximize}
              onClose={hideCall}
              onLivekitReady={() => setLivekitReady(true, 'stage-ready')}
              minimized={viewMinimized}
              maximized={maximized}
              suppressMini={showHeaderDock}
              mediaActive={status === 'active'}
              onOpenChat={() => {
                minimizeCall();
                if (handle) {
                  const target = `/mensajes?con=${encodeURIComponent(handle)}`;
                  const here = `${location.pathname}${location.search}`;
                  if (!here.includes(`con=${encodeURIComponent(handle)}`)) {
                    navigate(target);
                  }
                }
              }}
            />
  ) : (
            <VoiceCallStage
              connected={status === 'active'}
              elapsed={elapsed}
              name={name}
              handle={handle}
              avatar={avatar}
              peerUid={peerUid}
              onHangup={() => hangupWithCooldown()}
              onFollowChat={() => {
                restoreCall();
                navigate(handle ? `/mensajes?con=${encodeURIComponent(handle)}` : '/mensajes');
              }}
              onExpand={restoreCall}
              onMinimize={minimizeCall}
              onMaximize={toggleMaximize}
              onClose={hideCall}
              minimized={viewMinimized}
              maximized={maximized}
              suppressMini={showHeaderDock}
            />
  );

  const videoLiveUi = !showCall || !isVideo ? null : (
    <div className="lb-video-lk">
      <PrivateCallLiveKitRoom
        key={livekitEpoch}
        callId={callId}
        token={token || ''}
        serverUrl={serverUrl || ''}
        className="lb-call-room"
        style={livekitStyle}
        onFatalError={failLiveKit}
        onRoomConnected={handleLiveKitConnected}
        publishCamera={status === 'active'}
      >
        <CallAutoReconnect serverUrl={serverUrl || ''} token={token || ''} />
        <CallReconnectBanner />
        <SafeCallRemoteAudio />
        <CallAudioUnlock />
        <PrivateCallVideoSession
          epoch={stageEpoch}
          onReset={() => setStageEpoch((n) => n + 1)}
          fallback={renderConnectingStage()}
        >
          {callStage}
        </PrivateCallVideoSession>
        {status === 'active' ? (
          <CallOverlayErrorBoundary fallback={null}>
            <PaidCallMeter />
          </CallOverlayErrorBoundary>
        ) : null}
      </PrivateCallLiveKitRoom>
    </div>
  );

  const voiceLiveUi = !showCall || isVideo ? null : (
    <CallOverlayErrorBoundary onReset={() => setLivekitEpoch((n) => n + 1)} fallback={<p className="lb-call-banner">Llamada en curso</p>}>
    <div className="lb-voice-lk">
      <PrivateCallLiveKitRoom
        key={livekitEpoch}
        callId={callId}
        token={token || ''}
        serverUrl={serverUrl || ''}
        className="lb-call-room--voice"
        style={livekitStyle}
        onFatalError={failLiveKit}
        onRoomConnected={handleLiveKitConnected}
      >
        <CallAutoReconnect serverUrl={serverUrl || ''} token={token || ''} />
        {callStage}
        {status === 'active' ? <PaidCallMeter /> : null}
      </PrivateCallLiveKitRoom>
    </div>
    </CallOverlayErrorBoundary>
  );

  const ringingChrome =
    showIncomingCard || outgoingUi ? (
      <div className={isVideo ? 'lb-video-chrome-face lb-call-chrome-face' : 'lb-voice-chrome-face lb-call-chrome-face'}>
        {showIncomingCard ? incomingUi : null}
        {outgoingUi}
      </div>
    ) : null;

  const callFrame =
    showIncoming || showCall || placingOutgoing || videoConnectingUi
      ? createPortal(
          <FloatingCallFrame
            video={isVideo}
            compact={compact}
            incoming={showIncomingCard}
            maximized={maximized}
            parked={showHeaderDock}
            onReady={() => {
              if (!showCall) return;
              setOverlayReady(true);
              logCallTransition({ overlayMounted: true, roomState: token ? 'connecting' : null, stage: 'overlay-ready' });
            }}
          >
            <div className={expandedSlot ? 'lb-call-expanded-slot' : undefined}>
              {isVideo ? (
                (showCall || videoConnectingUi) && !viewMinimized ? (
                  <VideoCallSessionFrame
                    connected={videoSessionActive}
                    hold={false}
                    chrome={ringingChrome}
                    live={
                      <div className="lb-video-live-stack">
                        {videoLiveUi ? (
                          <div className={keepConnectingShell ? 'lb-video-lk-layer is-behind' : 'lb-video-lk-layer'}>
                            {videoLiveUi}
                          </div>
                        ) : null}
                        {connectingLive}
                      </div>
                    }
                  />
                ) : (
                  <>
                    {ringingChrome}
                    {incomingMini}
                    {videoLiveUi ? (
                      <div className={holdLiveKit ? 'lb-call-livekit-hold' : 'lb-video-live-slot'} aria-hidden={holdLiveKit || undefined}>
                        {videoLiveUi}
                      </div>
                    ) : null}
                  </>
                )
              ) : showCall && !viewMinimized ? (
                <VoiceCallSessionFrame
                  connected={status === 'active'}
                  hold={holdLiveKit}
                  chrome={ringingChrome}
                  live={voiceLiveUi}
                />
              ) : (
                <>
                  {ringingChrome}
                  {incomingMini}
                  {voiceLiveUi ? (
                    <div className={holdLiveKit ? 'lb-call-livekit-hold' : 'lb-voice-live-slot'} aria-hidden={holdLiveKit || undefined}>
                      {voiceLiveUi}
                    </div>
                  ) : null}
                </>
          )}
        </div>
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
      {callFrame}
    </>
  );
}
