import '@livekit/components-styles';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useRoomContext,
  useTracks,
  type TrackReference,
} from '@livekit/components-react';
import {
  Room,
  RoomEvent,
  Track,
  type LocalVideoTrack,
  type RoomOptions,
} from 'livekit-client';
import {
  Circle,
  Coins,
  Eye,
  Gift,
  Lock,
  Radio,
  Send,
  SwitchCamera,
  Unlock,
  UserPlus,
  Video,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { FloatingGift, GiftIcon } from '../components/live/FloatingGift';
import { FaceMeshGiftOverlay, type ActiveFaceGift } from '../components/live/FaceMeshGiftOverlay';
import { CoinModal, RechargeButton } from '../components/wallet/CoinModal';
import { WithdrawModal } from '../components/wallet/WithdrawModal';
import { api, ApiError } from '../lib/api';
import { isFaceAnchoredGift } from '../lib/faceGiftAnchors';
import { listenLiveGifts, publishLiveGift, listenLiveChat, publishLiveChatMessage, resetLiveRoomChat } from '../lib/liveGiftsFirestore';
import { LIVEBOOM_GIFTS, GIFT_LEVEL_FX, findLiveGift } from '../lib/liveboomGifts';
import { getSocket } from '../lib/socket';
import { useAuthStore } from '../store/authStore';

type LockInfo = {
  giftId: string;
  giftName: string;
  coins: number;
  emoji: string;
};

type FloatingGiftItem = { id: string; giftId: string; left: number; senderName?: string };

const REEL_SECONDS = 15;

const LIVEKIT_ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
};

type LiveLaunchState = {
  goLive?: boolean;
  title?: string;
  isPrivate?: boolean;
  category?: string;
  goalCoins?: number;
  goalLabel?: string;
};

type LiveSessionStats = {
  username: string;
  startedAt: string;
  goalCoins: number;
  goalLabel: string;
  coinsEarned: number;
  topGifters: { uid: string; name: string; coins: number }[];
};

type ChatMessage = {
  id: string;
  author: string;
  text: string;
  gift?: { giftId: string; emoji: string; name: string };
};

const liveChatCache = new Map<string, ChatMessage[]>();

