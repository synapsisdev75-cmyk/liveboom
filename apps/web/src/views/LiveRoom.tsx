import '@livekit/components-styles';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useRoomContext,
  useTracks,
  type TrackReference,
} from '@livekit/components-react';
import { createLocalVideoTrack, RoomEvent, Track, type LocalVideoTrack } from 'livekit-client';
import {
  Circle,
  Eye,
  Gift,
  Lock,
  Radio,
  Send,
  SwitchCamera,
  UserPlus,
  Video,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { FloatingGift, GiftIcon } from '../components/live/FloatingGift';
import { FaceMeshGiftOverlay, type ActiveFaceGift } from '../components/live/FaceMeshGiftOverlay';
import { CoinModal, RechargeButton } from '../components/wallet/CoinModal';
import { api, ApiError } from '../lib/api';
import { isFaceAnchoredGift } from '../lib/faceGiftAnchors';
import { LIVEBOOM_GIFTS, GIFT_LEVEL_FX, findLiveGift } from '../lib/liveboomGifts';
import { useAuthStore } from '../store/authStore';

type LockInfo = {
  giftId: string;
  giftName: string;
  coins: number;
  emoji: string;
};

type FloatingGiftItem = { id: string; giftId: string; left: number; senderName?: string };

const REEL_SECONDS = 15;

type LiveLaunchState = {
  goLive?: boolean;
  title?: string;
  isPrivate?: boolean;
  category?: string;
};

type ChatMessage = {
  id: string;
  author: string;
  text: string;
  gift?: { giftId: string; emoji: string; name: string };
};

type RoomPayload =
  | { type: 'chat'; id: string; author: string; text: string }
  | {
      type: 'gift';
      id: string;
      giftId: string;
      senderName: string;
      giftName: string;
      emoji: string;
    }
  | { type: 'invite'; guestHandle: string; hostName: string }
  | { type: 'lock'; lock: LockInfo | null };

function publishRoomData(room: ReturnType<typeof useRoomContext>, payload: RoomPayload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return room.localParticipant.publishData(bytes, { reliable: true });
}

function parseRoomData(payload: Uint8Array): RoomPayload | null {
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as RoomPayload;
  } catch {
    return null;
  }
}

function useViewerCount() {
  const room = useRoomContext();
  const [connected, setConnected] = useState(1);

  useEffect(() => {
    const refresh = () => {
      setConnected(Math.max(1, room.remoteParticipants.size + 1));
    };
    refresh();
    room.on(RoomEvent.ParticipantConnected, refresh);
    room.on(RoomEvent.ParticipantDisconnected, refresh);
    room.on(RoomEvent.Connected, refresh);
    return () => {
      room.off(RoomEvent.ParticipantConnected, refresh);
      room.off(RoomEvent.ParticipantDisconnected, refresh);
      room.off(RoomEvent.Connected, refresh);
    };
  }, [room]);

  return {
    connected,
    viewers: Math.max(0, connected - 1),
  };
}

