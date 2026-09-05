import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useRoomContext,
  useTracks,
  type TrackReference,
} from '@livekit/components-react';
import type { DeepAR } from 'deepar';
import { LocalVideoTrack, RoomEvent, Track } from 'livekit-client';
import {
  Camera,
  Gift,
  Lock,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  PhoneOff,
  Smile,
  Sticker,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { startCallRing, stopCallRing } from '../../lib/alertSound';
import { formatCallApiError, requestCallToken } from '../../lib/liveKitCallService';
import { canShareScreen, ensureCallMediaPermission } from '../../lib/callMedia';
import {
  applyCallFilter,
  CALL_FILTERS,
  createCallDeepAR,
  downloadDataUrl,
  type CallFilterId,
} from '../../lib/deepar';
import {
  answerPrivateCall,
  beatPresence,
  listenConversations,
  markInboxDelivered,
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
import { BRAND_LOGO_SRC } from '../../lib/brand';

function CallReconnectBanner() {
  const room = useRoomContext();
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const onRe = () => setText('Reconectando...');
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
  if (!text) return null;
  return <p className="lb-call-banner">{text}</p>;
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

function CallVoiceWaveform({ active }: { active: boolean }) {
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

function useCoarseCallLayout() {
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

function CallInCallBar({
  video,
  camOn,
  onToggleCam,
  onFlipCamera,
  onMore,
  moreOpen,
  onHangup,
  voiceUi,
}: {
  video: boolean;
  camOn: boolean;
  onToggleCam?: () => void;
  onFlipCamera?: () => void;
  onMore?: () => void;
  moreOpen?: boolean;
  onHangup: () => void;
  voiceUi?: boolean;
}) {
  const room = useRoomContext();
  const [micOn, setMicOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const shareOk = canShareScreen();

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

  const micBtn = (
    <button
      type="button"
      className={`lb-call-ctrl${micOn ? ' is-on' : ' is-muted'}`}
      onClick={() => void toggleMic()}
      aria-label={micOn ? 'Silenciar micrófono' : 'Activar micrófono'}
      aria-pressed={micOn}
    >
      {micOn ? <Mic size={18} /> : <MicOff size={18} />}
    </button>
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
            <button
              type="button"
              className="lb-call-ctrl"
              onClick={() => window.dispatchEvent(new CustomEvent('liveboom:open-chat-gifts'))}
              aria-label="Regalos"
            >
              <Gift size={18} />
            </button>
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
    <div className="lb-call-controls">
      {video ? (
        <button
          type="button"
          className={`lb-call-ctrl${camOn ? ' is-on' : ''}`}
          onClick={onToggleCam}
          aria-label="Cámara"
        >
          {camOn ? <Video size={18} /> : <VideoOff size={18} />}
        </button>
      ) : null}
      <button
        type="button"
        className={`lb-call-ctrl${micOn ? ' is-on' : ' is-muted'}`}
        onClick={() => void toggleMic()}
        aria-label="Micrófono"
      >
        {micOn ? <Mic size={18} /> : <MicOff size={18} />}
      </button>
      <button
        type="button"
        className={`lb-call-ctrl${speakerOn ? ' is-on' : ''}`}
        onClick={() => setSpeakerOn((value) => !value)}
        aria-label="Altavoz"
      >
        {speakerOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>
      {shareOk ? (
        <button
          type="button"
          className={`lb-call-ctrl${sharing ? ' is-on' : ''}`}
          onClick={() => {
            const next = !sharing;
            void room.localParticipant.setScreenShareEnabled(next).then(
              () => setSharing(next),
              () => setSharing(false),
            );
          }}
          aria-label="Compartir pantalla"
        >
          <MonitorUp size={18} />
        </button>
      ) : null}
      {video && onFlipCamera ? (
        <button type="button" className="lb-call-ctrl" onClick={onFlipCamera} aria-label="Cambiar cámara">
          <SwitchCamera size={18} />
        </button>
      ) : null}
      {video ? (
        <button
          type="button"
          className="lb-call-ctrl"
          onClick={() => window.dispatchEvent(new CustomEvent('liveboom:peek-chat'))}
          aria-label="Chat"
        >
          <MessageCircle size={18} />
        </button>
      ) : null}
      {video ? (
        <button
          type="button"
          className="lb-call-ctrl"
          onClick={() => window.dispatchEvent(new CustomEvent('liveboom:open-chat-gif'))}
          aria-label="GIF"
        >
          <span className="text-[9px] font-black">GIF</span>
        </button>
      ) : null}
      {video ? (
        <button
          type="button"
          className="lb-call-ctrl"
          onClick={() => window.dispatchEvent(new CustomEvent('liveboom:open-chat-stickers'))}
          aria-label="Stickers"
        >
          <Sticker size={18} />
        </button>
      ) : null}
      {video ? (
        <button
          type="button"
          className="lb-call-ctrl"
          onClick={() => window.dispatchEvent(new CustomEvent('liveboom:peek-chat'))}
          aria-label="Emojis"
        >
          <Smile size={18} />
        </button>
      ) : null}
      {video && onMore ? (
        <button
          type="button"
          className={`lb-call-ctrl${moreOpen ? ' is-on' : ''}`}
          onClick={onMore}
          aria-label="Más"
        >
          <MoreHorizontal size={18} />
        </button>
      ) : null}
      <button
        type="button"
        className="lb-call-ctrl"
        onClick={() => window.dispatchEvent(new CustomEvent('liveboom:open-chat-gifts'))}
        aria-label="Regalos"
      >
        <Gift size={18} />
      </button>
      <button type="button" className="lb-call-ctrl lb-call-ctrl--end" onClick={onHangup} aria-label="Finalizar">
        <PhoneOff size={18} />
      </button>
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
}) {
  const room = useRoomContext();
  const mobile = useCoarseCallLayout();
  const link = useCallLinkState();
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }]);
  const remoteCameras = tracks.filter(
    (track): track is TrackReference =>
      Boolean(track.publication) && !track.participant.isLocal,
  );

  const previewRef = useRef<HTMLDivElement>(null);
  const deepArRef = useRef<DeepAR | null>(null);
  const publishedRef = useRef<LocalVideoTrack | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [filterId, setFilterId] = useState<CallFilterId>('none');
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [ready, setReady] = useState(false);
  const [arEnabled, setArEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapPreview, setSnapPreview] = useState<string | null>(null);
  const [busySnap, setBusySnap] = useState(false);
  const [camOn, setCamOn] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pip, setPip] = useState({ x: 0, y: 0 });
  const pipDrag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    if (!video) return;
    let cancelled = false;

    async function publishPlainCamera(host: HTMLElement) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 720 },
          height: { ideal: 1280 },
        },
        audio: false,
      });
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      host.innerHTML = '';
      const videoEl = document.createElement('video');
      videoEl.srcObject = stream;
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.autoplay = true;
      videoEl.className = 'h-full w-full object-cover';
      if (facing === 'user') videoEl.style.transform = 'scaleX(-1)';
      host.appendChild(videoEl);
      await videoEl.play().catch(() => undefined);

      const mediaTrack = stream.getVideoTracks()[0];
      if (!mediaTrack) throw new Error('Sin cámara');
      const localTrack = new LocalVideoTrack(mediaTrack, undefined, false);
      publishedRef.current = localTrack;
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
              video: {
                facingMode: facing,
                width: { ideal: 720 },
                height: { ideal: 1280 },
              },
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
    // Reinicio solo al cambiar cámara frontal/trasera; el filtro se aplica en otro effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, room, facing]);

  useEffect(() => {
    const instance = deepArRef.current;
    if (!instance || !ready || !arEnabled) return;
    void applyCallFilter(instance, filterId).catch((err) => console.error(err));
  }, [filterId, ready, arEnabled]);

  async function takeInstantPhoto() {
    const instance = deepArRef.current;
    if (busySnap) return;
    setBusySnap(true);
    try {
      let dataUrl: string | null = null;
      if (instance && arEnabled) {
        dataUrl = await instance.takeScreenshot();
      } else {
        const videoEl = previewRef.current?.querySelector('video');
        if (videoEl && videoEl.videoWidth > 0) {
          const canvas = document.createElement('canvas');
          canvas.width = videoEl.videoWidth;
          canvas.height = videoEl.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            if (facing === 'user') {
              ctx.translate(canvas.width, 0);
              ctx.scale(-1, 1);
            }
            ctx.drawImage(videoEl, 0, 0);
            dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          }
        }
      }
      if (!dataUrl) throw new Error('Sin foto');
      setSnapPreview(dataUrl);
      downloadDataUrl(dataUrl, `liveboom-${Date.now()}.png`);
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File([blob], `liveboom-${Date.now()}.png`, { type: 'image/png' });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Liveboom' });
          }
        } catch {
          /* usuario canceló share */
        }
      }
    } catch (err) {
      console.error(err);
      setError('No se pudo tomar la foto.');
    } finally {
      setBusySnap(false);
    }
  }

  function toggleCam() {
    const pub = publishedRef.current;
    if (!pub) return;
    if (camOn) void pub.mute();
    else void pub.unmute();
    setCamOn((value) => !value);
  }

  const controls = (
    <CallInCallBar
      video={video}
      camOn={camOn}
      onToggleCam={video ? toggleCam : undefined}
      onFlipCamera={
        video ? () => setFacing((prev) => (prev === 'user' ? 'environment' : 'user')) : undefined
      }
      onMore={video ? () => setMoreOpen((value) => !value) : undefined}
      moreOpen={moreOpen}
      onHangup={onHangup}
      voiceUi={!video}
    />
  );

  if (!video) {
    const inCall = Boolean(connected);
    const reconnecting = link === 'reconnecting';
    const lost = link === 'lost';
    const stateText = reconnecting
      ? 'Reconectando...'
      : lost
        ? 'Conexión perdida'
        : inCall
          ? mobile
            ? 'En llamada'
            : 'Llamada de voz en curso'
          : ringing
            ? 'Llamando...'
            : 'Conectando...';
    return (
      <>
        <CallConnectionSync />
        <RoomAudioRenderer />
        <CallAudioUnlock />
        <div className={`lb-call-voice-panel${mobile ? ' is-mobile' : ''}`}>
          {mobile ? (
            <img src={BRAND_LOGO_SRC} alt="LiveBoom" className="lb-call-voice-logo" draggable={false} />
          ) : null}
          <div className={`lb-call-avatar-wrap${mobile ? '' : ' is-compact'}`}>
            <span className="lb-call-avatar-ring" aria-hidden />
            <UserAvatar
              src={avatar || null}
              uid={peerUid}
              username={handle}
              displayName={name}
              size={mobile ? 112 : 72}
              ringClassName="ring-0"
            />
          </div>
          <p className="lb-call-incoming__name">{name || (handle ? `@${handle}` : 'LiveBoom')}</p>
          {handle ? <p className="lb-call-voice-handle">@{handle.replace(/^@/, '')}</p> : null}
          <p className={`lb-call-voice-state${inCall && !reconnecting && !lost ? ' is-on' : ''}`}>{stateText}</p>
          {inCall && !reconnecting && !lost ? <p className="lb-call-voice-connected">Conectado</p> : null}
          {inCall ? <p className="lb-call-voice-clock">{formatCallClock(elapsed || 0)}</p> : null}
          <CallVoiceWaveform active={inCall} />
          {controls}
          {mobile ? (
            <p className="lb-call-voice-secure">
              <Lock size={11} />
              Cifrado de extremo a extremo
            </p>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      <CallConnectionSync />
      <RoomAudioRenderer />
      <CallAudioUnlock />
      <div className="lb-call-video-stage">
        <div className="lb-call-video-remote">
          {remoteCameras.length === 0 ? (
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
              ) : (
                <p>{ringing ? 'Llamando...' : 'Conectando...'}</p>
              )}
            </div>
          ) : (
            remoteCameras.map((track) => (
              <VideoTrack
                key={track.participant.identity}
                trackRef={track}
                className="h-full w-full object-contain"
              />
            ))
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
            className="h-full w-full [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-cover [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
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

      {moreOpen ? (
        <div className="lb-call-more">
          {!arEnabled && ready ? (
            <p className="text-center text-[10px] text-zinc-500">
              Video listo. Filtros AR no activos en este dominio (añade liveboomapp.com en DeepAR).
            </p>
          ) : null}
          <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CALL_FILTERS.map((filter) => {
              const active = filter.id === filterId;
              return (
                <button
                  key={filter.id}
                  type="button"
                  disabled={!ready || !arEnabled}
                  onClick={() => setFilterId(filter.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                    active
                      ? 'bg-emerald-400 text-zinc-950'
                      : 'bg-white/10 text-zinc-200 hover:bg-white/15 disabled:opacity-40'
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-center">
            <button
              type="button"
              disabled={!ready || busySnap}
              onClick={() => void takeInstantPhoto()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-sky-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              <Camera size={14} /> Foto
            </button>
          </div>
        </div>
      ) : null}

      {controls}

      {snapPreview ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/80 p-4">
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/15 bg-zinc-950">
            <img src={snapPreview} alt="Foto" className="max-h-[70dvh] w-full object-contain" />
            <div className="flex justify-between gap-2 p-3">
              <p className="text-xs text-zinc-400">Guardada en descargas</p>
              <button
                type="button"
                onClick={() => setSnapPreview(null)}
                className="inline-flex min-h-11 items-center rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
  const incoming = useCallStore((state) => state.incoming);
  const setIncoming = useCallStore((state) => state.setIncoming);
  const beginIncomingAccepted = useCallStore((state) => state.beginIncomingAccepted);
  const markActive = useCallStore((state) => state.markActive);
  const hangup = useCallStore((state) => state.hangup);
  const cooldownRef = useRef<Record<string, number>>({});
  const [ringMuted, setRingMuted] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const elapsed = useCallElapsed();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [peekChat, setPeekChat] = useState(false);

  useEffect(() => {
    const onPeek = () => setPeekChat(true);
    window.addEventListener('liveboom:peek-chat', onPeek);
    return () => window.removeEventListener('liveboom:peek-chat', onPeek);
  }, []);

  useEffect(() => {
    if (status === 'idle' || status === 'ringing-in') setPeekChat(false);
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
    return listenConversations(profile.firebaseUid, (list) => {
      const store = useCallStore.getState();
      if (store.chatId) {
        const mine = list.find((item) => item.chatId === store.chatId);
        if (mine?.call?.status === 'active' && (store.status === 'ringing-out' || store.status === 'active')) {
          markActive(connectedAtToMs(mine.call.connectedAt));
        }
        if (mine && mine.call == null && (store.status === 'ringing-out' || store.status === 'active')) {
          void hangup(undefined, { skipHistory: true });
          return;
        }
      }
      if (store.status === 'active' || store.status === 'ringing-out') return;

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
      setIncoming({
        chatId: ringing.chatId,
        callId: ringing.call.id,
        video: ringing.call.video,
        peer: {
          uid: ringing.call.fromUid,
          username: ringing.call.fromHandle || ringing.username,
          displayName: ringing.call.fromName || ringing.displayName,
          avatarUrl: ringing.call.fromAvatar || ringing.avatarUrl,
        },
      });
    });
  }, [profile?.firebaseUid, hangup, markActive, setIncoming]);

  useEffect(() => {
    if (status !== 'ringing-in' || ringMuted) {
      stopCallRing();
      return;
    }
    startCallRing();
    return () => stopCallRing();
  }, [status, ringMuted]);

  useEffect(() => {
    if (status !== 'ringing-out') return;
    const timer = window.setTimeout(() => {
      hangupWithCooldown('missed');
    }, 45_000);
    return () => window.clearTimeout(timer);
  }, [status, hangup]);

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

  useLayoutEffect(() => {
    setHost(document.getElementById('lb-chat-call-host'));
  }, [status, location.pathname, location.search]);

  if (!profile) return null;

  const showIncoming = status === 'ringing-in' && incoming;
  const showCall = (status === 'ringing-out' || status === 'active') && token && serverUrl && peer;

  if (!showIncoming && !showCall) return null;

  const name = (showIncoming ? incoming?.peer.displayName : peer?.displayName) || '';
  const handle = (showIncoming ? incoming?.peer.username : peer?.username) || '';
  const avatar = (showIncoming ? incoming?.peer.avatarUrl : peer?.avatarUrl) || null;
  const peerUid = showIncoming ? incoming?.peer.uid : peer?.uid;
  const isVideo = showIncoming ? Boolean(incoming?.video) : video;
  const statusLine =
    status === 'ringing-out'
      ? isVideo
        ? 'Llamando por video...'
        : 'Llamando...'
      : status === 'active'
        ? formatCallClock(elapsed)
        : 'Conectando...';

  const incomingUi = showIncoming && incoming ? (
    <IncomingCallCard
      name={name}
      handle={handle}
      avatar={avatar}
      uid={peerUid}
      video={isVideo}
      accepting={accepting}
      error={permError}
      ringMuted={ringMuted}
      onAccept={() => void accept()}
      onDecline={() => hangupWithCooldown('declined')}
      onMuteRing={() => setRingMuted(true)}
      onMessage={() => {
        if (handle) navigate(`/mensajes?con=${encodeURIComponent(handle)}`);
      }}
    />
  ) : null;

  const activeUi = showCall ? (
    <div className={`lb-call-active${isVideo ? '' : ' is-voice'}${peekChat && isVideo ? ' is-peek-chat' : ''}`}>
      {isVideo ? <p className="lb-call-active__status">{statusLine}</p> : null}
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        audio
        video={false}
        className={isVideo ? 'lb-call-room' : 'lb-call-room lb-call-room--voice'}
      >
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
        />
      </LiveKitRoom>
    </div>
  ) : null;

  const ui = incomingUi || activeUi;
  if (!ui) return null;
  if (host) return createPortal(ui, host);
  return <div className={`lb-call-fallback${showIncoming ? ' is-incoming' : ''}`}>{ui}</div>;
}