function clearLiveChatCache(roomName: string) {
  liveChatCache.delete(roomName.trim().toLowerCase());
  liveChatCache.delete(roomName);
}

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
  const firebaseUid = useAuthStore((state) => state.profile?.firebaseUid);
  const handle = useAuthStore((state) => state.profile?.handle);
  const setCoins = useAuthStore((state) => state.setCoins);
  const livekitRoom = useMemo(() => new Room(LIVEKIT_ROOM_OPTIONS), []);
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
    Boolean(handle && username) && handle!.toLowerCase() === username!.toLowerCase();
  const needsLaunchConfirm = isOwnRoom && !launch.goLive && !liveStarted;

  async function fetchToken() {
    const profile = useAuthStore.getState().profile;
    if (!username || !profile) return;
    // Marca el live antes del token para que el host se reconozca por uid/username.
    if (isOwnRoom) {
      // Cada transmisión nueva empieza con chat vacío.
      clearLiveChatCache(username);
      await resetLiveRoomChat(username).catch((error) =>
        console.error('[live] reset chat', error),
      );
      await api('/api/stream/live/start', {
        method: 'POST',
        body: JSON.stringify({
          username,
          title: launch.title || `Live de ${profile.displayName || profile.handle}`,
          isPrivate: Boolean(launch.isPrivate ?? isPrivate),
          category: launch.category || profile.category || 'otro',
          goalCoins: Number(launch.goalCoins) || 0,
          goalLabel: launch.goalLabel || '',
        }),
      }).catch(() => undefined);
      setLiveStarted(true);
      if (typeof launch.isPrivate === 'boolean') setIsPrivate(launch.isPrivate);
    }
    const tokenHandle = encodeURIComponent(profile.handle);
    const data = await api<{
      token: string;
      serverUrl: string;
      canPublish: boolean;
      isHost?: boolean;
    }>(`/api/stream/token/${encodeURIComponent(username)}?handle=${tokenHandle}`);
    setSession((current) => {
      if (
        current &&
        current.token === data.token &&
        current.canPublish === data.canPublish &&
        current.serverUrl === data.serverUrl
      ) {
        return current;
      }
      return data;
    });
    setGateLock(null);
    setError(null);
    if (!data.canPublish && isOwnRoom) {
      setError('No se pudo activar tu cámara como anfitrión. Recarga e intenta de nuevo.');
    }
  }

  useEffect(() => {
    if (!username || !handle || needsLaunchConfirm) return;
    let cancelled = false;
    void (async () => {
      try {
        const lockState = await api<{
          locked: boolean;
          unlocked: boolean;
          isHost: boolean;
          lock: LockInfo | null;
        }>(
          `/api/stream/lock/${encodeURIComponent(username)}?handle=${encodeURIComponent(handle)}`,
        );
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
  }, [firebaseUid, username, needsLaunchConfirm, handle]);

  useEffect(() => {
    if (!gateLock || !username || !handle) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void api<{
        locked: boolean;
        unlocked: boolean;
        isHost: boolean;
        lock: LockInfo | null;
      }>(
        `/api/stream/lock/${encodeURIComponent(username)}?handle=${encodeURIComponent(handle)}`,
      )
        .then((lockState) => {
          if (cancelled) return;
          if (!lockState.locked || lockState.unlocked || lockState.isHost) {
            setGateLock(null);
            void fetchToken();
          }
        })
        .catch(() => undefined);
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [gateLock, username, handle]);

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
    return () => {
      if (liveStarted && username && isOwnRoom) {
        void api('/api/stream/live/stop', {
          method: 'POST',
          body: JSON.stringify({ username }),
        }).catch(() => undefined);
      }
    };
  }, [liveStarted, username, isOwnRoom]);

  // live/start ya se hace en fetchToken para el anfitrión
  useEffect(() => {
    if (!username || !firebaseUid || !session?.isHost || !launch.goLive || liveStarted) return;
    setLiveStarted(true);
  }, [username, firebaseUid, session?.isHost, launch.goLive, liveStarted]);

  if (!ready) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-zinc-950 text-sm text-zinc-400">
        Cargando sala…
      </div>
    );
  }
  if (!firebaseUid || !handle) {
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
        key={`${username}-${session.canPublish ? 'pub' : 'sub'}`}
        room={livekitRoom}
        token={session.token}
        serverUrl={session.serverUrl}
        connect
        video={false}
        audio={false}
        className="relative flex h-full w-full min-h-0 flex-col lg:flex-row lg:gap-3"
      >
        <RoomAudioRenderer />
        <CreatorStage
          username={username}
          canPublish={session.canPublish}
          isHost={Boolean(session.isHost ?? (session.canPublish && isOwnRoom))}
          isPrivate={isPrivate}
          goalCoins={Number(launch.goalCoins) || 0}
          goalLabel={launch.goalLabel || ''}
          onLeaveLive={async () => {
            if (isOwnRoom) {
              clearLiveChatCache(username);
              await Promise.all([
                api('/api/stream/live/stop', {
                  method: 'POST',
                  body: JSON.stringify({ username }),
                }).catch(() => undefined),
                resetLiveRoomChat(username).catch(() => undefined),
              ]);
              setLiveStarted(false);
            }
          }}
        />
        <ChatPanel
          roomName={username}
          canPublish={session.canPublish}
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
  goalCoins,
  goalLabel,
  onLeaveLive,
}: {
  username: string;
  canPublish: boolean;
  isHost: boolean;
  isPrivate: boolean;
  goalCoins: number;
  goalLabel: string;
  onLeaveLive?: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const room = useRoomContext();
  const handle = useAuthStore((state) => state.profile?.handle);
  const displayName = useAuthStore((state) => state.profile?.displayName);
  const { viewers } = useViewerCount();
  const [floats, setFloats] = useState<FloatingGiftItem[]>([]);
  const [faceGift, setFaceGift] = useState<ActiveFaceGift | null>(null);
  const stageVideoRef = useRef<HTMLDivElement>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [flipping, setFlipping] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [inviteHandle, setInviteHandle] = useState('');
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [reelNote, setReelNote] = useState<string | null>(null);
  const [lock, setLock] = useState<LockInfo | null>(null);
  const [lockPicker, setLockPicker] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [viewersList, setViewersList] = useState<{ identity: string; name: string }[]>([]);
  const [liveStats, setLiveStats] = useState<LiveSessionStats | null>(
    goalCoins || goalLabel
      ? {
          username,
          startedAt: new Date().toISOString(),
          goalCoins,
          goalLabel,
          coinsEarned: 0,
          topGifters: [],
        }
      : null,
  );
  const [withdrawOpen, setWithdrawOpen] = useState(false);
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
    void api<{ lock: LockInfo | null }>(
      `/api/stream/lock/${encodeURIComponent(username)}?handle=${encodeURIComponent(handle || username)}`,
    )
      .then((data) => setLock(data.lock))
      .catch(() => undefined);
  }, [isHost, username]);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      try {
        const data = await api<{ session: LiveSessionStats | null }>(
          `/api/stream/session/${encodeURIComponent(username)}`,
        );
        if (!cancelled && data.session) setLiveStats(data.session);
      } catch {
        // sesión opcional
      }
    }
    void loadSession();
    const timer = window.setInterval(() => void loadSession(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [username]);

  useEffect(() => {
    const applyGift = (giftId: string, id: string, senderName?: string) => {
      if (!giftId || !id) return;
      setFloats((current) => {
        if (current.some((item) => item.id === id)) return current;
        return [
          ...current.slice(-6),
          {
            id,
            giftId,
            left: 32 + Math.random() * 36,
            senderName,
          },
        ];
      });
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
    const onSocketGift = (payload: { id?: string; giftId?: string; senderName?: string }) => {
      if (!payload?.giftId || !payload.id) return;
      applyGift(payload.giftId, payload.id, payload.senderName);
    };

    room.on(RoomEvent.DataReceived, onData);
    window.addEventListener('liveboom:gift', onLocalGift);
    let cancelled = false;
    void getSocket()
      .then((socket) => {
        if (cancelled) return;
        socket.emit('join_room', username);
        socket.on('gift_received', onSocketGift);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      room.off(RoomEvent.DataReceived, onData);
      window.removeEventListener('liveboom:gift', onLocalGift);
      void getSocket()
        .then((socket) => socket.off('gift_received', onSocketGift))
        .catch(() => undefined);
    };
  }, [room, username]);

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
          giftId
            ? { roomName: username, giftId, handle }
            : { roomName: username, clear: true, handle },
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
      const pub = Array.from(room.localParticipant.videoTrackPublications.values()).find(
        (item) => item.source === Track.Source.Camera,
      );
      const track = (pub?.track || cameraTrackRef.current) as LocalVideoTrack | null;
      if (track && typeof track.restartTrack === 'function') {
        await track.restartTrack({
          facingMode: nextFacing,
          resolution: { width: 720, height: 1280, frameRate: 24 },
        });
        cameraTrackRef.current = track;
      } else {
        await room.localParticipant.setCameraEnabled(false);
        await room.localParticipant.setCameraEnabled(true, {
          facingMode: nextFacing,
          resolution: { width: 720, height: 1280, frameRate: 24 },
        });
        const nextPub = Array.from(room.localParticipant.videoTrackPublications.values()).find(
          (item) => item.source === Track.Source.Camera,
        );
        if (nextPub?.track && 'mediaStreamTrack' in nextPub.track) {
          cameraTrackRef.current = nextPub.track as LocalVideoTrack;
        }
      }
      setFacing(nextFacing);
    } catch (error) {
      console.error('[live] flip camera', error);
      setInviteNote('No se pudo cambiar la cámara. Prueba de nuevo.');
    } finally {
      setFlipping(false);
    }
  }, [canPublish, flipping, facing, room]);

  async function confirmLeave() {
    if (leaving) return;
    setLeaving(true);
    try {
      await onLeaveLive?.();
    } finally {
      setLeaving(false);
      setLeaveOpen(false);
      navigate('/', { replace: true });
    }
  }

  async function inviteGuest() {
    const guestHandle = inviteHandle.trim().replace(/^@/, '');
    if (!guestHandle) return;
    setInviteNote(null);
    try {
      await api('/api/stream/invite', {
        method: 'POST',
        body: JSON.stringify({ roomName: username, guestHandle, handle }),
      });
      await publishRoomData(room, {
        type: 'invite',
        guestHandle,
        hostName: displayName || handle || username,
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
            <CreatorVideo canPublish={canPublish} facing={facing} cameraTrackRef={cameraTrackRef} />
            <FaceMeshGiftOverlay active={faceGift} />
            {floats.map((item) => (
              <FloatingGift
                key={item.id}
                giftId={item.giftId}
                senderName={item.senderName}
                left={item.left}
                onComplete={() => setFloats((current) => current.filter((gift) => gift.id !== item.id))}
              />
            ))}
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
              <>
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
                {lock ? (
                  <button
                    type="button"
                    disabled={lockBusy}
                    onClick={() => void setLiveLock(null)}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500/25 px-2 py-1 text-[11px] font-semibold text-emerald-200 ring-1 ring-emerald-400/40 backdrop-blur"
                  >
                    <Unlock size={11} />
                    Reabrir live
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setWithdrawOpen(true)}
                  className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[11px] font-semibold text-cyan-200 backdrop-blur hover:text-white"
                >
                  <Coins size={11} />
                  Retirar {(liveStats?.coinsEarned || 0).toLocaleString('es-CO')}
                </button>
              </>
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
          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            {canPublish ? (
              <button
                type="button"
                onClick={() => void flipCamera()}
                disabled={flipping}
                className="grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 disabled:opacity-60 sm:h-9 sm:w-9"
                aria-label={facing === 'user' ? 'Cambiar a cámara trasera' : 'Cambiar a cámara frontal'}
                title={facing === 'user' ? 'Cámara trasera' : 'Cámara frontal'}
              >
                <SwitchCamera size={18} className={flipping ? 'animate-spin' : ''} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setLeaveOpen(true)}
              className="rounded-full bg-black/55 px-3 py-2 text-xs text-zinc-200 backdrop-blur hover:text-white"
            >
              Salir
            </button>
          </div>
        </div>
        {liveStats && (liveStats.goalCoins > 0 || liveStats.coinsEarned > 0) ? (
          <div className="pointer-events-none mt-3 max-w-sm">
            <p className="text-[10px] font-semibold text-white drop-shadow">
              {liveStats.goalLabel || 'Recaudado en esta sala'}
            </p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500"
                style={{
                  width: `${
                    liveStats.goalCoins > 0
                      ? Math.min(100, Math.round((liveStats.coinsEarned / liveStats.goalCoins) * 100))
                      : 100
                  }%`,
                }}
              />
            </div>
            <p className="mt-1 text-[10px] text-cyan-200">
              {liveStats.coinsEarned.toLocaleString('es-CO')}
              {liveStats.goalCoins > 0
                ? ` / ${liveStats.goalCoins.toLocaleString('es-CO')} coins`
                : ' coins'}
              {liveStats.topGifters[0]
                ? ` · Top: ${liveStats.topGifters[0].name}`
                : ''}
            </p>
          </div>
        ) : null}
      </div>
      {lockPicker && isHost ? (
        <div className="pointer-events-auto absolute left-3 top-[4.2rem] z-20 max-h-[50dvh] w-[min(100%,18rem)] overflow-y-auto rounded-2xl border border-amber-400/30 bg-zinc-950/95 p-3 shadow-xl sm:left-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-amber-300">
            Regalo para entrar
          </p>
          <p className="mb-2 text-[10px] text-zinc-400">
            Elige el regalo. Luego puedes reabrir el live cuando quieras.
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
              Quitar candado y reabrir live
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
      {withdrawOpen ? (
        <WithdrawModal
          initialCoins={liveStats?.coinsEarned || 0}
          onClose={() => setWithdrawOpen(false)}
        />
      ) : null}
      {canPublish ? (
        <button
          type="button"
          onClick={() => void flipCamera()}
          disabled={flipping}
          className="pointer-events-auto absolute bottom-[48dvh] right-3 z-30 grid h-12 w-12 place-items-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur ring-1 ring-white/20 lg:bottom-8 lg:right-6"
          aria-label={facing === 'user' ? 'Cambiar a cámara trasera' : 'Cambiar a cámara frontal'}
        >
          <SwitchCamera size={20} className={flipping ? 'animate-spin' : ''} />
        </button>
      ) : null}
      {leaveOpen ? (
        <div className="pointer-events-auto absolute inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-zinc-950 p-5 shadow-xl">
            <p className="text-base font-bold text-white">
              {isHost ? '¿Salir y terminar el live?' : '¿Salir del live?'}
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              {isHost
                ? 'Al confirmar se cierra la transmisión y el chat queda listo para una nueva.'
                : 'Puedes volver a entrar cuando quieras.'}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={leaving}
                onClick={() => setLeaveOpen(false)}
                className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/5 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={leaving}
                onClick={() => void confirmLeave()}
                className="flex-1 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 py-2.5 text-sm font-bold text-zinc-950 disabled:opacity-60"
              >
                {leaving ? 'Saliendo…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function waitConnected(room: ReturnType<typeof useRoomContext>, ms = 20000) {
  if (room.state === 'connected') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      room.off(RoomEvent.Connected, onOk);
      reject(new Error('Tiempo de espera agotado al conectar LiveKit'));
    }, ms);
    const onOk = () => {
      window.clearTimeout(timer);
      resolve();
    };
    room.once(RoomEvent.Connected, onOk);
  });
}

function CreatorVideo({
  canPublish,
  facing,
  cameraTrackRef,
}: {
  canPublish: boolean;
  facing: 'user' | 'environment';
  cameraTrackRef: React.MutableRefObject<LocalVideoTrack | null>;
}) {
  const room = useRoomContext();
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }]);
  const [camError, setCamError] = useState<string | null>(null);
  const [camBusy, setCamBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  const cameras = tracks
    .filter((track): track is TrackReference => Boolean(track.publication))
    .sort((a, b) => Number(a.participant.joinedAt) - Number(b.participant.joinedAt));
  const local = cameras.find((track) => track.participant.isLocal) || null;
  const remotes = cameras.filter((track) => !track.participant.isLocal);
  const main = local || remotes[0] || null;
  const guests = local ? remotes : remotes.slice(1);
  const lastMainRef = useRef<TrackReference | null>(null);
  if (main) lastMainRef.current = main;
  const shown = main ?? lastMainRef.current;

  useEffect(() => {
    if (!canPublish) return;
    let cancelled = false;

    async function attachCameraRef() {
      const pub = Array.from(room.localParticipant.videoTrackPublications.values()).find(
        (item) => item.source === Track.Source.Camera,
      );
      if (pub?.track && 'mediaStreamTrack' in pub.track) {
        cameraTrackRef.current = pub.track as LocalVideoTrack;
      }
    }

    async function publishMedia() {
      try {
        await waitConnected(room);
        if (cancelled) return;

        const alreadyOn = room.localParticipant.isCameraEnabled;
        // Si la cámara ya está al aire, no la vuelvas a pedir: al enviar un regalo
        // el saldo cambia y un republish dejaba la transmisión en negro.
        // Tampoco re-publicar al voltear (facing): eso lo hace flipCamera con restartTrack.
        if (alreadyOn && retry === 0) {
          if (!room.localParticipant.isMicrophoneEnabled) {
            await room.localParticipant.setMicrophoneEnabled(true);
          }
          await attachCameraRef();
          return;
        }

        setCamBusy(true);
        setCamError(null);
        await room.localParticipant.setCameraEnabled(true, {
          facingMode: facing,
          resolution: { width: 720, height: 1280, frameRate: 24 },
        });
        await room.localParticipant.setMicrophoneEnabled(true);
        await attachCameraRef();
        if (!cancelled) setCamError(null);
      } catch (err) {
        console.error('[live] publish camera', err);
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'No se pudo abrir la cámara';
          setCamError(
            /Permission|NotAllowed|Denied/i.test(msg)
              ? 'Permiso de cámara/micrófono denegado. Permite el acceso y reintenta.'
              : msg,
          );
        }
      } finally {
        if (!cancelled) setCamBusy(false);
      }
    }

    void publishMedia();
    return () => {
      cancelled = true;
    };
  }, [canPublish, facing, retry, room, cameraTrackRef]);

  if (!shown) {
    return (
      <div className="grid h-full w-full place-items-center gap-3 px-6 text-center text-sm text-zinc-400">
        <p>
          {canPublish
            ? camBusy
              ? 'Activando tu cámara…'
              : camError || 'Preparando transmisión…'
            : 'Esperando la cámara del creador…'}
        </p>
        {canPublish && camError ? (
          <button
            type="button"
            onClick={() => setRetry((n) => n + 1)}
            className="rounded-full bg-cyan-500 px-4 py-2 text-xs font-bold text-zinc-950"
          >
            Reintentar cámara
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <VideoTrack trackRef={shown} className="absolute inset-0 h-full w-full object-cover" />
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
      {canPublish && camError ? (
        <div className="absolute inset-x-0 bottom-24 z-20 flex justify-center px-3">
          <button
            type="button"
            onClick={() => setRetry((n) => n + 1)}
            className="rounded-full bg-fuchsia-600/90 px-3 py-1.5 text-[11px] font-bold text-white"
          >
            Cámara con error · Reintentar
          </button>
        </div>
      ) : null}
    </>
  );
}

function ChatPanel({
  roomName,
  canPublish,
  onAcceptInvite,
}: {
  roomName: string;
  canPublish: boolean;
  onAcceptInvite?: () => void;
}) {
  const room = useRoomContext();
  const profile = useAuthStore((state) => state.profile);
  const coins = profile?.coinsBalance ?? 0;
  const setCoins = useAuthStore((state) => state.setCoins);
  const [messages, setMessages] = useState<ChatMessage[]>(() => liveChatCache.get(roomName) ?? []);
  const [text, setText] = useState('');
  const [openGifts, setOpenGifts] = useState(false);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [sendingGift, setSendingGift] = useState<string | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeNeeded, setRechargeNeeded] = useState<number | null>(null);
  const [inviteBanner, setInviteBanner] = useState<string | null>(null);
  const [pinnedBottom, setPinnedBottom] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>((liveChatCache.get(roomName) ?? []).map((msg) => msg.id)));

  function rememberMessages(next: ChatMessage[]) {
    liveChatCache.set(roomName, next);
    return next;
  }

  function pushMessage(message: ChatMessage) {
    if (seen.current.has(message.id)) return;
    seen.current.add(message.id);
    setMessages((current) => rememberMessages([...current.slice(-400), message]));
  }

  function persistChatCopy(message: ChatMessage) {
    void api(`/api/stream/chat/${encodeURIComponent(roomName)}`, {
      method: 'POST',
      body: JSON.stringify(message),
    }).catch(() => undefined);
  }

  useEffect(() => {
    const unsub = listenLiveChat(roomName, (list) => {
      const mapped = list.map((msg) => ({
        id: msg.id,
        author: msg.author,
        text: msg.text,
        gift: msg.gift || undefined,
      }));
      setMessages((current) => {
        if (!mapped.length && current.length) return current;
        seen.current = new Set(mapped.map((msg) => msg.id));
        return rememberMessages(mapped);
      });
    });
    void api<{
      messages?: Array<{
        id: string;
        author: string;
        text: string;
        gift?: ChatMessage['gift'];
      }>;
    }>(`/api/stream/chat/${encodeURIComponent(roomName)}`)
      .then((data) => {
        const incoming = data.messages || [];
        if (!incoming.length) return;
        setMessages((current) => {
          if (current.length) return current;
          incoming.forEach((msg) => seen.current.add(msg.id));
          return rememberMessages(
            incoming.map((msg) => ({
              id: msg.id,
              author: msg.author,
              text: msg.text,
              gift: msg.gift,
            })),
          );
        });
      })
      .catch(() => undefined);
    return unsub;
  }, [roomName]);

  useEffect(() => {
    return listenLiveGifts(roomName, (gift) => {
      pushMessage({
        id: `gift-${gift.id}`,
        author: gift.senderName,
        text: `envió ${gift.giftName}`,
        gift: { giftId: gift.giftId, emoji: gift.emoji, name: gift.giftName },
      });
      window.dispatchEvent(
        new CustomEvent('liveboom:gift', {
          detail: { id: gift.id, giftId: gift.giftId, senderName: gift.senderName },
        }),
      );
    });
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
    if (!value || !profile) return;
    const author = profile.displayName || profile.handle || 'Liveboomer';
    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author,
      text: value,
    };
    pushMessage(message);
    setText('');
    persistChatCopy(message);
    void publishLiveChatMessage(roomName, {
      clientId: message.id,
      authorUid: profile.firebaseUid,
      author,
      text: value,
    }).catch((error) => console.error('[chat] firestore', error));
    try {
      await publishRoomData(room, { type: 'chat', ...message });
    } catch (error) {
      console.error('[chat] publishData', error);
    }
  }

  async function sendGift(giftId: string) {
    if (sendingGift) return;
    const catalog = findLiveGift(giftId);
    if (!catalog) return;
    if (!profile) {
      setGiftError('Inicia sesión para enviar regalos');
      return;
    }
    if (coins < catalog.coins) {
      setGiftError('Saldo insuficiente. Recarga coins para continuar.');
      setRechargeNeeded(catalog.coins);
      setOpenGifts(true);
      return;
    }

    setGiftError(null);
    setRechargeNeeded(null);
    setSendingGift(giftId);
    setOpenGifts(false);
    const previousCoins = coins;
    setCoins(coins - catalog.coins);

    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const senderName = profile.displayName || profile.handle || 'Liveboomer';
    const chatGift = {
      id: `gift-${clientId}`,
      author: senderName,
      text: `envió ${catalog.name}`,
      gift: { giftId: catalog.id, emoji: catalog.emoji, name: catalog.name },
    };

    pushMessage(chatGift);
    persistChatCopy(chatGift);
    window.dispatchEvent(
      new CustomEvent('liveboom:gift', {
        detail: { id: clientId, giftId: catalog.id, senderName },
      }),
    );
    void publishRoomData(room, {
      type: 'gift',
      id: clientId,
      giftId: catalog.id,
      senderName,
      giftName: catalog.name,
      emoji: catalog.emoji,
    }).catch((error) => console.error('[gift] publishData', error));
    void publishLiveGift(roomName, {
      clientId,
      giftId: catalog.id,
      giftName: catalog.name,
      emoji: catalog.emoji,
      senderName,
      senderUid: profile.firebaseUid,
      coins: catalog.coins,
    }).catch((error) => console.error('[gift] firestore', error));
    void publishLiveChatMessage(roomName, {
      clientId: chatGift.id,
      authorUid: profile.firebaseUid,
      author: senderName,
      text: chatGift.text,
      gift: chatGift.gift,
    }).catch((error) => console.error('[gift] chat-history', error));

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
        body: JSON.stringify({ giftId: catalog.id, roomName, clientId }),
      });
      setCoins(result.senderBalance);
    } catch (err) {
      setCoins(previousCoins);
      const message = err instanceof Error ? err.message : 'No se pudo enviar el regalo';
      setGiftError(message);
      setOpenGifts(true);
      if (/insuficiente|saldo|402/i.test(message)) setRechargeNeeded(catalog.coins);
    } finally {
      setSendingGift(null);
    }
  }

  return (
    <aside
      className={`z-20 flex min-h-0 min-w-0 flex-col overflow-hidden border-white/10 lg:static lg:h-auto lg:max-h-none lg:w-[30%] lg:min-w-[260px] lg:rounded-2xl lg:border ${
        canPublish
          ? 'pointer-events-none absolute inset-x-0 bottom-0 h-[44dvh] border-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent lg:pointer-events-auto lg:relative lg:inset-auto lg:bg-black/10 lg:backdrop-blur-[2px]'
          : 'relative h-[40dvh] border-t bg-zinc-900/95 lg:border-t-0 lg:bg-zinc-800/45 lg:backdrop-blur-xl'
      }`}
    >
      <div className={`pointer-events-auto shrink-0 px-4 py-2 ${canPublish ? 'bg-transparent' : 'border-b border-white/10'}`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className={`text-sm font-bold ${canPublish ? 'text-white drop-shadow' : 'text-white'}`}>
            Chat en vivo
          </h2>
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
      <div className="pointer-events-auto relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={onChatScroll}
          className="chat-scroll h-full space-y-2 overflow-y-scroll overscroll-contain px-3 py-3"
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
                  <span className="font-semibold text-cyan-300">{message.author}</span>
                  {' envió '}
                  {message.gift.name}
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
      <div className={`pointer-events-auto relative shrink-0 space-y-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${canPublish ? 'bg-gradient-to-t from-black/70 to-transparent' : 'border-t border-white/10'}`}>
        {openGifts ? (
          <div className="absolute bottom-[4.75rem] left-2 right-2 z-50 max-h-[min(42dvh,18rem)] overflow-y-auto rounded-2xl border border-white/15 bg-zinc-950 p-3 shadow-[0_0_28px_rgba(255,0,85,0.25)] sm:left-3 sm:right-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Caja de regalos
              </p>
              <button
                type="button"
                onClick={() => {
                  setOpenGifts(false);
                  setGiftError(null);
                  setRechargeNeeded(null);
                }}
                className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white"
                aria-label="Cerrar regalos"
              >
                <X size={16} />
              </button>
            </div>
            {([1, 2, 3, 4, 5] as const).map((level) => {
              const group = LIVEBOOM_GIFTS.filter((g) => g.level === level);
              if (!group.length) return null;
              return (
                <div key={level} className="mb-2">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    Nivel {level} · {GIFT_LEVEL_FX[level].label}
                  </p>
                  <div className="gift-row flex snap-x snap-mandatory gap-1 overflow-x-auto overflow-y-hidden pb-1">
                    {group.map((gift) => (
                      <button
                        key={gift.id}
                        type="button"
                        disabled={Boolean(sendingGift)}
                        onClick={() => void sendGift(gift.id)}
                        className={`flex w-[4.35rem] shrink-0 snap-start flex-col items-center justify-center rounded-lg border px-0.5 py-1.5 text-center transition disabled:opacity-50 ${
                          sendingGift === gift.id
                            ? 'border-cyan-400 bg-cyan-500/20'
                            : 'border-zinc-800 bg-zinc-900 hover:border-cyan-400 hover:bg-zinc-800'
                        }`}
                      >
                        <span className="text-xl leading-none">{gift.emoji}</span>
                        <span className="mt-0.5 w-full truncate text-[8px] font-semibold text-white">
                          {gift.name}
                        </span>
                        <span className="text-[9px] text-cyan-400">{gift.coins.toLocaleString('es-CO')}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {giftError ? <p className="mt-2 text-xs text-fuchsia-400">{giftError}</p> : null}
            {rechargeNeeded != null && coins < rechargeNeeded ? (
              <RechargeButton onClick={() => setRechargeOpen(true)} className="mt-2 w-full text-sm" />
            ) : null}
          </div>
        ) : null}
        {sendingGift ? (
          <p className="text-[11px] font-semibold text-cyan-300">Enviando regalo… ya va en el chat.</p>
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
            className="h-11 flex-1 rounded-xl bg-zinc-900 px-3 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-zinc-300"
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
      </div>
      {rechargeOpen ? <CoinModal onClose={() => setRechargeOpen(false)} /> : null}
    </aside>
  );
}
