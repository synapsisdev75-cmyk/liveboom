import '@livekit/components-styles';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useLocalParticipant,
  useRoomContext,
  useTracks,
  type TrackReference,
} from '@livekit/components-react';
import {
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
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
  Share2,
  SwitchCamera,
  Unlock,
  UserPlus,
  Users,
  User,
  Video,
  X,
  Megaphone,
  Mic,
  MicOff,
  MonitorUp,
  MessageCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { FloatingGift, GiftIcon } from '../components/live/FloatingGift';
import { GiftBoxStrip } from '../components/live/GiftBoxStrip';
import { FaceMeshGiftOverlay, type ActiveFaceGift } from '../components/live/FaceMeshGiftOverlay';
import { ScreenShareHostOverlay } from '../components/live/ScreenShareHostOverlay';
import { CoinModal, RechargeButton } from '../components/wallet/CoinModal';
import { WithdrawModal } from '../components/wallet/WithdrawModal';
import { api, apiPublic, ApiError } from '../lib/api';
import { roomKey } from '../lib/roomKey';
import { isFaceAnchoredGift } from '../lib/faceGiftAnchors';
import {
  listenLiveGifts,
  listenLiveRoomEarnings,
  publishLiveGift,
  listenLiveChat,
  publishLiveChatMessage,
  resetLiveRoomChat,
  markLiveRoomActive,
  markLiveRoomEnded,
  updateLiveRoomFeed,
  touchLiveRoomHeartbeat,
  listenLiveRoomViewerCount,
  listenLiveViewers,
  refreshLiveViewerCount,
  listenLiveRoomStatus,
  archiveLiveActivity,
  notifyNetworkImLive,
  setLiveWishlist,
  listenLiveWishlist,
} from '../lib/liveGiftsFirestore';
import { useLivePresence } from '../hooks/useLivePresence';
import { chatAuthorClass } from '../lib/chatAuthorStyle';
import { downloadReelBlob, savePendingReel } from '../lib/pendingReelStore';
import { addFirestoreCoins, addLevelXp, fetchLevelXp, profileHref, setFirestoreCoins } from '../lib/profileFirestore';
import { shareContent } from '../lib/shareContent';
import { listFollowers, listFriends } from '../lib/socialFirestore';
import { sendLiveboomGift } from '../lib/giftsFirestore';
import {
  canUseDisplayMedia,
  defaultPipPosition,
  LiveScreenComposer,
  readScreenTrackDimensions,
  screenShareStatusMessage,
  type PipNormalizedPos,
} from '../lib/liveScreenComposer';
import {
  DEFAULT_LIVE_ASPECT_RATIO,
  liveCanvasDimensions,
  liveStageInnerClass,
  liveStageOuterClass,
  parseLiveAspectRatio,
  type LiveAspectRatio,
} from '../lib/liveAspectRatio';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { levelFromXp } from '../lib/userLevels';
import { GIFT_LEVEL_FX, findLiveGift, sortedLiveboomGiftCatalog } from '../lib/liveboomGifts';
import { getSocket } from '../lib/socket';
import { useAuthStore } from '../store/authStore';

type LockInfo = {
  giftId: string;
  giftName: string;
  coins: number;
  emoji: string;
};

type FloatingGiftItem = { id: string; giftId: string; left: number; senderName?: string; combo?: number };

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
  aspectRatio?: LiveAspectRatio;
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
  authorUid?: string;
  text: string;
  gift?: { giftId: string; emoji: string; name: string };
  levelBadge?: string;
};

const liveChatCache = new Map<string, ChatMessage[]>();

function clearLiveChatCache(roomName: string) {
  liveChatCache.delete(roomName.trim().toLowerCase());
  liveChatCache.delete(roomName);
}

type SuggestedLive = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  title: string;
  viewers: number;
  isPrivate?: boolean;
  _friend?: boolean;
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
      multiplier?: number;
    }
  | { type: 'invite'; guestHandle: string; hostName: string }
  | { type: 'lock'; lock: LockInfo | null }
  | { type: 'live_ended'; hostName?: string }
  | {
      type: 'viewer_join';
      id: string;
      name: string;
      level: number;
      badge: string;
    };

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

function useViewerCount(roomName: string) {
  const [viewers, setViewers] = useState(0);

  useEffect(() => {
    if (!roomName) return;
    return listenLiveRoomViewerCount(roomName, setViewers);
  }, [roomName]);

  return { viewers };
}