export function LiveRoom() {
  const { username } = useParams();
  const location = useLocation();
  const launch = (location.state as LiveLaunchState | null) || {};
  const ready = useAuthStore((state) => state.ready);
  const profile = useAuthStore((state) => state.profile);
  const setCoins = useAuthStore((state) => state.setCoins);
  const [session, setSession] = useState<{
    token: string;
    serverUrl: string;
    canPublish: boolean;
    isHost?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveStarted, setLiveStarted] = useState(false);
  const [isPrivate, setIsPrivate] = useState(Boolean(launch.isPrivate));
  const [gateLock, setGateLock] = useState<LockInfo | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const isOwnRoom =
    profile?.handle && username
      ? profile.handle.toLowerCase() === username.toLowerCase()
      : false;
  const needsLaunchConfirm = isOwnRoom && !launch.goLive && !liveStarted;

  async function fetchToken() {
    if (!username || !profile) return;
    const data = await api<{
      token: string;
      serverUrl: string;
      canPublish: boolean;
      isHost?: boolean;
    }>(`/api/stream/token/${encodeURIComponent(username)}`);
    setSession(data);
    setGateLock(null);
    setError(null);
  }

  useEffect(() => {
    if (!username || !profile || needsLaunchConfirm) return;
    let cancelled = false;
    void (async () => {
      try {
        const lockState = await api<{
          locked: boolean;
          unlocked: boolean;
          isHost: boolean;
          lock: LockInfo | null;
        }>(`/api/stream/lock/${encodeURIComponent(username)}`);
        if (cancelled) return;
        if (lockState.locked && !lockState.unlocked && !lockState.isHost && lockState.lock) {
          setGateLock(lockState.lock);
          return;
        }
        await fetchToken();
      } catch (err: unknown) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 402) {
          const lock = (err.data.lock as LockInfo) || null;
          if (lock) {
            setGateLock(lock);
            return;
          }
        }
        setError(err instanceof Error ? err.message : 'No se pudo entrar a la sala');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, username, needsLaunchConfirm]);

  async function unlockAndEnter() {
    if (!username) return;
    setUnlocking(true);
    setError(null);
    try {
      const result = await api<{ senderBalance?: number }>('/api/stream/unlock', {
        method: 'POST',
        body: JSON.stringify({ roomName: username }),
      });
      if (typeof result.senderBalance === 'number') setCoins(result.senderBalance);
      await fetchToken();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo desbloquear');
    } finally {
      setUnlocking(false);
    }
  }
  useEffect(() => {
    if (!username || !profile || !session?.canPublish || !session.isHost) return;
    if (!launch.goLive || liveStarted) return;

    let cancelled = false;
    void api('/api/stream/live/start', {
      method: 'POST',
      body: JSON.stringify({
        username,
        title: launch.title || `Live de ${profile.displayName || profile.handle}`,
        isPrivate: Boolean(launch.isPrivate),
        category: launch.category || profile.category || 'otro',
      }),
    })
      .then(() => {
        if (!cancelled) {
          setLiveStarted(true);
          setIsPrivate(Boolean(launch.isPrivate));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [username, profile, session, launch.goLive, launch.title, launch.isPrivate, launch.category, liveStarted]);

  useEffect(() => {
    return () => {
      if (liveStarted && username) {
        void api('/api/stream/live/stop', {
          method: 'POST',
          body: JSON.stringify({ username }),
        }).catch(() => undefined);
      }
    };
  }, [liveStarted, username]);

  if (!ready) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-zinc-950 text-sm text-zinc-400">
        Cargando sala…
      </div>
    );
  }
  if (!profile) {
    return <Navigate to="/login" replace />;
  }
  if (!username) {
    return <Navigate to="/" replace />;
  }
  if (needsLaunchConfirm) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-zinc-950 px-6 text-center">
        <div className="max-w-sm space-y-4">
          <p className="text-lg font-bold text-white">¿Listo para transmitir?</p>
          <p className="text-sm text-zinc-400">
            Configura si tu live será público o privado antes de abrir la cámara.
          </p>
          <Link
            to="/transmitir"
            className="inline-block rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-6 py-3 text-sm font-bold text-zinc-950"
          >
            Configurar transmisión
          </Link>
          <Link to="/" className="block text-xs text-cyan-400">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }
  if (gateLock) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-zinc-950 px-6 text-center">
        <div className="max-w-sm space-y-4 rounded-3xl border border-amber-400/30 bg-zinc-900 p-6">
          <p className="text-4xl">{gateLock.emoji || '🔒'}</p>
          <p className="text-lg font-bold text-white">Live con candado</p>
          <p className="text-sm text-zinc-400">
            El emisor pidió <strong className="text-amber-300">{gateLock.giftName}</strong> (
            {gateLock.coins.toLocaleString('es-CO')} coins) para entrar a este live privado.
          </p>
          {error ? <p className="text-sm text-fuchsia-400">{error}</p> : null}
          <button
            type="button"
            disabled={unlocking}
            onClick={() => void unlockAndEnter()}
            className="w-full rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500 py-3 text-sm font-bold text-zinc-950 disabled:opacity-60"
          >
            {unlocking ? 'Desbloqueando…' : `Enviar ${gateLock.emoji} y entrar`}
          </button>
          <Link to="/" className="block text-xs text-cyan-400">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-zinc-950 px-6 text-center">
        <div>
          <p className="text-sm font-semibold text-fuchsia-400">{error}</p>
          <Link to="/" className="mt-3 block text-xs text-cyan-400">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-zinc-950 text-sm text-zinc-400">
        Conectando LiveKit…
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-zinc-950 p-0 sm:p-3">
      <LiveKitRoom
        key={`${session.token}-${session.canPublish ? 'pub' : 'sub'}`}
        token={session.token}
        serverUrl={session.serverUrl}
        connect
        video={session.canPublish}
        audio={session.canPublish}
        className="relative flex h-full w-full min-h-0 flex-col lg:flex-row lg:gap-3"
      >
        <RoomAudioRenderer />
        <CreatorStage
          username={username}
          canPublish={session.canPublish}
          isHost={Boolean(session.isHost ?? (session.canPublish && isOwnRoom))}
          isPrivate={isPrivate}
        />
        <ChatPanel
          roomName={username}
          canPublish={session.canPublish}
          isHost={Boolean(session.isHost ?? (session.canPublish && isOwnRoom))}
          onAcceptInvite={() => void fetchToken()}
        />
      </LiveKitRoom>
    </div>
  );
}

function CreatorStage({
  username,
  canPublish,
  isHost,
  isPrivate,
}: {
  username: string;
  canPublish: boolean;
  isHost: boolean;
  isPrivate: boolean;
}) {
  const room = useRoomContext();
  const profile = useAuthStore((state) => state.profile);
  const { viewers } = useViewerCount();
  const [floats, setFloats] = useState<FloatingGiftItem[]>([]);
  const [faceGift, setFaceGift] = useState<ActiveFaceGift | null>(null);
  const stageVideoRef = useRef<HTMLDivElement>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [flipping, setFlipping] = useState(false);
  const [inviteHandle, setInviteHandle] = useState('');
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [reelNote, setReelNote] = useState<string | null>(null);
  const [lock, setLock] = useState<LockInfo | null>(null);
  const [lockPicker, setLockPicker] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [viewersList, setViewersList] = useState<{ identity: string; name: string }[]>([]);
  const cameraTrackRef = useRef<LocalVideoTrack | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const localTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }]);
  const localCamera = localTracks.find((track) => track.participant.isLocal);

  useEffect(() => {
    const pub = localCamera?.publication?.track;
    if (pub && 'mediaStreamTrack' in pub) {
      cameraTrackRef.current = pub as LocalVideoTrack;
    }
  }, [localCamera]);

  useEffect(() => {
    if (!isHost) return;
    void api<{ lock: LockInfo | null }>(`/api/stream/lock/${encodeURIComponent(username)}`)
      .then((data) => setLock(data.lock))
      .catch(() => undefined);
  }, [isHost, username]);

  useEffect(() => {
    const onLocalGift = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; giftId: string; senderName: string }>).detail;
      if (!detail?.giftId) return;
      setFloats((current) => [
        ...current,
        {
          id: detail.id,
          giftId: detail.giftId,
          left: 18 + Math.random() * 64,
          senderName: detail.senderName,
        },
      ]);
      if (isFaceAnchoredGift(detail.giftId)) {
        const gift = findLiveGift(detail.giftId);
        const seconds = gift ? GIFT_LEVEL_FX[gift.level].duration : 3.5;
        setFaceGift({
          id: detail.id,
          giftId: detail.giftId,
          endsAt: Date.now() + seconds * 1000,
        });
      }
    };
    window.addEventListener('liveboom:gift', onLocalGift);
    return () => window.removeEventListener('liveboom:gift', onLocalGift);
  }, []);

  useEffect(() => {
    const applyGift = (giftId: string, id: string, senderName?: string) => {
      setFloats((current) => [
        ...current,
        {
          id,
          giftId,
          left: 18 + Math.random() * 64,
          senderName,
        },
      ]);
      if (isFaceAnchoredGift(giftId)) {
        const gift = findLiveGift(giftId);
        const seconds = gift ? GIFT_LEVEL_FX[gift.level].duration : 3.5;
        setFaceGift({
          id,
          giftId,
          endsAt: Date.now() + seconds * 1000,
        });
      }
    };

    const onData = (payload: Uint8Array) => {
      const data = parseRoomData(payload);
      if (!data) return;
      if (data.type === 'gift') {
        applyGift(data.giftId, data.id, data.senderName);
      }
      if (data.type === 'lock') {
        setLock(data.lock);
      }
    };
    const onLocalGift = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; giftId: string; senderName?: string }>).detail;
      if (!detail?.giftId) return;
      applyGift(detail.giftId, detail.id, detail.senderName);
    };
    room.on(RoomEvent.DataReceived, onData);
    window.addEventListener('liveboom:gift', onLocalGift);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
      window.removeEventListener('liveboom:gift', onLocalGift);
    };
  }, [room]);

  useEffect(() => {
    const refresh = () => {
      setViewersList(
        Array.from(room.remoteParticipants.values()).map((participant) => ({
          identity: participant.identity,
          name: participant.name || participant.identity.slice(0, 10),
        })),
      );
    };
    refresh();
    room.on(RoomEvent.ParticipantConnected, refresh);
    room.on(RoomEvent.ParticipantDisconnected, refresh);
    return () => {
      room.off(RoomEvent.ParticipantConnected, refresh);
      room.off(RoomEvent.ParticipantDisconnected, refresh);
    };
  }, [room]);

  async function setLiveLock(giftId: string | null) {
    if (!isHost) return;
    setLockBusy(true);
    try {
      const result = await api<{ lock: LockInfo | null; locked: boolean }>('/api/stream/lock', {
        method: 'POST',
        body: JSON.stringify(
          giftId ? { roomName: username, giftId } : { roomName: username, clear: true },
        ),
      });
      const next = result.locked ? result.lock : null;
      setLock(next);
      setLockPicker(false);
      await publishRoomData(room, { type: 'lock', lock: next });
    } catch (err) {
      setInviteNote(err instanceof Error ? err.message : 'No se pudo actualizar el candado');
    } finally {
      setLockBusy(false);
    }
  }
  const flipCamera = useCallback(async () => {
    if (!canPublish || flipping) return;
    setFlipping(true);
    const nextFacing = facing === 'user' ? 'environment' : 'user';
    try {
      const nextTrack = await createLocalVideoTrack({
        facingMode: nextFacing,
      });
      const publications = Array.from(room.localParticipant.videoTrackPublications.values());
      for (const publication of publications) {
        if (publication.source === Track.Source.Camera && publication.track) {
          await room.localParticipant.unpublishTrack(publication.track);
          publication.track.stop();
        }
      }
      if (cameraTrackRef.current) {
        cameraTrackRef.current.stop();
      }
      await room.localParticipant.publishTrack(nextTrack, {
        source: Track.Source.Camera,
        name: 'camera',
      });
      cameraTrackRef.current = nextTrack;
      setFacing(nextFacing);
    } catch (error) {
      console.error('[live] flip camera', error);
    } finally {
      setFlipping(false);
    }
  }, [canPublish, flipping, facing, room]);

  async function inviteGuest() {
    const guestHandle = inviteHandle.trim().replace(/^@/, '');
    if (!guestHandle) return;
    setInviteNote(null);
    try {
      await api('/api/stream/invite', {
        method: 'POST',
        body: JSON.stringify({ roomName: username, guestHandle }),
      });
      await publishRoomData(room, {
        type: 'invite',
        guestHandle,
        hostName: profile?.displayName || profile?.handle || username,
      });
      setInviteNote(`Invitación enviada a @${guestHandle}`);
      setInviteHandle('');
    } catch (err) {
      setInviteNote(err instanceof Error ? err.message : 'No se pudo invitar');
    }
  }

  async function recordReel() {
    if (recording || !isHost) return;
    const track = cameraTrackRef.current?.mediaStreamTrack;
    if (!track) {
      setReelNote('Espera a que la cámara esté lista');
      return;
    }
    setRecording(true);
    setReelNote(`Grabando reel (${REEL_SECONDS}s)…`);
    try {
      const stream = new MediaStream([track]);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      await new Promise<void>((resolve) => {
        window.setTimeout(() => {
          recorder.stop();
          resolve();
        }, REEL_SECONDS * 1000);
      });
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      const blob = new Blob(chunks, { type: mimeType });
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('No se pudo leer el video'));
        reader.readAsDataURL(blob);
      });
      await api('/api/stream/reels', {
        method: 'POST',
        body: JSON.stringify({
          username,
          dataUrl,
          title: `Reel · ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`,
          shared: false,
        }),
      });
      setReelNote('Reel guardado. Puedes compartirlo desde tu perfil.');
    } catch (err) {
      setReelNote(err instanceof Error ? err.message : 'No se pudo grabar el reel');
    } finally {
      setRecording(false);
      recorderRef.current = null;
    }
  }

  return (
    <section className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-black lg:w-[70%] lg:rounded-2xl lg:border lg:border-white/10 lg:shadow-[0_0_48px_rgba(0,240,255,0.12)]">
      <div className="relative h-full w-full max-w-full lg:max-h-full">
        <div className="mx-auto flex h-full w-full max-w-[min(100%,calc(100dvh*9/16))] items-center justify-center">
          <div
            ref={stageVideoRef}
            className="relative aspect-[9/16] h-full max-h-full w-auto max-w-full overflow-hidden bg-black lg:rounded-2xl"
          >
            <CreatorVideo />
            <FaceMeshGiftOverlay containerRef={stageVideoRef} active={faceGift} />
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-3 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="pointer-events-auto flex max-w-[78%] flex-wrap items-center gap-2">
            <span className="live-dot rounded-md bg-fuchsia-600 px-2 py-1 text-[11px] font-bold text-white">
              <Radio className="mr-1 inline" size={11} /> EN VIVO
            </span>
            {isHost ? (
              <button
                type="button"
                disabled={lockBusy}
                onClick={() => setLockPicker((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold backdrop-blur ${
                  lock
                    ? 'bg-amber-500/30 text-amber-200 ring-1 ring-amber-400/50'
                    : 'bg-black/50 text-zinc-200 hover:text-white'
                }`}
              >
                <Lock size={11} />
                {lock ? `${lock.emoji} Candado` : 'Candado'}
              </button>
            ) : lock ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/25 px-2 py-1 text-[11px] text-amber-200 backdrop-blur">
                <Lock size={11} /> {lock.emoji} {lock.giftName}
              </span>
            ) : null}
            {isPrivate ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[11px] text-amber-300 backdrop-blur">
                <Lock size={11} /> Privado
              </span>
            ) : null}
            <span className="truncate rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur">
              @{username}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-cyan-300 backdrop-blur">
              <Eye size={12} />
              {viewers} viendo
            </span>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            {canPublish ? (
              <button
                type="button"
                onClick={() => void flipCamera()}
                disabled={flipping}
                className="grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 disabled:opacity-60"
                aria-label="Cambiar cámara"
              >
                <SwitchCamera size={16} />
              </button>
            ) : null}
            <Link
              to="/"
              className="rounded-full bg-black/55 px-3 py-2 text-xs text-zinc-200 backdrop-blur hover:text-white"
            >
              Salir
            </Link>
          </div>
        </div>
      </div>
      {lockPicker && isHost ? (
        <div className="pointer-events-auto absolute left-3 top-[4.2rem] z-20 max-h-[50dvh] w-[min(100%,18rem)] overflow-y-auto rounded-2xl border border-amber-400/30 bg-zinc-950/95 p-3 shadow-xl sm:left-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-amber-300">
            Regalo para entrar
          </p>
          <div className="space-y-1">
            {LIVEBOOM_GIFTS.filter((g) => g.coins <= 1000).map((gift) => (
              <button
                key={gift.id}
                type="button"
                disabled={lockBusy}
                onClick={() => void setLiveLock(gift.id)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-white hover:bg-white/5"
              >
                <span>
                  {gift.emoji} {gift.name}
                </span>
                <span className="text-cyan-400">{gift.coins}</span>
              </button>
            ))}
          </div>
          {lock ? (
            <button
              type="button"
              disabled={lockBusy}
              onClick={() => void setLiveLock(null)}
              className="mt-2 w-full rounded-lg border border-white/10 py-1.5 text-[11px] text-zinc-400"
            >
              Quitar candado
            </button>
          ) : null}
        </div>
      ) : null}
      {isHost ? (
        <div className="pointer-events-auto absolute left-3 right-3 top-[4.5rem] z-10 flex flex-wrap gap-2 sm:left-4 sm:right-auto">
          {!lockPicker ? (
            <>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-black/55 p-2 backdrop-blur sm:max-w-xs">
            <UserPlus size={16} className="shrink-0 text-cyan-300" />
            <input
              value={inviteHandle}
              onChange={(event) => setInviteHandle(event.target.value)}
              placeholder="Unir @espectador al live"
              className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none"
              list="live-viewers"
            />
            <datalist id="live-viewers">
              {viewersList.map((viewer) => (
                <option key={viewer.identity} value={viewer.name} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={() => void inviteGuest()}
              className="shrink-0 rounded-lg bg-cyan-500/20 px-2 py-1 text-[10px] font-bold text-cyan-300"
            >
              Unir
            </button>
          </div>
          <button
            type="button"
            disabled={recording}
            onClick={() => void recordReel()}
            className="inline-flex items-center gap-1 rounded-xl bg-black/55 px-3 py-2 text-xs font-semibold text-white backdrop-blur disabled:opacity-60"
          >
            {recording ? <Circle className="animate-pulse text-red-400" size={12} /> : <Video size={14} />}
            {recording ? 'Grabando…' : 'Reel 15s'}
          </button>
            </>
          ) : null}
        </div>
      ) : null}
      {(inviteNote || reelNote) && isHost ? (
        <p className="pointer-events-none absolute left-3 right-3 top-[8.5rem] z-10 text-[11px] text-cyan-200 sm:left-4 sm:max-w-md">
          {inviteNote || reelNote}
        </p>
      ) : null}
      {floats.map((item) => (
        <FloatingGift
          key={item.id}
          giftId={item.giftId}
          senderName={item.senderName}
          left={item.left}
          onComplete={() => setFloats((current) => current.filter((gift) => gift.id !== item.id))}
        />
      ))}
    </section>
  );
}

function CreatorVideo() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }]);
  const cameras = tracks
    .filter((track): track is TrackReference => Boolean(track.publication))
    .sort((a, b) => Number(a.participant.joinedAt) - Number(b.participant.joinedAt));
  const main = cameras[0];
  const guests = cameras.slice(1);

  if (!main) {
    return (
      <div className="grid h-full w-full place-items-center text-sm text-zinc-500">
        Esperando la cámara del creador…
      </div>
    );
  }

  return (
    <>
      <VideoTrack trackRef={main} className="absolute inset-0 h-full w-full object-cover" />
      {guests.map((guest) => (
        <div
          key={guest.participant.identity}
          className="absolute right-2 top-24 z-10 h-36 w-24 overflow-hidden rounded-xl border border-cyan-400/50 shadow-lg sm:h-44 sm:w-28"
        >
          <VideoTrack trackRef={guest} className="h-full w-full object-cover" />
          <p className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-center text-[9px] font-semibold text-cyan-100">
            {guest.participant.name || 'Invitado'}
          </p>
        </div>
      ))}
    </>
  );
}

function ChatPanel({
  roomName,
  canPublish,
  isHost,
  onAcceptInvite,
}: {
  roomName: string;
  canPublish: boolean;
  isHost: boolean;
  onAcceptInvite?: () => void;
}) {
  const room = useRoomContext();
  const profile = useAuthStore((state) => state.profile);
  const coins = profile?.coinsBalance ?? 0;
  const setCoins = useAuthStore((state) => state.setCoins);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [openGifts, setOpenGifts] = useState(false);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [inviteBanner, setInviteBanner] = useState<string | null>(null);
  const [pinnedBottom, setPinnedBottom] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());

  function pushMessage(message: ChatMessage) {
    if (seen.current.has(message.id)) return;
    seen.current.add(message.id);
    setMessages((current) => [...current.slice(-400), message]);
  }

  useEffect(() => {
    void api<{ messages: ChatMessage[] }>(`/api/stream/chat/${encodeURIComponent(roomName)}`)
      .then((data) => {
        for (const msg of data.messages || []) pushMessage(msg);
      })
      .catch(() => undefined);
  }, [roomName]);

  useEffect(() => {
    const onData = (payload: Uint8Array) => {
      const data = parseRoomData(payload);
      if (!data) return;
      if (data.type === 'chat') {
        pushMessage({ id: data.id, author: data.author, text: data.text });
        return;
      }
      if (data.type === 'gift') {
        pushMessage({
          id: `gift-${data.id}`,
          author: data.senderName,
          text: `envió ${data.giftName}`,
          gift: { giftId: data.giftId, emoji: data.emoji, name: data.giftName },
        });
        return;
      }
      if (data.type === 'invite') {
        const myHandle = profile?.handle?.toLowerCase();
        if (myHandle && data.guestHandle.toLowerCase() === myHandle) {
          setInviteBanner(`${data.hostName} te invitó a unirte con cámara.`);
        }
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, profile?.handle]);

  useEffect(() => {
    if (!pinnedBottom) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pinnedBottom]);

  function onChatScroll() {
    const el = listRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setPinnedBottom(dist < 80);
  }
  async function sendMessage() {
    const value = text.trim();
    if (!value) return;
    const author = profile?.displayName || profile?.handle || 'Liveboomer';
    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author,
      text: value,
    };
    pushMessage(message);
    setText('');
    try {
      await publishRoomData(room, { type: 'chat', ...message });
      void api(`/api/stream/chat/${encodeURIComponent(roomName)}`, {
        method: 'POST',
        body: JSON.stringify(message),
      }).catch(() => undefined);
    } catch (error) {
      console.error('[chat] publishData', error);
    }
  }

  async function sendGift(giftId: string) {
    setGiftError(null);
    try {
      const result = await api<{
        senderBalance: number;
        gift: {
          id: string;
          giftId: string;
          giftName: string;
          emoji: string;
          senderName: string;
        };
      }>('/api/gifts/send', {
        method: 'POST',
        body: JSON.stringify({ giftId, roomName }),
      });
      setCoins(result.senderBalance);
      setOpenGifts(false);
      const gift = result.gift;
      pushMessage({
        id: `gift-${gift.id}`,
        author: gift.senderName,
        text: `envió ${gift.giftName}`,
        gift: { giftId: gift.giftId, emoji: gift.emoji, name: gift.giftName },
      });
      await publishRoomData(room, {
        type: 'gift',
        id: gift.id,
        giftId: gift.giftId,
        senderName: gift.senderName,
        giftName: gift.giftName,
        emoji: gift.emoji,
      });
      window.dispatchEvent(
        new CustomEvent('liveboom:gift', {
          detail: {
            id: gift.id,
            giftId: gift.giftId,
            senderName: gift.senderName,
          },
        }),
      );
    } catch (err) {
      setGiftError(err instanceof Error ? err.message : 'No se pudo enviar el regalo');
    }
  }

  return (
    <aside
      className={`z-20 flex min-w-0 flex-col overflow-hidden border-white/10 lg:static lg:max-h-none lg:w-[30%] lg:min-w-[260px] lg:rounded-2xl lg:border ${
        canPublish
          ? 'absolute inset-x-0 bottom-0 max-h-[58dvh] border-0 bg-transparent lg:relative lg:inset-auto lg:max-h-none lg:border lg:bg-black/10 lg:backdrop-blur-[2px]'
          : 'relative max-h-[42dvh] border-t bg-zinc-900/95 lg:max-h-none lg:border-t-0 lg:bg-zinc-800/45 lg:backdrop-blur-xl'
      }`}
    >
      <div className={`px-4 py-2.5 ${canPublish ? 'bg-transparent' : 'border-b border-white/10'}`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className={`text-sm font-bold ${canPublish ? 'text-white drop-shadow' : 'text-white'}`}>
            Chat en vivo
          </h2>
          {canPublish && isHost ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-cyan-300 drop-shadow">
              Transparente
            </span>
          ) : null}
        </div>
        <p className={`text-[11px] ${canPublish ? 'text-zinc-200 drop-shadow' : 'text-zinc-400'}`}>
          Saldo: {coins.toLocaleString('es-CO')} coins
        </p>
        {inviteBanner ? (
          <div className="mt-1 flex items-center gap-2 rounded-lg bg-cyan-500/20 px-2 py-1.5 text-[11px] text-cyan-100 backdrop-blur">
            <span className="flex-1">{inviteBanner}</span>
            <button
              type="button"
              onClick={() => (onAcceptInvite ? onAcceptInvite() : window.location.reload())}
              className="shrink-0 rounded-md bg-cyan-400 px-2 py-0.5 text-[10px] font-bold text-zinc-950"
            >
              Unirme ahora
            </button>
          </div>
        ) : null}
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={onChatScroll}
          className={`chat-scroll h-full space-y-2 overflow-y-auto px-3 py-3 ${canPublish ? 'mask-fade' : ''}`}
        >
          {messages.length === 0 ? (
            <p className={`text-xs ${canPublish ? 'text-zinc-300 drop-shadow' : 'text-zinc-500'}`}>
              Sé el primero en saludar.
            </p>
          ) : (
            <p className={`text-[10px] ${canPublish ? 'text-zinc-400 drop-shadow' : 'text-zinc-600'}`}>
              Historial · {messages.length} mensajes · desplázate hacia arriba
            </p>
          )}
          {messages.map((message) =>
            message.gift ? (
              <div
                key={message.id}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 ${
                  canPublish
                    ? 'border border-yellow-400/40 bg-black/25 backdrop-blur-sm'
                    : 'border border-yellow-500/50 bg-gradient-to-r from-yellow-500/20 to-fuchsia-500/20'
                }`}
              >
                <GiftIcon giftId={message.gift.giftId} size={16} />
                <p className="text-sm text-white drop-shadow">
                  <span className="font-semibold text-cyan-300">{message.author} </span>
                  {message.text}
                </p>
              </div>
            ) : (
              <p key={message.id} className="text-sm text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                <span className="font-medium text-cyan-300">{message.author}: </span>
                {message.text}
              </p>
            ),
          )}
        </div>
        {!pinnedBottom ? (
          <button
            type="button"
            onClick={() => {
              setPinnedBottom(true);
              listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
            }}
            className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-cyan-500/90 px-3 py-1 text-[10px] font-bold text-zinc-950 shadow"
          >
            Ir al final · historial
          </button>
        ) : null}
      </div>
      <div className={`relative space-y-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${canPublish ? 'bg-gradient-to-t from-black/55 to-transparent' : 'border-t border-white/10'}`}>
        {openGifts ? (
          <div className="absolute bottom-[7.5rem] left-2 right-2 z-10 max-h-[42dvh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-3 shadow-[0_0_28px_rgba(255,0,85,0.2)] sm:left-3 sm:right-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Caja de regalos Liveboom
            </p>
            {([1, 2, 3, 4, 5] as const).map((level) => {
              const group = LIVEBOOM_GIFTS.filter((g) => g.level === level);
              if (!group.length) return null;
              return (
                <div key={level} className="mb-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    Nivel {level} · {GIFT_LEVEL_FX[level].label}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {group.map((gift) => (
                      <button
                        key={gift.id}
                        type="button"
                        onClick={() => void sendGift(gift.id)}
                        className="rounded-xl border border-zinc-800 px-2 py-2 text-left text-xs text-white hover:border-cyan-400"
                      >
                        <span className="text-lg">{gift.emoji}</span> {gift.name}
                        <span className="mt-1 block text-cyan-400">{gift.coins.toLocaleString('es-CO')} coins</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {giftError ? <p className="mt-2 text-xs text-fuchsia-400">{giftError}</p> : null}
          </div>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpenGifts((value) => !value)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 text-zinc-950 shadow-[0_0_18px_rgba(255,0,85,0.35)]"
            aria-label="Caja de regalos"
          >
            <Gift size={18} />
          </button>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void sendMessage();
            }}
            placeholder="Escribe un mensaje"
            className="h-11 flex-1 rounded-xl bg-black/40 px-3 text-sm text-white outline-none ring-1 ring-white/10 backdrop-blur"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            className="grid h-11 w-11 place-items-center rounded-xl bg-zinc-800/80 text-cyan-400 backdrop-blur"
            aria-label="Enviar"
          >
            <Send size={16} />
          </button>
        </div>
        {!canPublish ? (
          <RechargeButton onClick={() => setRechargeOpen(true)} className="w-full" />
        ) : null}
      </div>
      {rechargeOpen ? <CoinModal onClose={() => setRechargeOpen(false)} /> : null}
    </aside>
  );
}
