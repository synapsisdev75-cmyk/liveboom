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
import { Camera, Phone, PhoneOff, SwitchCamera, Video, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { startCallRing, stopCallRing } from '../../lib/alertSound';
import { api } from '../../lib/api';
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
  callRoomName,
  listenConversations,
  markInboxDelivered,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { useCallStore } from '../../store/callStore';

function CallStage({ video }: { video: boolean }) {
  const room = useRoomContext();
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

  if (!video) {
    return <RoomAudioRenderer />;
  }

  return (
    <>
      <RoomAudioRenderer />
      <div className="relative grid h-full min-h-[14rem] grid-cols-2 gap-1">
        <div className="relative overflow-hidden rounded-xl bg-black">
          {remoteCameras.length === 0 ? (
            <p className="grid h-full place-items-center px-2 text-center text-[11px] text-zinc-400">
              Esperando video…
            </p>
          ) : (
            remoteCameras.map((track) => (
              <VideoTrack
                key={track.participant.identity}
                trackRef={track}
                className="h-full w-full object-cover"
              />
            ))
          )}
        </div>

        <div className="relative overflow-hidden rounded-xl bg-black">
          <div ref={previewRef} className="h-full w-full [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-cover [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
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
        </div>
      </div>

      <div className="mt-2 space-y-2">
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

        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={!ready}
            onClick={() => setFacing((prev) => (prev === 'user' ? 'environment' : 'user'))}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
            aria-label="Cambiar cámara"
          >
            <SwitchCamera size={14} /> Cámara
          </button>
          <button
            type="button"
            disabled={!ready || busySnap}
            onClick={() => void takeInstantPhoto()}
            className="inline-flex items-center gap-1.5 rounded-full bg-sky-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
          >
            <Camera size={14} /> Foto
          </button>
        </div>
      </div>

      {snapPreview ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/80 p-4">
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/15 bg-zinc-950">
            <img src={snapPreview} alt="Foto" className="max-h-[70dvh] w-full object-contain" />
            <div className="flex justify-between gap-2 p-3">
              <p className="text-xs text-zinc-400">Guardada en descargas</p>
              <button
                type="button"
                onClick={() => setSnapPreview(null)}
                className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white"
              >
                <X size={14} /> Cerrar
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
        if (mine?.call?.status === 'active' && store.status === 'ringing-out') {
          markActive();
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
    if (status !== 'ringing-in') {
      stopCallRing();
      return;
    }
    startCallRing();
    return () => stopCallRing();
  }, [status]);

  useEffect(() => {
    if (status !== 'ringing-out') return;
    const timer = window.setTimeout(() => {
      hangupWithCooldown('missed');
    }, 45_000);
    return () => window.clearTimeout(timer);
  }, [status, hangup]);

  async function accept() {
    if (!incoming || !profile) return;
    try {
      await answerPrivateCall(incoming.chatId);
      const session = await api<{ token: string; serverUrl: string }>(
        `/api/stream/token/${encodeURIComponent(callRoomName(incoming.chatId))}`,
      );
      beginIncomingAccepted({
        chatId: incoming.chatId,
        callId: incoming.callId,
        peer: incoming.peer,
        video: incoming.video,
        token: session.token,
        serverUrl: session.serverUrl,
      });
    } catch {
      hangupWithCooldown('cancelled');
    }
  }

  if (!profile) return null;

  const showIncoming = status === 'ringing-in' && incoming;
  const showCall = (status === 'ringing-out' || status === 'active') && token && serverUrl && peer;

  if (!showIncoming && !showCall) return null;

  const name = (showIncoming ? incoming?.peer.displayName : peer?.displayName) || '';
  const handle = (showIncoming ? incoming?.peer.username : peer?.username) || '';
  const avatar = (showIncoming ? incoming?.peer.avatarUrl : peer?.avatarUrl) || null;
  const isVideo = showIncoming ? Boolean(incoming?.video) : video;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl">
        <div className="px-5 pt-6 text-center">
          {avatar ? (
            <img src={avatar} alt="" className="mx-auto h-16 w-16 rounded-full object-cover ring-2 ring-emerald-400/40" />
          ) : (
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-zinc-800 text-2xl font-black text-emerald-300">
              {(name || handle || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <p className="mt-3 text-lg font-bold text-white">{name || `@${handle}`}</p>
          {handle ? <p className="text-xs text-zinc-400">@{handle}</p> : null}
          <p className="mt-2 text-sm font-semibold text-emerald-300">
            {showIncoming
              ? `${name || `@${handle}`} te está llamando${isVideo ? ' (video)' : ''}`
              : status === 'ringing-out'
                ? `Llamando${isVideo ? ' por video' : ''}…`
                : `En llamada${isVideo ? ' de video' : ''}`}
          </p>
        </div>

        {showCall ? (
          <LiveKitRoom
            token={token}
            serverUrl={serverUrl}
            connect
            audio
            video={false}
            className={video ? 'mx-4 mt-4 overflow-hidden' : 'h-0 overflow-hidden'}
          >
            <CallStage video={video} />
          </LiveKitRoom>
        ) : null}

        <div className="flex justify-center gap-3 px-5 py-6">
          {showIncoming ? (
            <>
              <button
                type="button"
                onClick={() => hangupWithCooldown('declined')}
                className="inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-3 text-sm font-bold text-white"
              >
                <PhoneOff size={16} /> Rechazar
              </button>
              <button
                type="button"
                onClick={() => void accept()}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-3 text-sm font-bold text-zinc-950"
              >
                {isVideo ? <Video size={16} /> : <Phone size={16} />} Aceptar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => hangupWithCooldown()}
              className="inline-flex items-center gap-2 rounded-full bg-red-500 px-5 py-3 text-sm font-bold text-white"
            >
              <PhoneOff size={16} /> Colgar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