export function LiveRoom() {
  const { username } = useParams();
  const location = useLocation();
  const launch = (location.state as LiveLaunchState | null) || {};
  const ready = useAuthStore((state) => state.ready);
  const firebaseUid = useAuthStore((state) => state.profile?.firebaseUid);
  const handle = useAuthStore((state) => state.profile?.handle);
  const setCoins = useAuthStore((state) => state.setCoins);
  const canonicalRoom = username ? roomKey(username) : '';
  const activeRoomRef = useRef(canonicalRoom);
  const livekitRoom = useMemo(() => new Room(LIVEKIT_ROOM_OPTIONS), [canonicalRoom]);
  const [session, setSession] = useState<{
    token: string;
    serverUrl: string;
    canPublish: boolean;
    isHost?: boolean;
    roomName: string;
    hostUid?: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveStarted, setLiveStarted] = useState(false);
  const [isPrivate, setIsPrivate] = useState(Boolean(launch.isPrivate));
  const [gateLock, setGateLock] = useState<LockInfo | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [viewerPaused, setViewerPaused] = useState(false);
  const aspectRatioLockedRef = useRef<LiveAspectRatio>(
    launch.aspectRatio ? parseLiveAspectRatio(launch.aspectRatio) : DEFAULT_LIVE_ASPECT_RATIO,
  );
  const [aspectRatio, setAspectRatio] = useState<LiveAspectRatio>(aspectRatioLockedRef.current);

  const handleViewerPaused = useCallback((paused: boolean, lock: LockInfo | null) => {
    setViewerPaused(paused);
    if (paused && lock) setGateLock(lock);
    if (!paused) setGateLock(null);
  }, []);

  const isOwnRoom =
    Boolean(handle && username) && roomKey(handle!) === canonicalRoom;
  const needsLaunchConfirm = isOwnRoom && !launch.goLive && !liveStarted;

  useEffect(() => {
    activeRoomRef.current = canonicalRoom;
    setSession(null);
    setError(null);
    setGateLock(null);
    setViewerPaused(false);
    setLiveStarted(false);
  }, [canonicalRoom]);

  useEffect(() => {
    return () => {
      void livekitRoom.disconnect();
    };
  }, [livekitRoom]);

  useEffect(() => {
    if (launch.aspectRatio || !canonicalRoom) return;
    return onSnapshot(doc(db, 'liveRooms', canonicalRoom), (snap) => {
      const raw = snap.data()?.aspectRatio;
      if (!raw) return;
      const parsed = parseLiveAspectRatio(raw);
      aspectRatioLockedRef.current = parsed;
      setAspectRatio(parsed);
    });
  }, [canonicalRoom, launch.aspectRatio]);

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
      await markLiveRoomActive(username, profile.firebaseUid, {
        displayName: profile.displayName || profile.handle,
        avatarUrl: profile.avatarUrl,
        title: launch.title || `Live de ${profile.displayName || profile.handle}`,
        category: launch.category || profile.category || 'otro',
        isPrivate: Boolean(launch.isPrivate ?? isPrivate),
        aspectRatio: aspectRatioLockedRef.current,
      }).catch((error) =>
        console.error('[live] mark active', error),
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
          aspectRatio: aspectRatioLockedRef.current,
        }),
      }).catch(() => undefined);
      setLiveStarted(true);
      if (typeof launch.isPrivate === 'boolean') setIsPrivate(launch.isPrivate);
    }
    const targetRoom = canonicalRoom;
    if (!targetRoom) return;
    const tokenHandle = encodeURIComponent(profile.handle);
    const data = await api<{
      token: string;
      serverUrl: string;
      canPublish: boolean;
      isHost?: boolean;
      roomName?: string;
      hostUid?: string | null;
    }>(`/api/stream/token/${encodeURIComponent(username)}?handle=${tokenHandle}`);
    if (activeRoomRef.current !== targetRoom) return;
    setSession((current) => {
      const next = {
        token: data.token,
        serverUrl: data.serverUrl,
        canPublish: data.canPublish,
        isHost: data.isHost,
        roomName: data.roomName || targetRoom,
        hostUid: data.hostUid ?? null,
      };
      if (
        current &&
        current.token === next.token &&
        current.canPublish === next.canPublish &&
        current.serverUrl === next.serverUrl &&
        current.roomName === next.roomName
      ) {
        return current;
      }
      return next;
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
    const lockInfo = gateLock;
    setUnlocking(true);
    setError(null);
    try {
      const result = await api<{
        senderBalance?: number;
        gift?: { id: string; name: string; emoji: string; coins: number };
      }>('/api/stream/unlock', {
        method: 'POST',
        body: JSON.stringify({
          roomName: username,
          currentBalance: useAuthStore.getState().profile?.coinsBalance ?? 0,
        }),
      });
      if (typeof result.senderBalance === 'number') setCoins(result.senderBalance);
      const profile = useAuthStore.getState().profile;
      const giftMeta = result.gift || (lockInfo
        ? {
            id: lockInfo.giftId,
            name: lockInfo.giftName,
            emoji: lockInfo.emoji,
            coins: lockInfo.coins,
          }
        : null);
      if (profile && giftMeta) {
        void publishLiveGift(username, {
          clientId: `unlock-${Date.now()}`,
          giftId: giftMeta.id,
          giftName: giftMeta.name,
          emoji: giftMeta.emoji,
          senderName: profile.displayName || profile.handle || 'Liveboomer',
          senderUid: profile.firebaseUid,
          coins: giftMeta.coins,
        }).catch(() => undefined);
      }
      setGateLock(null);
      setViewerPaused(false);
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
        void markLiveRoomEnded(username).catch(() => undefined);
        void api('/api/stream/live/stop', {
          method: 'POST',
          body: JSON.stringify({ username }),
        }).catch(() => undefined);
      }
    };
  }, [liveStarted, username, isOwnRoom]);

  // Cierre al cerrar pestaña / refrescar (más fiable que solo unmount).
  useEffect(() => {
    if (!liveStarted || !username || !isOwnRoom) return;
    const endLive = () => {
      void markLiveRoomEnded(username).catch(() => undefined);
    };
    window.addEventListener('pagehide', endLive);
    window.addEventListener('beforeunload', endLive);
    return () => {
      window.removeEventListener('pagehide', endLive);
      window.removeEventListener('beforeunload', endLive);
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
            El live pasó a <strong className="text-amber-300">privado</strong>. Envía{' '}
            <strong className="text-amber-300">{gateLock.giftName}</strong> (
            {gateLock.coins.toLocaleString('es-CO')} coins) para ver. El público queda en pausa.
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
  if (!session || session.roomName !== canonicalRoom) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-zinc-950 text-sm text-zinc-400">
        Conectando LiveKit…
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-zinc-950 p-0 sm:p-3">
      <LiveKitRoom
        key={`${session.roomName}-${session.canPublish ? 'pub' : 'sub'}`}
        room={livekitRoom}
        token={session.token}
        serverUrl={session.serverUrl}
        connect
        video={false}
        audio={false}
        className="relative flex h-full w-full min-h-0 flex-col lg:flex-row lg:gap-3"
      >
        {viewerPaused ? null : <RoomAudioRenderer />}
        <CreatorStage
          username={username!}
          hostUid={session.hostUid || undefined}
          canPublish={session.canPublish}
          isHost={Boolean(session.isHost ?? (session.canPublish && isOwnRoom))}
          isPrivate={isPrivate}
          aspectRatio={aspectRatio}
          onPrivacyChange={setIsPrivate}
          onViewerPaused={handleViewerPaused}
          goalCoins={Number(launch.goalCoins) || 0}
          goalLabel={launch.goalLabel || ''}
          onLeaveLive={async () => {
            if (isOwnRoom) {
              clearLiveChatCache(username);
              await Promise.all([
                markLiveRoomEnded(username).catch(() => undefined),
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
          isHostRoom={isOwnRoom}
          onAcceptInvite={() => void fetchToken()}
        />
      </LiveKitRoom>
    </div>
  );
}

function CreatorStage({
  username,
  hostUid,
  canPublish,
  isHost,
  isPrivate,
  aspectRatio,
  onPrivacyChange,
  onViewerPaused,
  goalCoins,
  goalLabel,
  onLeaveLive,
}: {
  username: string;
  hostUid?: string;
  canPublish: boolean;
  isHost: boolean;
  isPrivate: boolean;
  aspectRatio: LiveAspectRatio;
  onPrivacyChange?: (next: boolean) => void;
  onViewerPaused?: (paused: boolean, lock: LockInfo | null) => void;
  goalCoins: number;
  goalLabel: string;
  onLeaveLive?: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const room = useRoomContext();
  const { isMicrophoneEnabled } = useLocalParticipant();
  const handle = useAuthStore((state) => state.profile?.handle);
  const displayName = useAuthStore((state) => state.profile?.displayName);
  const firebaseUid = useAuthStore((state) => state.profile?.firebaseUid);
  const setCoins = useAuthStore((state) => state.setCoins);
  const { viewers } = useViewerCount(username);
  const liveStartedAt = useRef(Date.now());
  const creditedGifts = useRef(new Set<string>());
  const [floats, setFloats] = useState<FloatingGiftItem[]>([]);
  const [faceGift, setFaceGift] = useState<ActiveFaceGift | null>(null);
  const giftComboRef = useRef<{ key: string; count: number; at: number }>({ key: '', count: 0, at: 0 });
  const stageVideoRef = useRef<HTMLDivElement>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [flipping, setFlipping] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [liveNeighbors, setLiveNeighbors] = useState<SuggestedLive[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const peakViewersRef = useRef(0);
  const onViewerPausedRef = useRef(onViewerPaused);
  onViewerPausedRef.current = onViewerPaused;
  const isSpectator = !isHost && !canPublish;
  const presenceUser = useMemo(
    () =>
      firebaseUid
        ? {
            uid: firebaseUid,
            username: handle || firebaseUid,
            displayName: displayName || handle || 'Espectador',
          }
        : null,
    [firebaseUid, handle, displayName],
  );
  useLivePresence(username, room, presenceUser, isSpectator);
  const [inviteHandle, setInviteHandle] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [reelNote, setReelNote] = useState<string | null>(null);
  const [screenSharing, setScreenSharing] = useState(false);
  const [pipVisible, setPipVisible] = useState(true);
  const [pipPos, setPipPos] = useState<PipNormalizedPos>(() => {
    const dims = liveCanvasDimensions(aspectRatio);
    return defaultPipPosition(dims.width, dims.height);
  });
  const screenComposerRef = useRef<LiveScreenComposer | null>(null);
  const rawCameraTrackRef = useRef<LocalVideoTrack | null>(null);
  const compositeTrackRef = useRef<LocalVideoTrack | null>(null);
  const screenMediaTrackRef = useRef<MediaStreamTrack | null>(null);
  const pipInputTrackRef = useRef<MediaStreamTrack | null>(null);
  const stoppingScreenRef = useRef(false);
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
  const [liveEnded, setLiveEnded] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedLive[]>([]);
  const hadHostCamera = useRef(false);
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

  // Pulso periódico: el feed cierra salas sin heartbeat.
  useEffect(() => {
    if (!isHost || !username) return;
    void touchLiveRoomHeartbeat(username).catch(() => undefined);
    void refreshLiveViewerCount(username).catch(() => undefined);
    const timer = window.setInterval(() => {
      void touchLiveRoomHeartbeat(username).catch(() => undefined);
      void refreshLiveViewerCount(username).catch(() => undefined);
    }, 12_000);
    return () => window.clearInterval(timer);
  }, [isHost, username]);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      try {
        const data = await api<{ session: LiveSessionStats | null }>(
          `/api/stream/session/${encodeURIComponent(username)}`,
        );
        if (cancelled || !data.session) return;
        // Nunca bajar la recaudación: el API en memoria puede ir atrasado vs Firestore.
        setLiveStats((current) => {
          const incoming = data.session!;
          if (!current) return incoming;
          return {
        ...current,
            goalCoins: Math.max(current.goalCoins || 0, incoming.goalCoins || 0) || current.goalCoins,
            goalLabel: current.goalLabel || incoming.goalLabel || '',
            startedAt: current.startedAt || incoming.startedAt,
            coinsEarned: Math.max(current.coinsEarned || 0, incoming.coinsEarned || 0),
            topGifters:
              (current.coinsEarned || 0) >= (incoming.coinsEarned || 0)
                ? current.topGifters
                : incoming.topGifters || current.topGifters,
          };
        });
      } catch {
        // sesión opcional
      }
    }
    void loadSession();
    const timer = window.setInterval(() => void loadSession(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [username]);

  // Fuente de verdad durable: recaudación en Firestore (no se pierde ni se pisa).
  useEffect(() => {
    return listenLiveRoomEarnings(username, ({ coinsEarned, topGifters }) => {
      setLiveStats((current) => {
        const base =
          current ||
          ({
            username,
            startedAt: new Date(liveStartedAt.current).toISOString(),
            goalCoins,
            goalLabel,
            coinsEarned: 0,
            topGifters: [],
          } satisfies LiveSessionStats);
        return {
          ...base,
          coinsEarned: Math.max(base.coinsEarned || 0, coinsEarned),
          topGifters: topGifters.length ? topGifters : base.topGifters,
        };
      });
    });
  }, [username, goalCoins, goalLabel]);

  useEffect(() => {
    const applyGift = (giftId: string, id: string, senderName?: string, multiplier?: number) => {
      if (!giftId || !id) return;
      const catalogGift = findLiveGift(giftId);
      const isVideo = Boolean(catalogGift?.video);
      const comboKey = `${senderName || 'anon'}::${giftId}`;
      const now = Date.now();
      const explicit = [1, 2, 4, 8].includes(Math.floor(Number(multiplier) || 0))
        ? Math.floor(Number(multiplier))
        : 0;
      let combo = explicit > 1 ? explicit : 1;
      if (giftComboRef.current.key === comboKey && now - giftComboRef.current.at < 4500) {
        combo = Math.max(combo, giftComboRef.current.count + (explicit > 1 ? explicit : 1));
      }
      giftComboRef.current = { key: comboKey, count: combo, at: now };

      setFloats((current) => {
        if (current.some((item) => item.id === id)) return current;
        if (isVideo) {
          const withoutVideos = current.filter((item) => !findLiveGift(item.giftId)?.video);
          return [
            ...withoutVideos,
            {
              id,
              giftId,
              left: 32 + Math.random() * 36,
              senderName,
              combo,
            },
          ];
        }
        const maxVisible = isSpectator ? 2 : 4;
        return [
        ...current,
        {
          id,
          giftId,
            left: 32 + Math.random() * 36,
          senderName,
            combo,
        },
        ].slice(-maxVisible);
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

    const unsubGifts = listenLiveGifts(username, (gift) => {
      applyGift(gift.giftId, gift.id, gift.senderName, gift.multiplier);
    });
    const onData = (payload: Uint8Array) => {
      const data = parseRoomData(payload);
      if (!data) return;
      if (data.type === 'gift' && !isSpectator) {
        applyGift(data.giftId, data.id, data.senderName, data.multiplier);
      }
      // No mostrar quién entra/sale de la sala en pantalla.
      if (data.type === 'lock') {
        setLock(data.lock);
        if (isSpectator) {
          if (data.lock) {
            onViewerPausedRef.current?.(true, data.lock);
          } else {
            onViewerPausedRef.current?.(false, null);
          }
        }
      }
      if (data.type === 'live_ended' && isSpectator) {
        setLiveEnded(true);
      }
    };
    const onLocalGift = (event: Event) => {
      const detail = (
        event as CustomEvent<{ id: string; giftId: string; senderName?: string; multiplier?: number }>
      ).detail;
      if (!detail?.giftId) return;
      applyGift(detail.giftId, detail.id, detail.senderName, detail.multiplier);
    };
    const onSocketGift = (payload: {
      id?: string;
      giftId?: string;
      senderName?: string;
      multiplier?: number;
    }) => {
      if (!payload?.giftId || !payload.id) return;
      applyGift(payload.giftId, payload.id, payload.senderName, payload.multiplier);
    };

    room.on(RoomEvent.DataReceived, onData);
    window.addEventListener('liveboom:gift', onLocalGift);
    let cancelled = false;
    void getSocket()
      .then((socket) => {
        if (cancelled) return;
        socket.emit('join_room', username);
        if (!isSpectator) {
          socket.on('gift_received', onSocketGift);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      unsubGifts();
      room.off(RoomEvent.DataReceived, onData);
      window.removeEventListener('liveboom:gift', onLocalGift);
      void getSocket()
        .then((socket) => {
          socket.off('gift_received', onSocketGift);
          socket.emit('leave_room', username);
        })
        .catch(() => undefined);
    };
  }, [room, username, isHost, canPublish, isSpectator]);

  useEffect(() => {
    if (!faceGift) return;
    const ms = Math.max(250, faceGift.endsAt - Date.now());
    const timer = window.setTimeout(() => setFaceGift(null), ms);
    return () => window.clearTimeout(timer);
  }, [faceGift?.id, faceGift?.endsAt]);

  useEffect(() => {
    if (isHost || canPublish) return;
    return listenLiveRoomStatus(username, (status) => {
      if (status !== 'ended') return;
      // No echar al espectador si aún ve la cámara del host (falsos "ended" del feed).
      const remoteCams = Array.from(room.remoteParticipants.values()).some((participant) =>
        Array.from(participant.videoTrackPublications.values()).some(
          (pub) =>
            pub.source === Track.Source.Camera &&
            !pub.isMuted &&
            Boolean(pub.track),
        ),
      );
      if (!remoteCams) setLiveEnded(true);
    });
  }, [username, isHost, canPublish, room]);

  // Host: pulso también desde la sala (por si el stage se remonta).
  useEffect(() => {
    if (!isHost || !username) return;
    void touchLiveRoomHeartbeat(username).catch(() => undefined);
    const timer = window.setInterval(() => {
      void touchLiveRoomHeartbeat(username).catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [isHost, username]);

  useEffect(() => {
    if (isHost || canPublish || liveEnded) return;
    let cancelled = false;
    const check = async () => {
      try {
        const data = await apiPublic<{ streams?: SuggestedLive[] }>('/api/stream/live');
        if (cancelled) return;
        const active = (data.streams || []).some(
          (stream) => stream.username.toLowerCase() === username.toLowerCase(),
        );
        const remoteCams = Array.from(room.remoteParticipants.values()).some((participant) =>
          Array.from(participant.videoTrackPublications.values()).some(
            (pub) =>
              pub.source === Track.Source.Camera &&
              !pub.isMuted &&
              Boolean(pub.track) &&
              pub.track?.mediaStreamTrack?.readyState === 'live',
          ),
        );
        if (remoteCams) hadHostCamera.current = true;
        // Durante un flip la cámara puede faltar un instante; no marcar live terminado.
        if (hadHostCamera.current && !active && !remoteCams) {
          await new Promise((resolve) => window.setTimeout(resolve, 2500));
          if (cancelled) return;
          const stillRemote = Array.from(room.remoteParticipants.values()).some((participant) =>
            Array.from(participant.videoTrackPublications.values()).some(
              (pub) =>
                pub.source === Track.Source.Camera &&
                !pub.isMuted &&
                Boolean(pub.track) &&
                pub.track?.mediaStreamTrack?.readyState === 'live',
            ),
          );
          if (!stillRemote && !active) setLiveEnded(true);
        }
      } catch {
        // ignore
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [username, isHost, canPublish, liveEnded, room]);

  useEffect(() => {
    if (!liveEnded && !summaryOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const [friendsRes, allRes] = await Promise.all([
          api<{ streams?: SuggestedLive[] }>('/api/stream/friends-live').catch(() => ({
            streams: [] as SuggestedLive[],
          })),
          apiPublic<{ streams?: SuggestedLive[] }>('/api/stream/live').catch(() => ({
            streams: [] as SuggestedLive[],
          })),
        ]);
        if (cancelled) return;
        const self = username.toLowerCase();
        const friendLives = (friendsRes.streams || [])
          .filter((stream) => stream.username.toLowerCase() !== self)
          .map((stream) => ({
            username: stream.username,
            displayName: stream.displayName || stream.username,
            avatarUrl: stream.avatarUrl || null,
            title: stream.title || `Live de ${stream.displayName || stream.username}`,
            viewers: Number(stream.viewers || 0),
            _friend: true as const,
          }));
        const friendNames = new Set(friendLives.map((s) => s.username.toLowerCase()));
        const others = (allRes.streams || [])
          .filter(
            (stream) =>
              stream.username.toLowerCase() !== self &&
              !friendNames.has(stream.username.toLowerCase()),
          )
          .map((stream) => ({
            username: stream.username,
            displayName: stream.displayName || stream.username,
            avatarUrl: stream.avatarUrl || null,
            title: stream.title || `Live de ${stream.displayName || stream.username}`,
            viewers: Number(stream.viewers || 0),
            _friend: false as const,
          }));
        setSuggestions([...friendLives, ...others].slice(0, 8));
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liveEnded, summaryOpen, username]);

  useEffect(() => {
    if (!isHost) return;
    return listenLiveViewers(username, (list) => {
      setViewersList(
        list.map((viewer) => ({
          identity: viewer.uid,
          name: viewer.displayName || viewer.username,
        })),
      );
    });
  }, [isHost, username]);

  async function setLiveLock(giftId: string | null) {
    if (!isHost) return;
    setLockBusy(true);
    try {
      const result = await api<{ lock: LockInfo | null; locked: boolean; isPrivate?: boolean }>(
        '/api/stream/lock',
        {
        method: 'POST',
        body: JSON.stringify(
          giftId
              ? { roomName: username, giftId, handle }
              : { roomName: username, clear: true, handle },
        ),
        },
      );
      const next = result.locked ? result.lock : null;
      setLock(next);
      setLockPicker(false);
      const nowPrivate = Boolean(result.isPrivate ?? result.locked);
      onPrivacyChange?.(nowPrivate);
      await updateLiveRoomFeed(username, {
        isPrivate: nowPrivate,
        lockGiftId: next?.giftId ?? null,
      }).catch(() => undefined);
      await publishRoomData(room, { type: 'lock', lock: next });
      setInviteNote(
        next
          ? `Privado activo: solo entra quien envíe ${next.emoji} ${next.giftName}. El feed público quedó en pausa.`
          : 'Live reabierto al público.',
      );
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
      if (!track) {
        throw new Error('No hay pista de cámara activa');
      }
      // Solo restartTrack: desactivar/reactivar la cámara deja a los espectadores en negro.
      await track.restartTrack({
        facingMode: nextFacing,
      });
      cameraTrackRef.current = track;
      setFacing(nextFacing);
    } catch (error) {
      console.error('[live] flip camera', error);
      setInviteNote('No se pudo cambiar la cámara. Prueba de nuevo.');
    } finally {
      setFlipping(false);
    }
  }, [canPublish, flipping, facing, room]);

  const toggleMic = useCallback(async () => {
    if (!canPublish) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);
    } catch (err) {
      console.error('[live] mic toggle', err);
    }
  }, [canPublish, room]);

  useEffect(() => {
    liveStartedAt.current = Date.now();
    peakViewersRef.current = 0;
  }, [username]);

  useEffect(() => {
    peakViewersRef.current = Math.max(peakViewersRef.current, viewers);
  }, [viewers]);

  useEffect(() => {
    if (isHost || canPublish) return;
    let cancelled = false;
    void apiPublic<{ streams?: SuggestedLive[] }>('/api/stream/live')
      .then((data) => {
        if (cancelled) return;
        setLiveNeighbors(
          (data.streams || []).filter((stream) => !stream.isPrivate),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [username, isHost, canPublish]);

  useEffect(() => {
    return listenLiveWishlist(username, setWishlist);
  }, [username]);

  async function notifyFollowers() {
    if (!isHost || !firebaseUid || notifyBusy) return;
    setNotifyBusy(true);
    try {
      const [friends, followers] = await Promise.all([
        listFriends(firebaseUid),
        listFollowers(firebaseUid),
      ]);
      const recipientUids = [
        ...friends.map((item) => item.uid),
        ...followers.map((item) => item.uid),
      ];
      const count = await notifyNetworkImLive({
        hostUid: firebaseUid,
        hostUsername: username,
        hostName: displayName || handle || username,
        recipientUids,
      });
      setInviteNote(
        count > 0
          ? `Aviso enviado a ${count} amigo(s)/seguidor(es).`
          : 'Aún no tienes amigos o seguidores para avisar.',
      );
    } catch (err) {
      setInviteNote(err instanceof Error ? err.message : 'No se pudo avisar');
    } finally {
      setNotifyBusy(false);
    }
  }

  async function toggleWishlistGift(giftId: string) {
    if (!isHost) return;
    const next = wishlist.includes(giftId)
      ? wishlist.filter((id) => id !== giftId)
      : [...wishlist, giftId].slice(0, 5);
    setWishlist(next);
    await setLiveWishlist(username, next).catch(() => undefined);
  }

  useEffect(() => {
    if (!isHost || !firebaseUid) return;
    return listenLiveGifts(username, (gift) => {
      if (!gift.coins || creditedGifts.current.has(gift.id)) return;
      if (gift.senderUid && gift.senderUid === firebaseUid) return;
      creditedGifts.current.add(gift.id);
      setLiveStats((current) => {
        const base =
          current ||
          ({
            username,
            startedAt: new Date(liveStartedAt.current).toISOString(),
            goalCoins,
            goalLabel,
            coinsEarned: 0,
            topGifters: [],
          } satisfies LiveSessionStats);
        const gifters = new Map(
          (base.topGifters || []).map((item) => [item.uid || item.name, { ...item }]),
        );
        const key = gift.senderUid || gift.senderName;
        const prev = gifters.get(key);
        gifters.set(key, {
          uid: gift.senderUid || prev?.uid || '',
          name: gift.senderName || prev?.name || 'Liveboomer',
          coins: (prev?.coins || 0) + gift.coins,
        });
        return {
          ...base,
          coinsEarned: (base.coinsEarned || 0) + gift.coins,
          topGifters: Array.from(gifters.values())
            .sort((a, b) => b.coins - a.coins)
            .slice(0, 5),
        };
      });
      void addFirestoreCoins(firebaseUid, gift.coins)
        .then((next) => {
          if (typeof next === 'number') setCoins(next);
        })
        .catch(() => {
          const current = useAuthStore.getState().profile?.coinsBalance ?? 0;
          setCoins(current + gift.coins);
        });
      void addLevelXp(firebaseUid, Math.max(1, Math.floor(gift.coins / 2))).catch(() => undefined);
    });
  }, [isHost, firebaseUid, username, goalCoins, goalLabel, setCoins]);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'fetch';
    link.href = '/gifts/aguacate.webm';
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, []);

  async function confirmLeave() {
    if (leaving) return;
    setLeaving(true);
    try {
      if (isHost) {
        await publishRoomData(room, {
          type: 'live_ended',
          hostName: displayName || handle || username,
        }).catch(() => undefined);
        if (firebaseUid) {
          const endedAt = new Date().toISOString();
          const startedAt = liveStats?.startedAt || new Date(liveStartedAt.current).toISOString();
          await archiveLiveActivity(firebaseUid, {
            username,
            displayName: displayName || handle || username,
            title: liveStats?.goalLabel
              ? `Live · ${liveStats.goalLabel}`
              : `Live de ${displayName || handle || username}`,
            startedAt,
            endedAt,
            durationMs: Math.max(0, Date.now() - new Date(startedAt).getTime()),
            viewers: Math.max(viewers, peakViewersRef.current),
            coinsEarned: liveStats?.coinsEarned || 0,
            goalCoins: liveStats?.goalCoins || goalCoins || 0,
            goalLabel: liveStats?.goalLabel || goalLabel || '',
            topGifters: liveStats?.topGifters || [],
          }).catch((error) => console.error('[live] archive', error));
        }
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        await onLeaveLive?.();
        setLeaveOpen(false);
        setSummaryOpen(true);
        return;
      }
      await onLeaveLive?.();
      navigate('/', { replace: true });
    } finally {
      setLeaving(false);
      setLeaveOpen(false);
    }
  }

  async function shareLive() {
    const url = `${window.location.origin}/stream/${encodeURIComponent(username)}`;
    const result = await shareContent({
      url,
      title: `LIVE de @${username} en LiveBoom`,
      text: 'Mira este LIVE en LiveBoom',
    });
    setShareNote(
      result === 'shared' ? 'LIVE compartido' : result === 'copied' ? 'Enlace del LIVE copiado' : 'No se pudo compartir',
    );
    window.setTimeout(() => setShareNote(null), 2500);
  }

  async function shareHostProfile() {
    const path = profileHref(username, hostUid);
    const url = `${window.location.origin}${path}`;
    const result = await shareContent({
      url,
      title: `Perfil de @${username} en LiveBoom`,
      text: `Mira el perfil de @${username} en LiveBoom`,
    });
    setShareNote(
      result === 'shared'
        ? 'Perfil compartido'
        : result === 'copied'
          ? 'Enlace del perfil copiado'
          : 'No se pudo compartir',
    );
    window.setTimeout(() => setShareNote(null), 2500);
  }

  function goToNeighborLive(direction: 1 | -1) {
    if (isHost || canPublish || liveNeighbors.length === 0) return;
    const currentIdx = liveNeighbors.findIndex(
      (stream) => roomKey(stream.username) === roomKey(username),
    );
    const base = currentIdx >= 0 ? currentIdx : -1;
    const nextIdx = (base + direction + liveNeighbors.length) % liveNeighbors.length;
    const next = liveNeighbors[nextIdx];
    if (!next || roomKey(next.username) === roomKey(username)) return;
    navigate(`/stream/${encodeURIComponent(next.username)}`, { replace: true });
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
      setInviteOpen(false);
    } catch (err) {
      setInviteNote(err instanceof Error ? err.message : 'No se pudo invitar');
    }
  }

  const stopScreenCapture = useCallback(async () => {
    if (stoppingScreenRef.current) return;
    if (
      !screenComposerRef.current &&
      !compositeTrackRef.current &&
      !screenMediaTrackRef.current
    ) {
      return;
    }
    stoppingScreenRef.current = true;
    try {
      const composer = screenComposerRef.current;
      const composite = compositeTrackRef.current;
      const rawCamera = rawCameraTrackRef.current;
      const screenMedia = screenMediaTrackRef.current;
      const pipInput = pipInputTrackRef.current;

      screenComposerRef.current = null;
      compositeTrackRef.current = null;
      rawCameraTrackRef.current = null;
      screenMediaTrackRef.current = null;
      pipInputTrackRef.current = null;

      composer?.stop();

      if (composite) {
        try {
          await room.localParticipant.unpublishTrack(composite, true);
        } catch {
          /* ignore */
        }
      }

      if (screenMedia) {
        screenMedia.stop();
      }

      if (pipInput && pipInput !== rawCamera?.mediaStreamTrack) {
        pipInput.stop();
      }

      if (rawCamera?.mediaStreamTrack?.readyState === 'live') {
        try {
          await room.localParticipant.publishTrack(rawCamera, {
            source: Track.Source.Camera,
            name: 'camera',
          });
          cameraTrackRef.current = rawCamera;
        } catch {
          await room.localParticipant.setCameraEnabled(true);
        }
      } else {
        await room.localParticipant.setCameraEnabled(true);
      }

      setScreenSharing(false);
      setPipVisible(true);
      setPipPos(defaultPipPosition(720, 1280));
    } finally {
      stoppingScreenRef.current = false;
    }
  }, [room]);

  useEffect(() => {
    return () => {
      void stopScreenCapture();
    };
  }, [stopScreenCapture]);

  async function toggleScreenCapture() {
    if (!isHost) return;
    if (screenSharing) {
      await stopScreenCapture();
      setReelNote('Captura de pantalla detenida');
      return;
    }
    if (!canUseDisplayMedia()) {
      setReelNote(
        'Este navegador no permite compartir pantalla. Usa un dispositivo o navegador compatible.',
      );
      return;
    }
    try {
      await waitConnected(room);
      const cameraTrack = cameraTrackRef.current;
      if (!cameraTrack?.mediaStreamTrack || cameraTrack.mediaStreamTrack.readyState !== 'live') {
        setReelNote('Espera a que la cámara esté lista');
        return;
      }

      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const screenMedia = display.getVideoTracks()[0];
      if (!screenMedia) throw new Error('Sin pista de pantalla');

      rawCameraTrackRef.current = cameraTrack;
      screenMediaTrackRef.current = screenMedia;

      let pipInput = cameraTrack.mediaStreamTrack;
      if (typeof pipInput.clone === 'function') {
        const cloned = pipInput.clone();
        pipInputTrackRef.current = cloned;
        pipInput = cloned;
      }

      try {
        await room.localParticipant.unpublishTrack(cameraTrack, false);

        if (pipInput.readyState !== 'live' && cameraTrack.mediaStreamTrack.readyState === 'live') {
          pipInput = cameraTrack.mediaStreamTrack;
          pipInputTrackRef.current = null;
        }

        const dims = liveCanvasDimensions(aspectRatio);
        const composer = new LiveScreenComposer({
          width: dims.width,
          height: dims.height,
        });
        screenComposerRef.current = composer;
        const initialPip = defaultPipPosition(dims.width, dims.height);
        composer.setPipPosition(initialPip.nx, initialPip.ny);
        composer.setPipVisible(true);
        setPipPos(initialPip);
        setPipVisible(true);

        const composite = await composer.start(screenMedia, pipInput, {
          onDimensionsChange: (dims) => {
            const track = screenMediaTrackRef.current;
            if (track) setReelNote(screenShareStatusMessage(track, dims));
          },
        });
        compositeTrackRef.current = composite;
        cameraTrackRef.current = composite;

        await room.localParticipant.publishTrack(composite, {
          source: Track.Source.Camera,
          name: 'camera',
          simulcast: false,
        });

        setScreenSharing(true);
        setReelNote(screenShareStatusMessage(screenMedia, readScreenTrackDimensions(screenMedia)));

        screenMedia.onended = () => {
          void stopScreenCapture().then(() => setReelNote(null));
        };
      } catch (inner) {
        screenMedia.stop();
        screenMediaTrackRef.current = null;
        pipInputTrackRef.current?.stop();
        pipInputTrackRef.current = null;
        screenComposerRef.current?.stop();
        screenComposerRef.current = null;
        compositeTrackRef.current = null;
        if (rawCameraTrackRef.current) {
          try {
            await room.localParticipant.publishTrack(rawCameraTrackRef.current, {
              source: Track.Source.Camera,
              name: 'camera',
            });
            cameraTrackRef.current = rawCameraTrackRef.current;
          } catch {
            await room.localParticipant.setCameraEnabled(true);
          }
        }
        rawCameraTrackRef.current = null;
        throw inner;
      }
    } catch (err) {
      const e = err as Error & { name?: string };
      if (e?.name === 'AbortError') {
        setReelNote('Compartir pantalla cancelado');
        return;
      }
      setReelNote(
        e?.name === 'NotAllowedError' || /permission|denied|NotAllowed/i.test(String(e?.message || ''))
          ? 'Permiso denegado. Autoriza capturar pantalla en el navegador.'
          : e instanceof Error
            ? e.message
            : 'No se pudo capturar la pantalla',
      );
    }
  }

  async function recordReel() {
    if (recording || !isHost) return;
    const track = (rawCameraTrackRef.current ?? cameraTrackRef.current)?.mediaStreamTrack;
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
      const title = `Reel · ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`;
      downloadReelBlob(blob, `liveboom-reel-${Date.now()}.webm`);
      await savePendingReel({ title, blob, roomUsername: username }).catch(() => undefined);

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
          title,
          shared: false,
        }),
      }).catch(() => undefined);
      setReelNote('Reel guardado en el móvil y listo para publicar.');
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
        <div className={liveStageOuterClass(aspectRatio)}>
          <div
            ref={stageVideoRef}
            className={liveStageInnerClass(aspectRatio)}
            onTouchStart={(event) => {
              if (isHost || canPublish) return;
              const touch = event.changedTouches[0];
              if (!touch) return;
              (stageVideoRef.current as HTMLDivElement & { __swipeY?: number }).__swipeY = touch.clientY;
            }}
            onTouchEnd={(event) => {
              if (isHost || canPublish) return;
              const touch = event.changedTouches[0];
              const startY = (stageVideoRef.current as HTMLDivElement & { __swipeY?: number })?.__swipeY;
              if (!touch || startY == null) return;
              const delta = touch.clientY - startY;
              if (Math.abs(delta) < 70) return;
              goToNeighborLive(delta < 0 ? 1 : -1);
            }}
          >
            <CreatorVideo
              canPublish={canPublish}
              hostUid={hostUid}
              facing={facing}
              cameraTrackRef={cameraTrackRef}
            />
            {isHost && screenSharing ? (
              <ScreenShareHostOverlay
                pipVisible={pipVisible}
                pipPos={pipPos}
                onPipPosChange={(pos) => {
                  setPipPos(pos);
                  screenComposerRef.current?.setPipPosition(pos.nx, pos.ny);
                }}
                onTogglePip={() => {
                  const next = !pipVisible;
                  setPipVisible(next);
                  screenComposerRef.current?.setPipVisible(next);
                }}
              />
            ) : null}
            <FaceMeshGiftOverlay active={faceGift} onDone={() => setFaceGift(null)} />
            {floats.map((item) => (
              <FloatingGift
                key={item.id}
                giftId={item.giftId}
                senderName={item.senderName}
                left={item.left}
                combo={item.combo}
                lite={isSpectator}
                onComplete={() => setFloats((current) => current.filter((gift) => gift.id !== item.id))}
              />
            ))}
            {liveEnded && !isHost ? (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-zinc-950/95 px-4 text-center backdrop-blur-sm">
                <p className="text-lg font-bold text-white sm:text-xl">Dejó de transmitir</p>
                <p className="text-sm text-zinc-400">Sigue a tus amigos u otros lives:</p>
                {suggestions.length > 0 ? (
                  <div className="mt-1 grid w-full max-w-sm grid-cols-1 gap-2 sm:grid-cols-2">
                    {suggestions.map((stream) => (
                      <Link
                        key={stream.username}
                        to={`/stream/${encodeURIComponent(stream.username)}`}
                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-left transition hover:border-cyan-400/50"
                      >
                        {stream.avatarUrl ? (
                          <img
                            src={stream.avatarUrl}
                            alt=""
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <span className="grid h-10 w-10 place-items-center rounded-full bg-fuchsia-600/30 text-sm font-bold text-fuchsia-200">
                            {(stream.displayName || stream.username).slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white">
                            {stream.displayName || `@${stream.username}`}
                            {'_friend' in stream && stream._friend ? (
                              <span className="ml-1 text-[10px] font-bold text-cyan-300">Amigo</span>
                            ) : null}
                          </span>
                          <span className="block truncate text-[11px] text-zinc-400">
                            {stream.title}
                          </span>
                        </span>
                      </Link>
                    ))}
          </div>
                ) : (
                  <p className="text-xs text-zinc-500">No hay otros lives activos ahora.</p>
                )}
                <Link
                  to="/"
                  className="mt-1 rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-5 py-2 text-sm font-bold text-zinc-950"
                >
                  Ir al inicio
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-3 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="pointer-events-auto flex max-w-[78%] flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="live-dot rounded-md bg-fuchsia-600 px-2 py-1 text-[11px] font-bold text-white">
              <Radio className="mr-1 inline" size={11} /> EN VIVO
            </span>
            {isHost ? (
              <>
                <button
                  type="button"
                  disabled={notifyBusy}
                  onClick={() => void notifyFollowers()}
                  className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[11px] font-semibold text-fuchsia-200 backdrop-blur hover:text-white disabled:opacity-60"
                >
                  <Megaphone size={11} />
                  {notifyBusy ? 'Avisando…' : 'Avisar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLockPicker(false);
                    setWishlistOpen((v) => !v);
                  }}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold backdrop-blur ${
                    wishlist.length
                      ? 'bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-400/40'
                      : 'bg-black/50 text-zinc-200 hover:text-white'
                  }`}
                >
                  <Gift size={11} />
                  Deseos {wishlist.length ? `(${wishlist.length})` : ''}
                </button>
              <button
                type="button"
                disabled={lockBusy}
                  onClick={() => {
                    setWishlistOpen(false);
                    setLockPicker((v) => !v);
                  }}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold backdrop-blur ${
                  lock
                    ? 'bg-amber-500/30 text-amber-200 ring-1 ring-amber-400/50'
                    : 'bg-black/50 text-zinc-200 hover:text-white'
                }`}
              >
                <Lock size={11} />
                  {lock ? `${lock.emoji} Privado` : 'Privado'}
              </button>
                {lock ? (
                  <button
                    type="button"
                    disabled={lockBusy}
                    onClick={() => void setLiveLock(null)}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500/25 px-2 py-1 text-[11px] font-semibold text-emerald-200 ring-1 ring-emerald-400/40 backdrop-blur"
                  >
                    <Unlock size={11} />
                    Reabrir al público
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
            ) : null}
            {isPrivate || lock ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/25 px-2 py-1 text-[11px] text-amber-200 backdrop-blur">
                <Lock size={11} />{' '}
                {lock ? `Privado · ${lock.emoji} ${lock.giftName}` : 'Privado'}
              </span>
            ) : null}
            <Link
              to={profileHref(username, hostUid)}
              className="truncate rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur hover:bg-black/70 hover:text-cyan-200"
              title="Ver perfil"
            >
              @{username}
            </Link>
            <span
              role="button"
              tabIndex={0}
              onClick={() => setViewersOpen((value) => !value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') setViewersOpen((value) => !value);
              }}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-cyan-300 backdrop-blur hover:bg-black/70"
            >
              <Eye size={12} />
              {viewers} viendo
            </span>
          </div>
          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void shareHostProfile()}
              className="grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 sm:h-9 sm:w-9"
              aria-label="Compartir perfil"
              title="Compartir perfil"
            >
              <User size={16} />
            </button>
            <button
              type="button"
              onClick={() => void shareLive()}
              className="grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 sm:h-9 sm:w-9"
              aria-label="Compartir live"
              title="Compartir LIVE"
            >
              <Share2 size={16} />
            </button>
            {canPublish ? (
              <>
                <button
                  type="button"
                  onClick={() => void toggleMic()}
                  className={`grid h-10 w-10 place-items-center rounded-full backdrop-blur sm:h-9 sm:w-9 ${
                    isMicrophoneEnabled
                      ? 'bg-black/55 text-white hover:bg-black/75'
                      : 'bg-fuchsia-500/35 text-fuchsia-100 ring-1 ring-fuchsia-400/50 hover:bg-fuchsia-500/45'
                  }`}
                  aria-label={isMicrophoneEnabled ? 'Silenciar micrófono' : 'Activar micrófono'}
                  title={isMicrophoneEnabled ? 'Silenciar mic' : 'Activar mic'}
                >
                  {isMicrophoneEnabled ? <Mic size={18} /> : <MicOff size={18} />}
                </button>
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
              </>
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
        {shareNote ? (
          <p className="pointer-events-none mt-2 text-[11px] font-semibold text-cyan-200">{shareNote}</p>
        ) : null}
      </div>
      {liveStats && (liveStats.goalCoins > 0 || liveStats.coinsEarned > 0) ? (
        <div className="pointer-events-none absolute left-3 right-3 z-10 max-w-sm sm:left-4 top-[max(6.75rem,calc(env(safe-area-inset-top)+5.5rem))]">
          <p className="text-[10px] font-semibold text-white drop-shadow">
            {liveStats.goalLabel || 'Recaudado en esta sala'}
          </p>
          {(() => {
            const earned = liveStats.coinsEarned || 0;
            const goal = liveStats.goalCoins || 0;
            const softCap =
              goal > 0
                ? goal
                : Math.max(100, Math.ceil(Math.max(earned, 1) / 100) * 100);
            const pct =
              goal > 0
                ? Math.min(100, Math.round((earned / goal) * 100))
                : Math.min(100, Math.round((earned / softCap) * 100));
            return (
              <>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-cyan-200">
                  {earned.toLocaleString('es-CO')}
                  {goal > 0
                    ? ` / ${goal.toLocaleString('es-CO')} coins${earned >= goal ? ' · Meta alcanzada' : ''}`
                    : ' coins'}
                  {liveStats.topGifters[0]
                    ? ` · Top: ${liveStats.topGifters[0].name}`
                    : ''}
                </p>
              </>
            );
          })()}
        </div>
      ) : null}
      {wishlistOpen && isHost ? (
        <div className="pointer-events-auto absolute left-2 right-2 top-[4.8rem] z-20 max-h-[min(48dvh,22rem)] overflow-y-auto rounded-2xl border border-cyan-400/30 bg-zinc-950/95 p-3 shadow-xl sm:left-4 sm:right-auto sm:w-[min(100%,18rem)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-300">
              Lista de deseos (máx. 5)
            </p>
            <button type="button" onClick={() => setWishlistOpen(false)} className="text-zinc-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <div className="space-y-1">
            {sortedLiveboomGiftCatalog().map((gift) => {
              const active = wishlist.includes(gift.id);
              return (
                <button
                  key={gift.id}
                  type="button"
                  onClick={() => void toggleWishlistGift(gift.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs ${
                    active ? 'bg-cyan-500/20 text-cyan-100' : 'text-white hover:bg-white/5'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <GiftIcon giftId={gift.id} size={16} />
                    {gift.name}
                  </span>
                  <span className="text-cyan-400">{gift.coins}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {!isHost && wishlist.length > 0 ? (
        <div className="pointer-events-none absolute left-2 right-2 top-[4.8rem] z-20 max-w-[16rem] rounded-2xl border border-cyan-400/20 bg-black/55 px-2.5 py-2 backdrop-blur sm:left-4 sm:right-auto">
          <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-300">Deseos del host</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {wishlist.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-white">
                <GiftIcon giftId={id} size={12} />
                {findLiveGift(id)?.name || id}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {lockPicker && isHost ? (
        <div className="pointer-events-auto absolute left-2 right-2 top-[4.8rem] z-20 max-h-[min(48dvh,22rem)] overflow-y-auto rounded-2xl border border-amber-400/30 bg-zinc-950/95 p-3 shadow-xl sm:left-4 sm:right-auto sm:w-[min(100%,18rem)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-300">
              Modo privado (regalo)
            </p>
            <button type="button" onClick={() => setLockPicker(false)} className="text-zinc-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <p className="mb-2 text-[10px] text-zinc-400">
            Al activarlo se oculta del feed público y se pausa para quien no envíe el regalo. Solo
            entran quienes paguen. Puedes reabrir al público cuando quieras.
          </p>
          <div className="space-y-1">
            {sortedLiveboomGiftCatalog().map((gift) => (
              <button
                key={gift.id}
                type="button"
                disabled={lockBusy}
                onClick={() => void setLiveLock(gift.id)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-white hover:bg-white/5"
              >
                <span className="inline-flex items-center gap-2">
                  <GiftIcon giftId={gift.id} size={18} />
                  {gift.name}
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
              Quitar privado y reabrir al público
            </button>
          ) : null}
        </div>
      ) : null}
      {isHost ? (
        <div className="pointer-events-auto absolute left-3 right-3 top-[4.5rem] z-10 flex flex-wrap items-center gap-2 sm:left-4 sm:right-auto">
          {!lockPicker ? (
            <>
              {inviteOpen ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-black/55 p-2 backdrop-blur sm:max-w-xs">
            <UserPlus size={16} className="shrink-0 text-cyan-300" />
            <input
              value={inviteHandle}
              onChange={(event) => setInviteHandle(event.target.value)}
                    placeholder="@usuario a invitar"
                    autoFocus
              className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none"
              list="live-viewers"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void inviteGuest();
                      if (event.key === 'Escape') setInviteOpen(false);
                    }}
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
                  <button
                    type="button"
                    onClick={() => setInviteOpen(false)}
                    className="shrink-0 text-zinc-400"
                    aria-label="Cerrar"
                  >
                    <X size={14} />
                  </button>
          </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setInviteOpen(true)}
                  className="inline-flex items-center gap-1 rounded-xl bg-black/55 px-3 py-2 text-xs font-semibold text-white backdrop-blur"
                >
                  <UserPlus size={14} /> Invitar
                </button>
              )}
          <button
            type="button"
            disabled={recording}
            onClick={() => void recordReel()}
            className="inline-flex items-center gap-1 rounded-xl bg-black/55 px-3 py-2 text-xs font-semibold text-white backdrop-blur disabled:opacity-60"
          >
            {recording ? <Circle className="animate-pulse text-red-400" size={12} /> : <Video size={14} />}
            {recording ? 'Grabando…' : 'Reel 15s'}
          </button>
              {canUseDisplayMedia() ? (
              <button
                type="button"
                onClick={() => void toggleScreenCapture()}
                className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold backdrop-blur ${
                  screenSharing
                    ? 'bg-emerald-500/30 text-emerald-100 ring-1 ring-emerald-400/40'
                    : 'bg-black/55 text-white'
                }`}
              >
                <MonitorUp size={14} />
                {screenSharing ? 'Pantalla on' : 'Pantalla'}
              </button>
              ) : null}
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
        <div className="pointer-events-auto absolute bottom-[48dvh] right-3 z-30 flex flex-col gap-2 lg:bottom-8 lg:right-6">
          <button
            type="button"
            onClick={() => void toggleMic()}
            className={`grid h-12 w-12 place-items-center rounded-full shadow-lg backdrop-blur ring-1 ${
              isMicrophoneEnabled
                ? 'bg-black/60 text-white ring-white/20'
                : 'bg-fuchsia-500/40 text-white ring-fuchsia-400/50'
            }`}
            aria-label={isMicrophoneEnabled ? 'Silenciar micrófono' : 'Activar micrófono'}
          >
            {isMicrophoneEnabled ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          <button
            type="button"
            onClick={() => void flipCamera()}
            disabled={flipping}
            className="grid h-12 w-12 place-items-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur ring-1 ring-white/20"
            aria-label={facing === 'user' ? 'Cambiar a cámara trasera' : 'Cambiar a cámara frontal'}
          >
            <SwitchCamera size={20} className={flipping ? 'animate-spin' : ''} />
          </button>
        </div>
      ) : null}
      {viewersOpen ? (
        <div className="pointer-events-auto absolute left-2 right-2 top-[4.8rem] z-30 max-h-[min(48dvh,22rem)] overflow-hidden rounded-2xl border border-white/15 bg-zinc-950/95 p-3 shadow-xl sm:left-auto sm:right-4 sm:w-[min(100%,16rem)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-cyan-300">
              <Users size={12} />
              Espectadores
            </p>
            <button type="button" onClick={() => setViewersOpen(false)} className="text-zinc-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <ul className="max-h-[40dvh] space-y-1.5 overflow-y-auto">
            {viewersList.length === 0 ? (
              <li className="text-xs text-zinc-500">Nadie en la sala aún.</li>
            ) : (
              viewersList.map((person) => (
                <li
                  key={person.identity}
                  className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-xs text-white"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-200">
                    {(person.name || person.identity).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate">@{person.name || person.identity}</span>
                </li>
              ))
            )}
          </ul>
          {(liveStats?.topGifters?.length || 0) > 0 ? (
            <div className="mt-3 border-t border-white/10 pt-2">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">Top donantes</p>
              <ul className="space-y-1">
                {(liveStats?.topGifters || []).slice(0, 5).map((donor) => (
                  <li key={donor.uid || donor.name} className="flex justify-between text-[11px] text-zinc-300">
                    <span className="truncate">{donor.name}</span>
                    <span className="text-cyan-300">{donor.coins.toLocaleString('es-CO')}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {leaveOpen ? (
        <div className="pointer-events-auto absolute inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-zinc-950 p-5 shadow-xl">
            <p className="text-base font-bold text-white">
              {isHost ? '¿Salir y terminar el live?' : '¿Salir del live?'}
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              {isHost
                ? 'Al confirmar se cierra la transmisión y verás el resumen de la sesión.'
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
      {summaryOpen ? (
        <div className="pointer-events-auto absolute inset-0 z-50 grid place-items-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-cyan-400/30 bg-zinc-950 p-5 shadow-xl">
            <p className="text-lg font-bold text-white">Resumen del LIVE</p>
            <p className="mt-1 text-xs text-zinc-400">Datos de esta sesión únicamente.</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-400">Duración</dt>
                <dd className="font-semibold text-white">
                  {(() => {
                    const ms = Math.max(0, Date.now() - liveStartedAt.current);
                    const mins = Math.floor(ms / 60000);
                    const secs = Math.floor((ms % 60000) / 1000);
                    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
                  })()}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-400">Espectadores (pico)</dt>
                <dd className="font-semibold text-white">{peakViewersRef.current}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-400">Coins recibidos</dt>
                <dd className="font-semibold text-cyan-300">
                  {(liveStats?.coinsEarned || 0).toLocaleString('es-CO')}
                </dd>
              </div>
              {liveStats?.goalCoins ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-400">Meta</dt>
                  <dd className="font-semibold text-white">
                    {Math.min(liveStats.coinsEarned || 0, liveStats.goalCoins).toLocaleString('es-CO')} /{' '}
                    {liveStats.goalCoins.toLocaleString('es-CO')}
                  </dd>
                </div>
              ) : null}
            </dl>
            {(liveStats?.topGifters?.length || 0) > 0 ? (
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-amber-300">Top donantes</p>
                <ul className="mt-2 space-y-1">
                  {(liveStats?.topGifters || []).slice(0, 5).map((donor, index) => (
                    <li key={donor.uid || donor.name} className="flex justify-between text-xs text-zinc-300">
                      <span>
                        {index + 1}. {donor.name}
                      </span>
                      <span className="text-cyan-300">{donor.coins.toLocaleString('es-CO')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {suggestions.length > 0 ? (
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-300">
                  Amigos / lives sugeridos
                </p>
                <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
                  {suggestions.slice(0, 6).map((stream) => (
                    <li key={stream.username}>
                      <Link
                        to={`/stream/${encodeURIComponent(stream.username)}`}
                        className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-xs text-white hover:bg-white/10"
                      >
                        {stream.avatarUrl ? (
                          <img src={stream.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                        ) : (
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-200">
                            {(stream.displayName || stream.username).slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          @{stream.username}
                          {'_friend' in stream && stream._friend ? (
                            <span className="ml-1 text-[9px] text-cyan-300">amigo</span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="mt-5 w-full rounded-xl bg-gradient-to-r from-cyan-500 to-fuchsia-500 py-2.5 text-sm font-bold text-zinc-950"
            >
              Volver al inicio
            </button>
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

function trackIsRenderable(ref: TrackReference | null): boolean {
  if (!ref?.publication?.track || ref.publication.isMuted) return false;
  const mediaTrack = ref.publication.track.mediaStreamTrack;
  // Acepta tracks suscritos aunque el MediaStreamTrack aún no reporte "live".
  if (!mediaTrack) return true;
  return mediaTrack.readyState !== 'ended';
}

function trackRenderKey(ref: TrackReference | null): string {
  if (!ref) return 'none';
  const sid = ref.publication?.trackSid || ref.publication?.track?.sid || 'unknown';
  return `${ref.participant.identity}-${sid}`;
}

function CreatorVideo({
  canPublish,
  hostUid,
  facing,
  cameraTrackRef,
}: {
  canPublish: boolean;
  hostUid?: string;
  facing: 'user' | 'environment';
  cameraTrackRef: React.MutableRefObject<LocalVideoTrack | null>;
}) {
  const room = useRoomContext();
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }]);
  const [camError, setCamError] = useState<string | null>(null);
  const [camBusy, setCamBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [trackEpoch, setTrackEpoch] = useState(0);

  const cameras = tracks
    .filter((track): track is TrackReference => Boolean(track.publication))
    .sort((a, b) => Number(a.participant.joinedAt) - Number(b.participant.joinedAt));
  const local = cameras.find((track) => track.participant.isLocal) || null;
  const remotes = cameras.filter((track) => !track.participant.isLocal);
  const liveLocal = local && trackIsRenderable(local) ? local : null;
  const liveRemote = (() => {
    if (canPublish) return remotes.find((track) => trackIsRenderable(track)) || null;
    if (hostUid) {
      const hostTrack = remotes.find(
        (track) => track.participant.identity === hostUid && trackIsRenderable(track),
      );
      if (hostTrack) return hostTrack;
    }
    return remotes.find((track) => trackIsRenderable(track)) || null;
  })();
  const main = liveLocal || liveRemote || local || remotes[0] || null;
  const guests = local ? remotes : remotes.slice(1);
  const lastMainRef = useRef<{ room: string; track: TrackReference | null }>({
    room: '',
    track: null,
  });

  useEffect(() => {
    lastMainRef.current = { room: '', track: null };
    setTrackEpoch((value) => value + 1);
  }, [room.name, hostUid, canPublish]);

  if (main && trackIsRenderable(main)) {
    lastMainRef.current = { room: room.name, track: main };
  }
  const cached =
    lastMainRef.current.room === room.name ? lastMainRef.current.track : null;
  const shown = trackIsRenderable(main) ? main : trackIsRenderable(cached) ? cached : main;

  useEffect(() => {
    let timer = 0;
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => setTrackEpoch((value) => value + 1),
        canPublish ? 80 : 700,
      );
    };
    room.on(RoomEvent.TrackSubscribed, bump);
    room.on(RoomEvent.TrackUnsubscribed, bump);
    room.on(RoomEvent.TrackPublished, bump);
    room.on(RoomEvent.TrackUnpublished, bump);
    room.on(RoomEvent.LocalTrackPublished, bump);
    room.on(RoomEvent.LocalTrackUnpublished, bump);
    return () => {
      window.clearTimeout(timer);
      room.off(RoomEvent.TrackSubscribed, bump);
      room.off(RoomEvent.TrackUnsubscribed, bump);
      room.off(RoomEvent.TrackPublished, bump);
      room.off(RoomEvent.TrackUnpublished, bump);
      room.off(RoomEvent.LocalTrackPublished, bump);
      room.off(RoomEvent.LocalTrackUnpublished, bump);
    };
  }, [room, canPublish]);

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
        // El volteo de cámara lo hace flipCamera con restartTrack (sin tocar facing aquí).
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
          // Sin resolución fija: evita zoom digital en móviles al iniciar.
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
  }, [canPublish, retry, room, cameraTrackRef, facing]);

  if (!shown) {
    return (
      <div className="grid h-full w-full place-items-center gap-3 px-6 text-center text-sm text-zinc-400">
        <p>
          {canPublish
            ? camBusy
              ? 'Activando tu cámara…'
              : camError || 'Preparando transmisión…'
            : trackEpoch > 0
              ? 'Reconectando cámara…'
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
      {shown ? (
        <VideoTrack
          key={`${trackRenderKey(shown)}-${trackEpoch}`}
          trackRef={shown}
          className="absolute inset-0 h-full w-full bg-black object-contain [&_video]:!transform-none"
        />
      ) : null}
      {guests.map((guest) => (
        <div
          key={guest.participant.identity}
          className="absolute right-2 top-24 z-10 h-36 w-24 overflow-hidden rounded-xl border border-cyan-400/50 shadow-lg sm:h-44 sm:w-28"
        >
          <VideoTrack trackRef={guest} className="h-full w-full object-cover [&_video]:!transform-none" />
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
  isHostRoom = false,
  onAcceptInvite,
}: {
  roomName: string;
  canPublish: boolean;
  isHostRoom?: boolean;
  onAcceptInvite?: () => void;
}) {
  const room = useRoomContext();
  const profile = useAuthStore((state) => state.profile);
  const coins = profile?.coinsBalance ?? 0;
  const setCoins = useAuthStore((state) => state.setCoins);
  const [messages, setMessages] = useState<ChatMessage[]>(() => liveChatCache.get(roomName) ?? []);
  const [text, setText] = useState('');
  const [openGifts, setOpenGifts] = useState(false);
  const [pendingGiftId, setPendingGiftId] = useState<string | null>(null);
  const [giftMultiplier, setGiftMultiplier] = useState<1 | 2 | 4 | 8>(1);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [sendingGift, setSendingGift] = useState<string | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeNeeded, setRechargeNeeded] = useState<number | null>(null);
  const [inviteBanner, setInviteBanner] = useState<string | null>(null);
  const [pinnedBottom, setPinnedBottom] = useState(true);
  const [chatHidden, setChatHidden] = useState(() => !isHostRoom && !canPublish);
  const [giftCoinsByName, setGiftCoinsByName] = useState<Record<string, number>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seen = useRef(new Set<string>((liveChatCache.get(roomName) ?? []).map((msg) => msg.id)));
  const levelXpRef = useRef(0);
  const giftCatalog = useMemo(() => sortedLiveboomGiftCatalog(), []);

  useEffect(() => {
    return listenLiveRoomEarnings(roomName, (stats) => {
      const map: Record<string, number> = {};
      for (const donor of stats.topGifters || []) {
        const key = String(donor.name || '')
          .trim()
          .toLowerCase()
          .replace(/^@/, '');
        if (key) map[key] = Number(donor.coins || 0);
      }
      setGiftCoinsByName(map);
    });
  }, [roomName]);

  useEffect(() => {
    if (!profile?.firebaseUid) return;
    void fetchLevelXp(profile.firebaseUid).then((xp) => {
      levelXpRef.current = xp;
    });
  }, [profile?.firebaseUid]);

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
        authorUid: msg.authorUid || undefined,
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
      authorUid: profile.firebaseUid,
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

  async function sendGift(giftId: string, multiplier: 1 | 2 | 4 | 8 = 1) {
    if (sendingGift) return;
    if (isHostRoom) {
      setGiftError('No puedes enviarte regalos a ti mismo mientras transmites');
      return;
    }
    const catalog = findLiveGift(giftId);
    if (!catalog) return;
    const mult = [1, 2, 4, 8].includes(multiplier) ? multiplier : 1;
    const totalCoins = catalog.coins * mult;
    if (!profile) {
      setGiftError('Inicia sesión para enviar regalos');
      return;
    }
    if (coins < totalCoins) {
      setGiftError('Saldo insuficiente. Recarga coins para continuar.');
      setRechargeNeeded(totalCoins);
      setOpenGifts(true);
      setPendingGiftId(null);
      return;
    }

    setGiftError(null);
    setRechargeNeeded(null);
    setSendingGift(giftId);
    setPendingGiftId(null);
    setOpenGifts(false);
    setGiftMultiplier(1);
    const previousCoins = coins;
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const senderName = profile.displayName || profile.handle || 'Liveboomer';

    try {
      const result = await sendLiveboomGift({
        giftId: catalog.id,
        senderUid: profile.firebaseUid,
        senderName,
        senderBalance: previousCoins,
        recipientUsername: roomName,
        clientId,
        roomName,
        multiplier: mult,
      });
      setCoins(result.senderBalance);
      void setFirestoreCoins(profile.firebaseUid, result.senderBalance).catch(() => undefined);
      void addLevelXp(profile.firebaseUid, totalCoins)
        .then((xp) => {
          levelXpRef.current = xp;
        })
        .catch(() => undefined);

      const levelInfo = levelFromXp(levelXpRef.current);
      const chatGift = {
        id: `gift-${clientId}`,
        author: senderName,
        authorUid: profile.firebaseUid,
        text: mult > 1 ? `envió ${catalog.name} x${mult}` : `envió ${catalog.name}`,
        gift: { giftId: catalog.id, emoji: catalog.emoji, name: catalog.name },
        levelBadge: levelInfo.badge,
      };

      pushMessage(chatGift);
      persistChatCopy(chatGift);
      window.dispatchEvent(
        new CustomEvent('liveboom:gift', {
          detail: { id: clientId, giftId: catalog.id, senderName, multiplier: mult },
        }),
      );
      void publishRoomData(room, {
        type: 'gift',
        id: clientId,
        giftId: catalog.id,
        senderName,
        giftName: catalog.name,
        emoji: catalog.emoji,
        multiplier: mult,
      }).catch((error) => console.error('[gift] publishData', error));
      if (!result.usedFallback) {
        void publishLiveGift(roomName, {
          clientId,
          giftId: catalog.id,
          giftName: catalog.name,
          emoji: catalog.emoji,
          senderName,
          senderUid: profile.firebaseUid,
          coins: totalCoins,
          multiplier: mult,
        }).catch((error) => console.error('[gift] firestore', error));
      }
      void publishLiveChatMessage(roomName, {
        clientId: chatGift.id,
        authorUid: profile.firebaseUid,
        author: senderName,
        text: chatGift.text,
        gift: chatGift.gift,
      }).catch((error) => console.error('[gift] chat-history', error));
    } catch (err) {
      setCoins(previousCoins);
      const message = err instanceof Error ? err.message : 'No se pudo enviar el regalo';
      setGiftError(message);
      setOpenGifts(true);
      if (/insuficiente|saldo|402/i.test(message)) setRechargeNeeded(totalCoins);
    } finally {
      setSendingGift(null);
    }
  }

  const isSpectator = !canPublish && !isHostRoom;

  if (isSpectator && chatHidden) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:h-full lg:w-[30%] lg:min-w-[260px] lg:flex-col lg:justify-end lg:border lg:border-white/10 lg:rounded-2xl lg:bg-zinc-900/80 lg:p-3">
        {inviteBanner ? (
          <div className="pointer-events-auto mb-2 w-full rounded-lg bg-cyan-500/20 px-2 py-1.5 text-[11px] text-cyan-100 backdrop-blur lg:mb-0">
            <span className="mr-2">{inviteBanner}</span>
            <button
              type="button"
              onClick={() => (onAcceptInvite ? onAcceptInvite() : window.location.reload())}
              className="rounded-md bg-cyan-400 px-2 py-0.5 text-[10px] font-bold text-zinc-950"
            >
              Unirme ahora
            </button>
          </div>
        ) : null}
        <div className="pointer-events-auto flex w-full items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setChatHidden(false);
              window.setTimeout(() => inputRef.current?.focus(), 80);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-2 text-xs font-semibold text-white backdrop-blur ring-1 ring-white/15"
          >
            <MessageCircle size={14} /> Comentario
          </button>
          <button
            type="button"
            onClick={() => {
              setChatHidden(false);
              setOpenGifts(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-3 py-2 text-xs font-bold text-zinc-950"
          >
            <Gift size={14} /> Regalos
          </button>
        </div>
      </div>
    );
  }

  return (
    <aside
      className={`z-20 flex min-h-0 min-w-0 flex-col overflow-hidden border-white/10 lg:static lg:h-full lg:min-h-0 lg:max-h-full lg:w-[30%] lg:min-w-[260px] lg:rounded-2xl lg:border ${
        canPublish
          ? `pointer-events-none absolute inset-x-0 bottom-0 border-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent lg:pointer-events-auto lg:relative lg:inset-auto lg:h-full lg:max-h-full lg:bg-black/10 lg:backdrop-blur-[2px] ${
              openGifts
                ? 'h-[min(62dvh,28rem)] max-h-[68dvh]'
                : 'h-[min(48dvh,22rem)] max-h-[52dvh] sm:h-[44dvh]'
            }`
          : `relative border-t bg-zinc-900/95 lg:h-full lg:max-h-full lg:border-t-0 lg:bg-zinc-800/45 lg:backdrop-blur-xl ${
              openGifts
                ? 'h-[min(58dvh,26rem)] max-h-[64dvh]'
                : 'h-[min(42dvh,20rem)] max-h-[48dvh] sm:h-[40dvh]'
            }`
      }`}
    >
      <div className={`pointer-events-auto shrink-0 px-4 py-2 ${canPublish ? 'bg-transparent' : 'border-b border-white/10'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className={`text-[11px] ${canPublish ? 'text-zinc-200 drop-shadow' : 'text-zinc-400'}`}>
              Saldo: {coins.toLocaleString('es-CO')} coins
            </p>
            {!isHostRoom ? (
              <button
                type="button"
                onClick={() => setRechargeOpen(true)}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-2.5 py-1 text-[10px] font-bold text-zinc-950 shadow-[0_0_12px_rgba(255,0,85,0.35)]"
              >
                <Coins size={11} />
                Recargar
              </button>
            ) : null}
          </div>
          {isSpectator ? (
            <button
              type="button"
              onClick={() => {
                setChatHidden(true);
                setOpenGifts(false);
              }}
              className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-zinc-200"
            >
              Ocultar
            </button>
          ) : null}
        </div>
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
      <div className="pointer-events-auto relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={listRef}
          onScroll={onChatScroll}
          className="chat-scroll min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3"
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
          {messages.map((message) => {
            const nameClass = `font-semibold hover:underline ${chatAuthorClass(message.author, giftCoinsByName)}`;
            return message.gift ? (
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
                  {message.authorUid ? (
                    <Link to={profileHref(message.author, message.authorUid)} className={nameClass}>
                      {message.author}
                    </Link>
                  ) : (
                    <span className={nameClass}>{message.author}</span>
                  )}
                  {' envió '}
                  {message.gift.name}
                </p>
              </div>
            ) : (
              <p key={message.id} className="text-sm text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                {message.authorUid ? (
                  <Link to={profileHref(message.author, message.authorUid)} className={nameClass}>
                    {message.author}:{' '}
                  </Link>
                ) : (
                  <span className={nameClass}>{message.author}: </span>
                )}
                {message.text}
              </p>
            );
          })}
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
      <div className={`pointer-events-auto relative shrink-0 space-y-0 p-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-3 ${canPublish ? 'bg-gradient-to-t from-black/70 to-transparent' : 'border-t border-white/10'}`}>
        {openGifts && pendingGiftId ? (
          <div className="mb-2 rounded-xl border border-cyan-400/25 bg-zinc-950/95 p-2.5 backdrop-blur sm:p-3">
            {(() => {
              const gift = findLiveGift(pendingGiftId);
              if (!gift) return null;
              const total = gift.coins * giftMultiplier;
              const canAfford = coins >= total;
              return (
                <>
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <GiftIcon giftId={gift.id} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">
                        ¿Enviar {gift.name}?
                      </p>
                      <p className="text-[11px] text-amber-300">
                        {total.toLocaleString('es-CO')} coins
                        {giftMultiplier > 1 ? (
                          <span className="ml-1 text-zinc-400">
                            ({gift.coins.toLocaleString('es-CO')} ×{giftMultiplier})
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Multiplicador
                  </p>
                  <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                    {([1, 2, 4, 8] as const).map((m) => {
                      const cost = gift.coins * m;
                      const ok = coins >= cost;
                      const active = giftMultiplier === m;
                      return (
                      <button
                          key={m}
                        type="button"
                          onClick={() => setGiftMultiplier(m)}
                          className={`min-h-10 rounded-lg border text-xs font-bold transition active:scale-95 ${
                            active
                              ? 'border-cyan-400 bg-cyan-400/20 text-cyan-200'
                              : ok
                                ? 'border-white/15 bg-white/5 text-zinc-200'
                                : 'border-white/10 bg-zinc-900/80 text-zinc-500'
                          }`}
                        >
                          x{m}
                      </button>
                      );
                    })}
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPendingGiftId(null);
                        setGiftMultiplier(1);
                      }}
                      className="min-h-11 flex-1 rounded-lg border border-white/15 px-3 text-sm font-semibold text-zinc-200"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(sendingGift) || !canAfford}
                      onClick={() => void sendGift(gift.id, giftMultiplier)}
                      className="min-h-11 flex-[1.4] rounded-lg bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-3 text-sm font-bold text-zinc-950 disabled:opacity-60"
                    >
                      {sendingGift ? '…' : `Enviar x${giftMultiplier}`}
                    </button>
                </div>
                  {giftError ? (
                    <p className="mt-2 text-center text-xs text-fuchsia-400">{giftError}</p>
                  ) : null}
                  {rechargeNeeded != null && coins < rechargeNeeded ? (
                    <RechargeButton onClick={() => setRechargeOpen(true)} className="mt-2 w-full text-sm" />
                  ) : null}
                </>
              );
            })()}
          </div>
        ) : null}
        {openGifts && !pendingGiftId ? (
          <div className="-mx-3 mb-2">
            <GiftBoxStrip
              gifts={giftCatalog}
              sendingGiftId={sendingGift}
              coins={coins}
              error={giftError}
              rechargeNeeded={rechargeNeeded}
              onRecharge={() => setRechargeOpen(true)}
              onSelect={(id) => {
                setGiftError(null);
                setRechargeNeeded(null);
                setGiftMultiplier(1);
                setPendingGiftId(id);
              }}
              onClose={() => {
                setOpenGifts(false);
                setPendingGiftId(null);
                setGiftMultiplier(1);
                setGiftError(null);
                setRechargeNeeded(null);
              }}
            />
          </div>
        ) : null}
        {sendingGift ? (
          <p className="mb-2 text-[11px] font-semibold text-cyan-300">Enviando regalo…</p>
        ) : null}
        <div className="flex gap-2">
          {!isHostRoom ? (
          <button
            type="button"
            onClick={() => setOpenGifts((value) => !value)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 text-zinc-950 shadow-[0_0_18px_rgba(255,0,85,0.35)]"
            aria-label="Caja de regalos"
          >
            <Gift size={18} />
          </button>
          ) : null}
          <input
            ref={inputRef}
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
