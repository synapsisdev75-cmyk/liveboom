import '@livekit/components-styles';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useLocalParticipant,
  useRoomContext,
  useTracks,
  type TrackReference,
} from '@livekit/components-react';
import {
  ConnectionState,
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  type RoomConnectOptions,
  type RoomOptions,
} from 'livekit-client';
import {
  Eye,
  Gift,
  Radio,
  Send,
  Share2,
  SwitchCamera,
  FlipHorizontal,
  Users,
  ChevronLeft,
  ChevronRight,
  X,
  Mic,
  MicOff,
  MonitorUp,
  MessageCircle,
  Plus,
  Gamepad2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { FloatingGift, GiftIcon } from '../components/live/FloatingGift';
import { LiveWishCarousel } from '../components/live/LiveWishCarousel';
import { LiveWishHexStage } from '../components/live/LiveWishHexStage';
import { LiveWishAchievedCard } from '../components/live/LiveWishAchievedCard';
import { LiveViewerListRow } from '../components/live/LiveViewerListRow';
import {
  LivePrivacyLockButton,
  LivePrivacyRequestStrip,
  LivePrivacyRequestsSheet,
  LivePrivacySetupSheet,
  LivePrivateWaitingGate,
  PRIVATE_GATE_MAX_REJECTS,
} from '../components/live/privacy';
import {
  clearPrivateSchedule,
  listenMyPrivateGrant,
  listenMyPrivateRequest,
  listenPendingPrivateRequests,
  listenPrivateSchedule,
  type PrivateAccessRequest,
  type PrivateGiftRequirementProgress,
  type PrivateLivePhase,
} from '../lib/livePrivateAccessFirestore';
import { LiveNewCoinGoalModal } from '../components/live/LiveNewCoinGoalModal';
import { LiveChatUserIdentity } from '../components/live/LiveChatUserIdentity';
import type { AchievedWish } from '../lib/liveWishAchieved';
import { GiftBoxStrip } from '../components/live/GiftBoxStrip';
import { FaceMeshGiftOverlay, type ActiveFaceGift } from '../components/live/FaceMeshGiftOverlay';
import { LiveFramedVideo } from '../components/live/LiveFramedVideo';
import { LiveFrameEditor } from '../components/live/LiveFrameEditor';
import { BoomReactionLayer } from '../components/live/studio/BoomReactionLayer';
import { EndLiveModal } from '../components/live/studio/EndLiveModal';
import { BatallaBoomModal, SalaBoomModal } from '../components/live/studio/LiveMultipartyModals';
import type {
  SalaInviteHostStatus,
  SalaInviteViewer,
} from '../components/live/studio/LiveMultipartyModals';
import { SalaBoomStage } from '../components/live/studio/SalaBoomStage';
import { BattleStage } from '../components/live/studio/BattleStage';
import { useAgoraBattle } from '../components/live/studio/useAgoraBattle';
import { useHostLiveDeepAr } from '../components/live/studio/useHostLiveDeepAr';
import { VerticalLiveToolsMenu } from '../components/live/studio/VerticalLiveToolsMenu';
import { VsBattleIcon } from '../components/live/studio/VsBattleIcon';
import {
  HostLiveFooterBar,
  HostLiveLeftRail,
  ViewerLiveInfoBar,
  formatLiveCompact,
  formatLiveElapsed,
  type RecentLiveGiftRow,
} from '../components/live/studio/LiveRoomMockupChrome';
import { useBoomGesture } from '../components/live/studio/useBoomGesture';
import { useLiveBoomBursts } from '../components/live/studio/useLiveBoomBursts';
import type { ConnectionQuality } from '../components/live/studio/liveStudioTypes';
import {
  listLiveMediaDevices,
  liveCameraFacing,
} from '../lib/liveMediaDevices';
import { ensureNativeLiveAvPermissions } from '../lib/nativeLiveMedia';
import { followUser, isFollowing, unfollowUser } from '../lib/socialFirestore';
import { CoinModal, RechargeButton } from '../components/wallet/CoinModal';
import { WithdrawModal } from '../components/wallet/WithdrawModal';
import { api, apiPublic, ApiError } from '../lib/api';
import {
  bumpLiveSwitchGen,
  currentLiveSwitchGen,
  disconnectLiveRoomQuiet,
  fetchLiveViewerToken,
  forgetLiveToken,
  neighborPair,
  peekCachedLiveToken,
  pickNeighborLive,
  prefetchLiveViewerTokens,
  rememberLiveToken,
  warmupLivePoster,
  watchSpectatorLiveQuality,
  type LiveSwitchToken,
} from '../lib/liveCarouselSwitch';
import { roomKey } from '../lib/roomKey';
import { takeLiveCameraHandoff, discardLiveCameraHandoff } from '../lib/liveCameraHandoff';
import { isFaceAnchoredGift } from '../lib/faceGiftAnchors';
import {
  LIVE_VIEWER_HEARTBEAT_TTL_MS,
  listenLiveGifts,
  listenLiveRoomEarnings,
  startLiveCoinGoal,
  liveGoalProgress,
  type LiveCoinGoalCycle,
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
  unregisterLiveViewer,
  listenLiveRoomStatus,
  archiveLiveActivity,
  notifyNetworkImLive,
  setLiveWishlist,
  listenLiveWishlist,
  applyLiveWishGiftProgress,
  newLiveWishId,
  liveWishGiftUnits,
  LIVE_WISH_ACTIVE_MAX,
  type LiveWishItem,
  type LiveEndStats,
  sendLiveRoomBoom,
  listenLiveBoomStats,
  listenLiveBoomEvents,
  notifyLiveInvite,
  removeLiveGuestInvites,
  banLiveSalaGuests,
  listenActiveLiveRooms,
  setLiveSalaLayout,
  listenLiveSalaLayout,
} from '../lib/liveGiftsFirestore';
import { useLiveWishAchieved } from '../lib/liveWishAchieved';
import { useLivePresence } from '../hooks/useLivePresence';
import { useLiveCarouselPointer } from '../hooks/useLiveCarouselPointer';
import { useLiveViewport } from '../hooks/useLiveViewport';
import { getLiveRanking } from '../lib/liveRanking';
import {
  prefetchLiveChatAuthorProfiles,
  seedLiveChatAuthorProfile,
} from '../hooks/useLiveChatAuthorProfile';
import { parseSalaBoomLayout, type SalaBoomLayout, type SalaCameraAction } from '../lib/salaBoomLayout';
import { downloadReelBlob, savePendingReel } from '../lib/pendingReelStore';
import { addFirestoreCoins, addLevelXp, fetchLevelXp, profileHref, setFirestoreCoins } from '../lib/profileFirestore';
import { shareContent } from '../lib/shareContent';
import { listFollowers, listFriends } from '../lib/socialFirestore';
import { sendLiveboomGift } from '../lib/giftsFirestore';
import {
  frameAspectRatio,
  LiveScreenComposer,
  readCameraTrackAspect,
  requestScreenCaptureStream,
  SCREEN_SHARE_PIP_OPTS,
  defaultCameraFrameLayout,
  normalizeFrameLayout,
  type LiveFrameLayout,
} from '../lib/liveScreenComposer';
import { screenShareUserMessage, stopNativeScreenShareIfAny, setScreenShareLiveGuard, isScreenShareLiveGuardActive } from '../lib/screenShareService';
import {
  canUseClassicScreenShare,
  canPresentGamingInLive,
  isGamingSpaceSessionActive,
  rememberGamingSpaceSession,
  isAndroidScreenShareDisabled,
  showScreenShareComingSoonButton,
  SCREEN_SHARE_COMING_SOON_MESSAGE,
} from '../lib/liveScreenSharePolicy';
import {
  participantHasHostMedia,
  releaseMediaStream,
  ScreenShareOperationGate,
  waitRoomConnected,
} from '../lib/screenShareSession';
import {
  bindNativeStopScreenShare,
  bindPresentationHudAction,
  bindScreenShareAudioLimited,
  bindScreenShareChatSend,
  bindScreenShareOverlaysVisible,
  ensureNativeScreenSharePermissions,
  getActiveScreenShareTransport,
  getNativeAudioMixerState,
  isNativeAndroidApp,
  setNativeGameVolume,
  setNativeMicVolume,
  setNativeGameAudioMuted,
  setNativeMicMuted,
  setNativePresentationOverlaysVisible,
  showScreenShareOverlayIfAllowed,
  startNativeLiveKitScreenShare,
  startNativeMicStream,
  startNativeScreenAudioStream,
  stopNativeLiveKitScreenShare,
  stopNativeMicStream,
  stopNativeOverlayCameraStream,
  stopNativeScreenAudioStream,
  toggleNativeGameAudioMuted,
  toggleNativeMicMuted,
  updateScreenShareChatHud,
  waitForNativeGameAudioSignal,
  waitForNativeMicSignal,
} from '../lib/nativeLiveMedia';
import {
  isHostOrScreenParticipant,
  isScreenShareIdentity,
  isScreenShareForOwner,
  screenShareIdentityFor,
  type ScreenShareTransport,
} from '../lib/screenShareIdentity';
import {
  beginScreenShareSession,
  endScreenShareSession,
  screenShareSessionIdFor,
} from '../lib/screenShareSessionCoordinator';
import {
  pushScreenShareDiag,
  readHostPublisherStats,
  ssLog,
} from '../lib/screenShareDiagnostics';
import { getScreenShareQuality } from '../lib/screenShareQuality';
import { resolveScreenShareTransport } from '../lib/screenShareTransport';
import {
  guardEnterSalaOrBattle,
  guardEnterScreenShare,
  logBattleStart,
  logModeNormal,
  logSalaStart,
  logScreenStart,
  logScreenStop,
  forcePushScreenShareChatLines,
  pushScreenShareChatLinesIfChanged,
  resetScreenShareChatHudCache,
  ScreenShareContainer,
  getScreenShareSession,
  useScreenShareSynchronization,
} from '../live/screen-share';
import { GamingPresentPanel } from '../components/live/studio/GamingPresentPanel';
import {
  LiveScreenShareWizard,
  type ScreenShareWizardResult,
} from '../components/live/studio/LiveScreenShareWizard';
import { LiveScreenShareControlsSheet } from '../components/live/studio/LiveScreenShareControlsSheet';
import {
  DEFAULT_LIVE_ASPECT_RATIO,
  liveStageInnerClass,
  liveStageOuterClass,
  liveStageSectionClass,
  liveHostControlsBottomClass,
  parseLiveAspectRatio,
  type LiveAspectRatio,
} from '../lib/liveAspectRatio';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { levelFromXp } from '../lib/userLevels';
import {
  GIFT_LEVEL_FX,
  findLiveGift,
  isDeeparLiveGift,
  sortedLiveGiftCatalog,
} from '../lib/liveboomGifts';
import { getSocket } from '../lib/socket';
import { useAuthStore } from '../store/authStore';
import { getLocale } from '../store/localeStore';
import { TranslatedText } from '../components/i18n/TranslatedText';
import { useT } from '../i18n';

type LockGiftRequirement = {
  giftId: string;
  giftName: string;
  coins: number;
  emoji: string;
  quantity: number;
};

type LockInfo = {
  giftId: string;
  giftName: string;
  coins: number;
  emoji: string;
  quantity?: number;
  privateSessionId?: string;
  sealed?: boolean;
  requirements?: LockGiftRequirement[];
};

const LIVE_LOCK_ACTIVE_MAX = 1;
const LIVE_STATUS_NOTE_MS = 20_000;

function lockRequirementsOf(lock: LockInfo | null | undefined): LockGiftRequirement[] {
  if (!lock) return [];
  if (Array.isArray(lock.requirements) && lock.requirements.length) {
    return lock.requirements.map((row) => ({
      giftId: row.giftId,
      giftName: row.giftName || row.giftId,
      coins: Math.max(0, Number(row.coins) || 0),
      emoji: row.emoji || '🔒',
      quantity: Math.min(99, Math.max(1, Math.floor(Number(row.quantity) || 1))),
    }));
  }
  return [
    {
      giftId: lock.giftId,
      giftName: lock.giftName,
      coins: Math.max(0, Number(lock.coins) || 0),
      emoji: lock.emoji || '🔒',
      quantity: Math.min(99, Math.max(1, Math.floor(Number(lock.quantity) || 1))),
    },
  ];
}

function lockGiftIdsOf(lock: LockInfo | null | undefined): string[] {
  return lockRequirementsOf(lock).map((row) => row.giftId);
}

type FloatingGiftItem = { id: string; giftId: string; left: number; senderName?: string; combo?: number };

const REEL_SECONDS = 15;
const LIVE_MIRROR_KEY = 'liveboom.liveMirror.v1';

function loadLiveMirrorPref(): boolean | null {
  try {
    const raw = localStorage.getItem(LIVE_MIRROR_KEY);
    if (raw === null) return null;
    return raw === '1';
  } catch {
    return null;
  }
}

const LIVEKIT_ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  // En Android el diálogo de captura dispara page-leave y mataba el LIVE.
  disconnectOnPageLeave: true,
};

function buildLiveKitRoomOptions(): RoomOptions {
  return {
    ...LIVEKIT_ROOM_OPTIONS,
    disconnectOnPageLeave: !isNativeAndroidApp(),
  };
}

const LIVEKIT_CONNECT_OPTIONS: RoomConnectOptions = {
  autoSubscribe: true,
  maxRetries: 1,
  peerConnectionTimeout: 8_000,
};

type LiveLaunchState = {
  goLive?: boolean;
  title?: string;
  isPrivate?: boolean;
  category?: string;
  goalCoins?: number;
  goalLabel?: string;
  aspectRatio?: LiveAspectRatio;
  cameraId?: string | null;
  microphoneId?: string | null;
  mirror?: boolean;
  micOn?: boolean;
  liveCarouselDir?: 1 | -1;
  /** LIVE iniciado desde Espacio Gaming (móvil y tablet Android). */
  gamingSpace?: boolean;
  gamingShareTarget?: 'full_display' | 'single_app';
  gamingDeviceAudioOn?: boolean;
  /** Candado elegido en Transmitir: recolección pública hasta el 100%. */
  privacyLock?: {
    requirements: Array<{ giftId: string; quantity: number }>;
    countdownDurationMs: number;
  };
};

type LiveSessionStats = {
  username: string;
  startedAt: string;
  goalCoins: number;
  goalLabel: string;
  coinsEarned: number;
  topGifters: { uid: string; name: string; coins: number }[];
};

function persistLiveStartedAt(...values: Array<string | null | undefined>): string {
  let min = Infinity;
  for (const value of values) {
    const ms = value ? Date.parse(value) : NaN;
    if (Number.isFinite(ms) && ms > 0 && ms < min) min = ms;
  }
  return Number.isFinite(min) && min < Infinity ? new Date(min).toISOString() : '';
}

type ChatMessage = {
  id: string;
  author: string;
  authorUid?: string;
  text: string;
  sourceLang?: string | null;
  gift?: { giftId: string; emoji: string; name: string };
  levelBadge?: string;
};

const liveChatCache = new Map<string, ChatMessage[]>();

function clearLiveChatCache(roomName: string) {
  liveChatCache.delete(roomName.trim().toLowerCase());
  liveChatCache.delete(roomName);
}

function screenShareChatLinesFromCache(roomName: string): string[] {
  const cached = liveChatCache.get(roomName) ?? liveChatCache.get(roomName.trim().toLowerCase()) ?? [];
  return cached.slice(-5).map((m) => {
    const who = String(m.author || '').slice(0, 14);
    const body = String(m.text || '').slice(0, 80);
    return `@${who}: ${body}`;
  });
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
  | { type: 'chat'; id: string; author: string; authorUid?: string; text: string; sourceLang?: string | null }
  | {
      type: 'gift';
      id: string;
      giftId: string;
      senderName: string;
      giftName: string;
      emoji: string;
      multiplier?: number;
    }
  | {
      type: 'invite';
      guestHandle: string;
      hostName: string;
      inviteId?: string;
      liveId?: string;
      hostId?: string;
      viewerId?: string;
      targetSlot?: string;
    }
  | {
      type: 'invite_response';
      status: 'accepted' | 'declined';
      inviteId?: string;
      viewerId?: string;
      username?: string;
    }
  | { type: 'lock'; lock: LockInfo | null }
  | { type: 'live_ended'; hostName?: string }
  | {
      type: 'viewer_join';
      id: string;
      name: string;
      level: number;
      badge: string;
    }
  | { type: 'boom'; id: string; nx: number; ny: number; uid?: string }
  | { type: 'pip_sync'; nx: number; ny: number; nw?: number; visible: boolean }
  | { type: 'sala_layout'; layout: SalaBoomLayout; pin?: string | null }
  | { type: 'sala_control'; action: SalaCameraAction; identity: string }
  | { type: 'live_kick'; identity: string };

function publishFrameSync(
  room: ReturnType<typeof useRoomContext>,
  layout: LiveFrameLayout,
  visible: boolean,
) {
  const normalized = normalizeFrameLayout(layout);
  return publishRoomData(room, {
    type: 'pip_sync',
    nx: normalized.nx,
    ny: normalized.ny,
    nw: normalized.nw,
    visible,
  });
}

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
  const t = useT();
  const navigate = useNavigate();
  const { username } = useParams();
  const location = useLocation();
  const launch = (location.state as LiveLaunchState | null) || {};
  const ready = useAuthStore((state) => state.ready);
  const firebaseUid = useAuthStore((state) => state.profile?.firebaseUid);
  const handle = useAuthStore((state) => state.profile?.handle);
  const profile = useAuthStore((state) => state.profile);
  const canonicalRoom = username ? roomKey(username) : '';
  const activeRoomRef = useRef(canonicalRoom);
  const livekitRoom = useMemo(() => new Room(buildLiveKitRoomOptions()), []);
  const [session, setSession] = useState<{
    token: string;
    serverUrl: string;
    canPublish: boolean;
    isHost?: boolean;
    roomName: string;
    hostUid?: string | null;
  } | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [battleActive, setBattleActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveStarted, setLiveStarted] = useState(false);
  /** Solo true tras “Finalizar live” explícito (no desmontajes temporales). */
  const intentionalLiveEndRef = useRef(false);
  const liveStartedRef = useRef(liveStarted);
  liveStartedRef.current = liveStarted;
  const isOwnRoomRef = useRef(false);
  const [liveKitConnect, setLiveKitConnect] = useState(true);
  const [isPrivate, setIsPrivate] = useState(Boolean(launch.isPrivate));
  const [gateLock, setGateLock] = useState<LockInfo | null>(null);
  const [gateSessionId, setGateSessionId] = useState<string | null>(null);
  const [gateSendingGiftId, setGateSendingGiftId] = useState<string | null>(null);
  const [gateGiftError, setGateGiftError] = useState<string | null>(null);
  const [gateRequestStatus, setGateRequestStatus] = useState<
    'outside' | 'pending' | 'approved' | 'rejected'
  >('outside');
  const [gateRejectCount, setGateRejectCount] = useState(0);
  const prevGateReqRef = useRef<'outside' | 'pending' | 'approved' | 'rejected'>('outside');
  const gateClaimOnceRef = useRef<string | null>(null);
  const privacyLaunchAppliedRef = useRef(false);
  const setCoins = useAuthStore((state) => state.setCoins);
  const coinsBalance = useAuthStore((state) => state.profile?.coinsBalance ?? 0);
  const [viewerPaused, setViewerPaused] = useState(false);
  const gateLockRef = useRef<LockInfo | null>(null);
  gateLockRef.current = gateLock;
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
  isOwnRoomRef.current = isOwnRoom;
  const needsLaunchConfirm = isOwnRoom && !launch.goLive && !liveStarted;

  useEffect(() => {
    activeRoomRef.current = canonicalRoom;
    bumpLiveSwitchGen(canonicalRoom);
    const prev = sessionRef.current;
    const keepChrome = Boolean(prev && !prev.canPublish && !prev.isHost);
    if (!keepChrome) {
      setSession(null);
      setLiveStarted(false);
    }
    // No cortar LiveKit al rotar sala si hay pantalla compartida activa.
    if (!isScreenShareLiveGuardActive()) {
      disconnectLiveRoomQuiet(livekitRoom);
    }
    setError(null);
    setGateLock(null);
    setViewerPaused(false);
    setLiveKitConnect(true);
  }, [canonicalRoom, livekitRoom]);

  useEffect(() => {
    return () => {
      // Vista desmontada ≠ Finalizar live / dejar de compartir.
      if (isScreenShareLiveGuardActive()) {
        console.log('[LIVE] unmount skipped disconnect (screen-share guard)');
        return;
      }
      if (
        isNativeAndroidApp() &&
        isOwnRoomRef.current &&
        liveStartedRef.current &&
        !intentionalLiveEndRef.current
      ) {
        console.log('[LIVE] unmount skipped disconnect (Android host continuity)');
        return;
      }
      disconnectLiveRoomQuiet(livekitRoom);
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

  async function fetchToken(options?: {
    resume?: boolean;
    forceFresh?: boolean;
  }): Promise<{
    token: string;
    serverUrl: string;
    canPublish: boolean;
    isHost?: boolean;
    roomName?: string;
    hostUid?: string | null;
  } | null> {
    const profile = useAuthStore.getState().profile;
    if (!username || !profile) return null;
    const resume = Boolean(options?.resume);
    const forceFresh = Boolean(options?.forceFresh);
    // Inicio nuevo vs recuperar sesión (volver de otra app / rejoin).
    if (isOwnRoom && !resume) {
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
        goalCoins: Number(launch.goalCoins) || 0,
        goalLabel: launch.goalLabel || 'Meta en coins',
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
    } else if (isOwnRoom && resume) {
      // Solo reafirma presencia; no limpia chat ni reinicia metas/stats.
      void touchLiveRoomHeartbeat(username).catch(() => undefined);
      if (!liveStarted) setLiveStarted(true);
    }
    const targetRoom = canonicalRoom;
    if (!targetRoom) return null;
    const tokenHandle = encodeURIComponent(profile.handle);
    // Tras aceptar Sala Boom NO reutilizar token de espectador (causa pantalla negra).
    if (forceFresh) forgetLiveToken(username);
    const cached = !isOwnRoom && !forceFresh ? peekCachedLiveToken(username) : null;
    let data: {
      token: string;
      serverUrl: string;
      canPublish: boolean;
      isHost?: boolean;
      roomName?: string;
      hostUid?: string | null;
    };
    try {
      data =
        cached ||
        (await api<{
          token: string;
          serverUrl: string;
          canPublish: boolean;
          isHost?: boolean;
          roomName?: string;
          hostUid?: string | null;
        }>(`/api/stream/token/${encodeURIComponent(username)}?handle=${tokenHandle}`));
    } catch (err) {
      const code = err instanceof ApiError ? String(err.data?.code || '') : '';
      if (code === 'VIEWER_KICKED' || code === 'LIVE_BANNED') {
        forgetLiveToken(username);
        navigate('/', { replace: true });
        return null;
      }
      throw err;
    }
    if (activeRoomRef.current !== targetRoom) return null;
    if (!data.canPublish && !data.isHost) {
      rememberLiveToken(username, {
        token: data.token,
        serverUrl: data.serverUrl,
        canPublish: data.canPublish,
        isHost: data.isHost,
        roomName: data.roomName || targetRoom,
        hostUid: data.hostUid ?? null,
      });
    } else {
      // Token de host/invitado: no dejar cacheado un viewer viejo.
      forgetLiveToken(username);
    }
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
    return data;
  }

  useEffect(() => {
    if (!username || !handle || needsLaunchConfirm) return;
    let cancelled = false;
    const gen = currentLiveSwitchGen();
    const abort = new AbortController();
    const applyToken = (data: LiveSwitchToken) => {
      if (cancelled || activeRoomRef.current !== canonicalRoom) return;
      setSession((current) => {
        const next = {
          token: data.token,
          serverUrl: data.serverUrl,
          canPublish: data.canPublish,
          isHost: data.isHost,
          roomName: data.roomName || canonicalRoom,
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
    };
    void (async () => {
      try {
        if (!isOwnRoom) {
          const cachedToken = peekCachedLiveToken(username);
          const [lockState, token] = await Promise.all([
            api<{
              locked: boolean;
              unlocked: boolean;
              isPrivate?: boolean;
              isHost: boolean;
              lock: LockInfo | null;
            }>(
              `/api/stream/lock/${encodeURIComponent(username)}?handle=${encodeURIComponent(handle)}`,
              { signal: abort.signal },
            ),
            cachedToken
              ? Promise.resolve(cachedToken)
              : fetchLiveViewerToken(username, handle, gen),
          ]);
          if (cancelled || gen !== currentLiveSwitchGen()) return;
          if (lockState.isPrivate && !lockState.unlocked && !lockState.isHost && lockState.lock) {
            setGateLock(lockState.lock);
            return;
          }
          if (token && !token.canPublish && !token.isHost) {
            applyToken(token);
            return;
          }
        } else {
          const lockState = await api<{
            locked: boolean;
            unlocked: boolean;
            isPrivate?: boolean;
            isHost: boolean;
            lock: LockInfo | null;
          }>(
            `/api/stream/lock/${encodeURIComponent(username)}?handle=${encodeURIComponent(handle)}`,
            { signal: abort.signal },
          );
          if (cancelled) return;
          if (lockState.isPrivate && !lockState.unlocked && !lockState.isHost && lockState.lock) {
            setGateLock(lockState.lock);
            return;
          }
        }
        await fetchToken();
      } catch (err: unknown) {
        if (cancelled || abort.signal.aborted) return;
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
      abort.abort();
    };
  }, [firebaseUid, username, needsLaunchConfirm, handle, isOwnRoom, canonicalRoom]);

  useEffect(() => {
    if (!gateLock || !username || !handle) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void api<{
        locked: boolean;
        unlocked: boolean;
        isPrivate?: boolean;
        isHost: boolean;
        lock: LockInfo | null;
        requestStatus?: 'outside' | 'pending' | 'approved' | 'rejected';
        coinsBalance?: number;
      }>(
        `/api/stream/lock/${encodeURIComponent(username)}?handle=${encodeURIComponent(handle)}`,
      )
        .then((lockState) => {
          if (cancelled) return;
          if (typeof lockState.coinsBalance === 'number') {
            setCoins(lockState.coinsBalance);
          }
          if (lockState.requestStatus === 'pending' || lockState.requestStatus === 'rejected') {
            setGateRequestStatus(lockState.requestStatus);
          }
          if (lockState.requestStatus === 'approved' || !lockState.isPrivate || lockState.unlocked || lockState.isHost) {
            if (lockState.requestStatus === 'approved' || lockState.unlocked || lockState.isHost || !lockState.isPrivate) {
              setGateLock(null);
              void fetchToken();
            }
          }
        })
        .catch(() => undefined);
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [gateLock, username, handle]);

  /**
   * iPhone Safari / Capacitor / cualquier plataforma: al volver de background
   * re-consultar el candado durable (misma API). No duplica el interval de gateLock:
   * solo un fetch al foreground / pageshow.
   */
  useEffect(() => {
    if (!username || !handle || isOwnRoom) return;
    let busy = false;
    const refreshDurableLock = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (busy) return;
      busy = true;
      void api<{
        locked?: boolean;
        unlocked?: boolean;
        isPrivate?: boolean;
        isHost: boolean;
        lock: LockInfo | null;
      }>(
        `/api/stream/lock/${encodeURIComponent(username)}?handle=${encodeURIComponent(handle)}`,
      )
        .then((lockState) => {
          if (lockState.isHost) {
            if (gateLockRef.current) {
              setGateLock(null);
              setViewerPaused(false);
              void fetchToken();
            }
            return;
          }
          if (lockState.isPrivate && !lockState.unlocked && lockState.lock) {
            setGateLock(lockState.lock);
            setViewerPaused(true);
            return;
          }
          if (gateLockRef.current) {
            setGateLock(null);
            setViewerPaused(false);
            void fetchToken();
          }
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') refreshDurableLock();
    };
    const onPageShow = () => refreshDurableLock();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [username, handle, isOwnRoom]);

  async function claimPrivateAccessFromGrant(sessionKey?: string | null) {
    if (!username || !firebaseUid) return false;
    const key = sessionKey || gateSessionId || 'grant';
    if (gateClaimOnceRef.current === key) return true;
    gateClaimOnceRef.current = key;
    try {
      await api('/api/stream/claim-access', {
        method: 'POST',
        body: JSON.stringify({ roomName: username, handle }),
      });
      setGateLock(null);
      setViewerPaused(false);
      await fetchToken();
      return true;
    } catch {
      gateClaimOnceRef.current = null;
      setGateRequestStatus((cur) => (cur === 'approved' ? 'outside' : cur));
      return false;
    }
  }

  async function sendGateLockGift(giftId: string) {
    if (!username || !firebaseUid || !profile || gateSendingGiftId) return;
    if (gateRequestStatus === 'pending' || gateRequestStatus === 'approved') {
      setGateGiftError(gateRequestStatus === 'pending' ? 'Solicitud pendiente' : null);
      return;
    }
    if (gateRejectCount >= PRIVATE_GATE_MAX_REJECTS) {
      navigate('/', { replace: true });
      return;
    }
    const catalog = findLiveGift(giftId);
    if (!catalog) return;
    if (coinsBalance < catalog.coins) {
      setGateGiftError('Saldo insuficiente. Recarga coins para continuar.');
      return;
    }
    setGateGiftError(null);
    setGateSendingGiftId(giftId);
    const clientId = `gate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const previous = coinsBalance;
    try {
      const result = await api<{
        pending?: boolean;
        unlocked?: boolean;
        duplicate?: boolean;
        requestStatus?: 'outside' | 'pending' | 'approved' | 'rejected';
        senderBalance?: number;
      }>('/api/stream/unlock', {
        method: 'POST',
        body: JSON.stringify({
          roomName: username,
          handle,
          giftId: catalog.id,
          clientId,
          currentBalance: previous,
          username: profile.handle,
        }),
      });
      if (typeof result.senderBalance === 'number') {
        setCoins(result.senderBalance);
        void setFirestoreCoins(firebaseUid, result.senderBalance).catch(() => undefined);
      }
      if (result.unlocked || result.requestStatus === 'approved') {
        await claimPrivateAccessFromGrant(gateSessionId);
        return;
      }
      setGateRequestStatus(result.requestStatus || 'pending');
      if (result.duplicate && result.requestStatus === 'pending') {
        setGateGiftError('Solicitud pendiente');
      }
    } catch (err) {
      setCoins(previous);
      setGateGiftError(err instanceof Error ? err.message : 'No se pudo enviar el regalo');
    } finally {
      setGateSendingGiftId(null);
    }
  }

  useEffect(() => {
    if (!gateLock || !username) return;
    return listenPrivateSchedule(username, (schedule) => {
      setGateSessionId(schedule.privateSessionId);
    });
  }, [gateLock, username]);

  useEffect(() => {
    if (!gateLock || !username || !firebaseUid) return;
    return listenMyPrivateRequest(username, firebaseUid, (row) => {
      if (!row) {
        setGateRequestStatus('outside');
        prevGateReqRef.current = 'outside';
        return;
      }
      if (gateSessionId && row.sessionId && row.sessionId !== gateSessionId) return;
      if (row.status === 'pending') {
        setGateRequestStatus('pending');
        setGateGiftError(null);
        prevGateReqRef.current = 'pending';
        return;
      }
      if (row.status === 'rejected') {
        setGateRequestStatus('rejected');
        if (prevGateReqRef.current !== 'rejected') {
          setGateRejectCount((n) => n + 1);
        }
        prevGateReqRef.current = 'rejected';
        return;
      }
      if (row.status === 'approved') {
        setGateRequestStatus('approved');
        prevGateReqRef.current = 'approved';
        void claimPrivateAccessFromGrant(row.sessionId);
      }
    });
  }, [gateLock, username, firebaseUid, gateSessionId]);

  useEffect(() => {
    if (gateRejectCount < PRIVATE_GATE_MAX_REJECTS || gateRequestStatus !== 'rejected') return;
    const timer = window.setTimeout(() => navigate('/', { replace: true }), 1400);
    return () => window.clearTimeout(timer);
  }, [gateRejectCount, gateRequestStatus, navigate]);

  useEffect(() => {
    if (gateLock) return;
    gateClaimOnceRef.current = null;
    setGateGiftError(null);
    setGateSendingGiftId(null);
    setGateRequestStatus('outside');
    setGateRejectCount(0);
    prevGateReqRef.current = 'outside';
  }, [gateLock]);

  useEffect(() => {
    return () => {
      // No interpretar desmontaje temporal / cambio de actividad como Finalizar.
      if (isScreenShareLiveGuardActive()) return;
      if (isNativeAndroidApp() && !intentionalLiveEndRef.current) return;
      if (!intentionalLiveEndRef.current) return;
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
  // Android: pagehide también ocurre al abrir selector / cambiar de app → no finalizar.
  useEffect(() => {
    if (!liveStarted || !username || !isOwnRoom) return;
    const endLive = () => {
      if (isScreenShareLiveGuardActive()) {
        console.log('[LIVE] pagehide ignored (screen-share guard)');
        return;
      }
      if (isNativeAndroidApp()) {
        console.log('[LIVE] pagehide ignored on Android (Finalizar explícito / heartbeat)');
        return;
      }
      void markLiveRoomEnded(username).catch(() => undefined);
      void api('/api/stream/live/stop', {
        method: 'POST',
        body: JSON.stringify({ username }),
      }).catch(() => undefined);
    };
    window.addEventListener('pagehide', endLive);
    window.addEventListener('beforeunload', endLive);
    return () => {
      window.removeEventListener('pagehide', endLive);
      window.removeEventListener('beforeunload', endLive);
    };
  }, [liveStarted, username, isOwnRoom]);

  // Host Android: al volver a la app, reanudar token/ruta sin live/start ni reset de chat.
  useEffect(() => {
    if (!isNativeAndroidApp() || !isOwnRoom || !liveStarted) return;
    let busy = false;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (intentionalLiveEndRef.current) return;
      const state = livekitRoom.state;
      console.log('[LIVE] host visibility resume check', { state, room: canonicalRoom });
      if (state === ConnectionState.Connected || state === ConnectionState.Reconnecting) {
        return;
      }
      if (busy) return;
      busy = true;
      void (async () => {
        try {
          setLiveKitConnect(true);
          await fetchToken({ resume: true });
        } catch (err) {
          console.warn('[LIVE] host resume failed', err);
        } finally {
          busy = false;
        }
      })();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [isOwnRoom, liveStarted, livekitRoom, canonicalRoom]);

  // live/start ya se hace en fetchToken para el anfitrión
  useEffect(() => {
    if (!username || !firebaseUid || !session?.isHost || !launch.goLive || liveStarted) return;
    setLiveStarted(true);
  }, [username, firebaseUid, session?.isHost, launch.goLive, liveStarted]);

  useEffect(() => {
    if (!isOwnRoom || !liveStarted || !username) return;
    const giftId = String(launch.privacyLock?.requirements?.[0]?.giftId || '').trim();
    if (!giftId || privacyLaunchAppliedRef.current) return;
    privacyLaunchAppliedRef.current = true;
    void api('/api/stream/lock', {
      method: 'POST',
      body: JSON.stringify({ roomName: username, handle, giftId }),
    }).catch(() => undefined);
  }, [isOwnRoom, liveStarted, username, launch.privacyLock]);

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
    const accessGift = lockRequirementsOf(gateLock)[0] || null;
    return (
      <LivePrivateWaitingGate
        gift={
          accessGift
            ? { giftId: accessGift.giftId, giftName: accessGift.giftName }
            : null
        }
        status={gateRequestStatus}
        sending={Boolean(gateSendingGiftId)}
        rejectCount={gateRejectCount}
        error={gateGiftError}
        hostUid={session?.hostUid}
        hostUsername={username}
        onRequest={() => {
          if (accessGift) void sendGateLockGift(accessGift.giftId);
        }}
      />
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
        {t('liveUi.loadingLive')}
      </div>
    );
  }

  const sessionMatchesRoom = session.roomName === canonicalRoom;

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-zinc-950 p-0 sm:p-3">
      <LiveKitRoom
        key={`${session.roomName}-${session.canPublish ? 'pub' : 'sub'}`}
        room={livekitRoom}
        token={session.token}
        serverUrl={session.serverUrl}
        connect={liveKitConnect && sessionMatchesRoom}
        connectOptions={LIVEKIT_CONNECT_OPTIONS}
        video={false}
        audio={false}
        className={`relative flex h-full w-full min-h-0 ${
          session.isHost || isOwnRoom
            ? 'flex-col gap-2 lg:gap-3'
            : 'flex-col lg:flex-row lg:gap-3'
        }`}
      >
        {viewerPaused || battleActive || !sessionMatchesRoom ? null : (
          <>
            <StartAudio label="Toca para activar el audio del LIVE" />
            <RoomAudioRenderer />
          </>
        )}
        <div
          className={
            session.isHost || isOwnRoom
              ? 'flex min-h-0 flex-1 flex-col lg:flex-row lg:gap-3'
              : 'contents'
          }
        >
        <CreatorStage
          username={username!}
          hostUid={sessionMatchesRoom ? session.hostUid || undefined : undefined}
          canPublish={sessionMatchesRoom ? session.canPublish : false}
          isHost={
            sessionMatchesRoom
              ? Boolean(session.isHost ?? (session.canPublish && isOwnRoom))
              : false
          }
          isPrivate={isPrivate}
          aspectRatio={aspectRatio}
          onPrivacyChange={setIsPrivate}
          onViewerPaused={handleViewerPaused}
          onBattleActive={setBattleActive}
          goalCoins={Number(launch.goalCoins) || 0}
          goalLabel={launch.goalLabel || ''}
          liveTitle={launch.title || `Live de ${username}`}
          liveCategory={launch.category || 'otro'}
          hostAvatarUrl={profile?.avatarUrl || null}
          onAcceptSalaInvite={async (invite) => {
            await api('/api/stream/invite/accept', {
              method: 'POST',
              body: JSON.stringify({
                roomName: username,
                liveId: username,
                inviteId: invite?.inviteId,
                viewerId: firebaseUid,
                handle,
              }),
            });
          }}
          onJoinSala1={async () => {
            // Reconectar con token de invitado (canPublish). No vaciar session
            // (setSession(null) dejaba pantalla negra) ni reusar cache de espectador.
            setLiveKitConnect(false);
            await livekitRoom.disconnect().catch(() => undefined);
            let joined = false;
            for (let attempt = 0; attempt < 5; attempt += 1) {
              forgetLiveToken(username);
              const data = await fetchToken({ resume: true, forceFresh: true });
              if (data?.canPublish) {
                joined = true;
                break;
              }
              await new Promise((resolve) => window.setTimeout(resolve, 180 + attempt * 120));
            }
            if (!joined) {
              forgetLiveToken(username);
              await fetchToken({ resume: true, forceFresh: true });
            }
            setLiveKitConnect(true);
          }}
          onRejoinAsViewer={async () => {
            setLiveKitConnect(false);
            await livekitRoom.disconnect().catch(() => undefined);
            forgetLiveToken(username);
            await fetchToken({ resume: true, forceFresh: true });
            setLiveKitConnect(true);
          }}
          onDeclineSalaInvite={(invite) => {
            void api('/api/stream/invite/decline', {
              method: 'POST',
              body: JSON.stringify({
                roomName: username,
                inviteId: invite?.inviteId,
                guestHandle: handle,
                viewerId: firebaseUid,
              }),
            }).catch(() => undefined);
            if (username && handle) {
              void removeLiveGuestInvites(username, [handle, firebaseUid]).catch(() => undefined);
            }
          }}
          onHangupLiveKit={() => setLiveKitConnect(false)}
          onLeaveLive={async (stats?: LiveEndStats) => {
            if (!isOwnRoom) return;
            intentionalLiveEndRef.current = true;
            rememberGamingSpaceSession(false);
            setScreenShareLiveGuard(false);
            clearLiveChatCache(username);
            const marked = await markLiveRoomEnded(username, stats).then(() => true).catch(() => false);
            let stopped = false;
            try {
              await api('/api/stream/live/stop', {
                method: 'POST',
                body: JSON.stringify({ username }),
              });
              stopped = true;
            } catch {
              try {
                await api('/api/stream/live/stop', {
                  method: 'POST',
                  body: JSON.stringify({ username }),
                });
                stopped = true;
              } catch {
                stopped = false;
              }
            }
            void resetLiveRoomChat(username).catch(() => undefined);
            if (!marked && !stopped) {
              throw new Error('No se pudo finalizar el LIVE. Intenta nuevamente.');
            }
            setLiveKitConnect(false);
            setLiveStarted(false);
          }}
        />
        <ChatPanel
          roomName={username}
          canPublish={session.canPublish}
          isHostRoom={isOwnRoom}
          uiRole={session.isHost || isOwnRoom ? 'host' : 'viewer'}
          onAcceptInvite={undefined}
          onDeclineInvite={() => {
            void api('/api/stream/invite/decline', {
              method: 'POST',
              body: JSON.stringify({ roomName: username, guestHandle: handle }),
            }).catch(() => undefined);
            if (username && handle) {
              void removeLiveGuestInvites(username, [handle, firebaseUid]).catch(() => undefined);
            }
          }}
        />
        </div>
      </LiveKitRoom>
    </div>
  );
}

type IncomingSalaInvite = {
  inviteId?: string;
  hostName: string;
  hostId?: string;
  viewerId?: string;
  liveId?: string;
  guestHandle?: string;
};

type LiveCoinGoalInfo = {
  goalId?: string;
  label: string;
  earned: number;
  goal: number;
  pct: number;
  top: string;
  reached: boolean;
};

function LiveGoalWishHud({
  goal,
  wishlist,
  wishQty,
  wishReceived,
  achievedWish,
  leaving,
  isHost = false,
  celebrating = false,
  onNewGoal,
  lock = null,
  lockDraftIds,
  pendingLockReqs = [],
  pendingRequests = [],
  privatePhase = null,
  privateRequirements = null,
  lockPulse = false,
  onLockClick,
  onRequestClick,
  onOverflowClick,
  onSealPrivate,
  reopenBusy = false,
}: {
  username: string;
  goal: LiveCoinGoalInfo | null;
  wishlist: string[];
  wishQty: Record<string, number>;
  wishReceived?: Record<string, number>;
  achievedWish: AchievedWish | null;
  leaving: boolean;
  isHost?: boolean;
  celebrating?: boolean;
  onNewGoal?: () => void;
  lock?: LockInfo | null;
  lockDraftIds?: string[];
  lockDraftQty?: Record<string, number>;
  pendingLockReqs?: Array<{ giftId: string; quantity: number }>;
  pendingRequests?: PrivateAccessRequest[];
  privatePhase?: PrivateLivePhase | null;
  privateRequirements?: PrivateGiftRequirementProgress[] | null;
  privateStartsAtMs?: number | null;
  nowMs?: number;
  lockPulse?: boolean;
  onLockClick?: () => void;
  onRequestClick?: (row: PrivateAccessRequest) => void;
  onOverflowClick?: () => void;
  onSealPrivate?: () => void;
  reopenBusy?: boolean;
}) {
  const preparingPrivate = privatePhase === 'collecting' || privatePhase === 'countdown';
  const sealed = privatePhase === 'private';
  const lockArmed = Boolean(lock) || preparingPrivate;
  const privateActive = lockArmed;
  const statusText = celebrating
    ? ' · ¡Meta conseguida!'
    : goal?.reached
      ? ' · Meta cumplida ✓'
      : '';
  const viewerLabel = sealed ? 'LIVE privado' : lockArmed ? 'Candado activo' : undefined;

  const activeLockGifts = lockGiftIdsOf(lock);
  const draftIds = (lockDraftIds || []).filter(Boolean).slice(0, LIVE_LOCK_ACTIVE_MAX);
  const showDraft = Boolean(isHost && !activeLockGifts.length && draftIds.length > 0);
  const pendingIds = pendingLockReqs.map((row) => row.giftId).filter(Boolean).slice(0, LIVE_LOCK_ACTIVE_MAX);
  const showPending = Boolean(!activeLockGifts.length && !showDraft && pendingIds.length > 0);
  const progressIds = (privateRequirements || []).map((row) => row.giftId).filter(Boolean);
  const requestedGiftIds = activeLockGifts.length
    ? activeLockGifts
    : progressIds.length
      ? progressIds
      : showDraft
        ? draftIds
        : showPending
          ? pendingIds
          : [];
  const privacyControls = (
    <div className="lb-live-privacy-row is-under-goal">
      <LivePrivacyLockButton
        privateActive={privateActive}
        phase={privatePhase}
        interactive={Boolean(isHost)}
        label={viewerLabel}
        pulse={lockPulse}
        onClick={() => {
          if (isHost) onLockClick?.();
        }}
      />
      {requestedGiftIds.length > 0 ? (
        <div className="lb-live-candado-gifts" aria-label="Regalo de acceso del candado">
          <LiveWishCarousel giftIds={requestedGiftIds.slice(0, 1)} />
        </div>
      ) : null}
      {sealed ? (
        <p className="lb-live-privacy-lock-caption">LIVE privado</p>
      ) : lockArmed ? (
        <p className="lb-live-privacy-lock-caption">Candado activo</p>
      ) : null}
      {isHost && (Boolean(lock) || pendingRequests.length > 0) ? (
        <LivePrivacyRequestStrip
          requests={pendingRequests}
          onSelect={onRequestClick}
          onOverflow={onOverflowClick}
        />
      ) : null}
    </div>
  );

  return (
    <div className="lb-live-viewer-hud__info">
      <div className="lb-live-viewer-goal-col">
        {goal ? (
          <div className="lb-live-viewer-goal">
            <p className="lb-live-viewer-goal__label">{goal.label}</p>
            <div className="lb-live-viewer-goal__bar">
              <div style={{ width: `${goal.pct}%` }} />
            </div>
            <p className="lb-live-viewer-goal__meta">
              {goal.earned.toLocaleString('es-CO')}
              {goal.goal > 0
                ? ` / ${goal.goal.toLocaleString('es-CO')} coins${statusText}`
                : ' coins'}
              {goal.top ? ` · Top: ${goal.top}` : ''}
            </p>
            {isHost && goal.reached && onNewGoal ? (
              <button type="button" className="lb-live-viewer-goal__new" onClick={onNewGoal}>
                <Plus size={11} />
                Nueva meta
              </button>
            ) : null}
          </div>
        ) : null}
        {privacyControls}
        {isHost && lockArmed && !sealed && onSealPrivate ? (
          <button
            type="button"
            disabled={reopenBusy}
            onClick={onSealPrivate}
            className="lb-live-go-private"
          >
            <span>{reopenBusy ? 'Pasando…' : 'Pasar a privado'}</span>
          </button>
        ) : null}
      </div>
      <div className="lb-live-wishlist-stack">
        {wishlist.length > 0 ? (
          <div className="lb-live-wishlist">
            <LiveWishHexStage giftIds={wishlist} quantities={wishQty} received={wishReceived} />
          </div>
        ) : null}
        <LiveWishAchievedCard wish={achievedWish} leaving={leaving} />
      </div>
    </div>
  );
}

function CreatorStage({
  username,
  hostUid,
  canPublish,
  isHost,
  isPrivate: _isPrivate,
  aspectRatio,
  onPrivacyChange,
  onViewerPaused,
  goalCoins,
  goalLabel,
  liveTitle,
  liveCategory,
  hostAvatarUrl,
  onLeaveLive,
  onHangupLiveKit,
  onBattleActive,
  onAcceptSalaInvite,
  onDeclineSalaInvite,
  onJoinSala1,
  onRejoinAsViewer,
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
  liveTitle?: string;
  liveCategory?: string;
  hostAvatarUrl?: string | null;
  onLeaveLive?: (stats?: LiveEndStats) => Promise<void>;
  onHangupLiveKit?: () => void;
  onBattleActive?: (active: boolean) => void;
  onAcceptSalaInvite?: (invite?: IncomingSalaInvite) => void | Promise<void>;
  onDeclineSalaInvite?: (invite?: IncomingSalaInvite) => void;
  onJoinSala1?: () => void | Promise<void>;
  onRejoinAsViewer?: () => void | Promise<void>;
}) {
  const t = useT();
  const navigate = useNavigate();
  const room = useRoomContext();
  const liveViewport = useLiveViewport();
  const { isMicrophoneEnabled } = useLocalParticipant();
  const handle = useAuthStore((state) => state.profile?.handle);
  const displayName = useAuthStore((state) => state.profile?.displayName);
  const walletCoins = useAuthStore((state) => state.profile?.coinsBalance ?? 0);
  const firebaseUid = useAuthStore((state) => state.profile?.firebaseUid);
  const setCoins = useAuthStore((state) => state.setCoins);
  const { viewers } = useViewerCount(username);
  const liveStartedAt = useRef(0);
  const creditedGifts = useRef(new Set<string>());
  const [floats, setFloats] = useState<FloatingGiftItem[]>([]);
  const [faceGift, setFaceGift] = useState<ActiveFaceGift | null>(null);
  const giftComboRef = useRef<{ key: string; count: number; at: number }>({ key: '', count: 0, at: 0 });
  const stageVideoRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const launch = (location.state as LiveLaunchState | null) || {};
  const gamingSpaceActive = isGamingSpaceSessionActive(launch.gamingSpace);
  useEffect(() => {
    if (launch.gamingSpace) rememberGamingSpaceSession(true);
  }, [launch.gamingSpace]);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [mirrorMode, setMirrorMode] = useState(() =>
    typeof launch.mirror === 'boolean' ? launch.mirror : loadLiveMirrorPref() ?? true,
  );
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [cameraDeviceId, setCameraDeviceId] = useState(() => String(launch.cameraId || ''));
  const [micDeviceId, setMicDeviceId] = useState(() => String(launch.microphoneId || ''));
  const [hostCamOn, setHostCamOn] = useState(true);
  const [flipping, setFlipping] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [endLiveError, setEndLiveError] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [kickBusyId, setKickBusyId] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [liveNeighbors, setLiveNeighbors] = useState<SuggestedLive[]>([]);
  const liveNeighborsRef = useRef<SuggestedLive[]>([]);
  liveNeighborsRef.current = liveNeighbors;
  const carouselTargetRef = useRef(username);
  const [switchCover, setSwitchCover] = useState<SuggestedLive | null>(null);
  const switchCoverRef = useRef<SuggestedLive | null>(null);
  switchCoverRef.current = switchCover;
  useEffect(() => {
    carouselTargetRef.current = username;
  }, [username]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [wishQty, setWishQty] = useState<Record<string, number>>({});
  const [wishReceived, setWishReceived] = useState<Record<string, number>>({});
  const [completedWishItems, setCompletedWishItems] = useState<LiveWishItem[]>([]);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [wishSyncReady, setWishSyncReady] = useState(false);
  const wishItemsRef = useRef<LiveWishItem[]>([]);
  const { achievedWish, leaving: wishAchievedLeaving } = useLiveWishAchieved(
    username,
    completedWishItems,
    wishSyncReady,
  );
  const [notifyBusy, setNotifyBusy] = useState(false);
  const peakViewersRef = useRef(0);
  const onViewerPausedRef = useRef(onViewerPaused);
  onViewerPausedRef.current = onViewerPaused;
  const isSpectator = !isHost && !canPublish;
  const isOwnLiveAccount = Boolean(isHost || (firebaseUid && hostUid && firebaseUid === hostUid));
  const onHangupLiveKitRef = useRef(onHangupLiveKit);
  onHangupLiveKitRef.current = onHangupLiveKit;

  /** Cualquier no-host al terminar el LIVE → desconectar e ir a Inicio de una vez. */
  const exitLiveToHome = useCallback(async () => {
    try {
      if (canPublish && handle) {
        await api('/api/stream/invite/leave', {
          method: 'POST',
          body: JSON.stringify({
            roomName: username,
            guestHandle: handle,
            viewerId: firebaseUid,
          }),
        }).catch(() => undefined);
        await removeLiveGuestInvites(
          username,
          [handle, firebaseUid].filter(Boolean) as string[],
        ).catch(() => undefined);
      }
    } finally {
      onHangupLiveKitRef.current?.();
      await room.disconnect().catch(() => undefined);
      navigate('/', { replace: true });
    }
  }, [canPublish, handle, username, firebaseUid, room, navigate]);
  const exitLiveToHomeRef = useRef(exitLiveToHome);
  exitLiveToHomeRef.current = exitLiveToHome;

  // Desbloquea audio LiveKit (Sala Boom / invitados) tras gesto o al publicar.
  useEffect(() => {
    const unlock = () => {
      void room.startAudio().catch(() => undefined);
    };
    unlock();
    room.on(RoomEvent.TrackSubscribed, unlock);
    window.addEventListener('pointerdown', unlock);
    return () => {
      room.off(RoomEvent.TrackSubscribed, unlock);
      window.removeEventListener('pointerdown', unlock);
    };
  }, [room, canPublish]);

  // Invitados con canPublish: mic arriba para que el host los oiga.
  // Host: respetar launch.micOn; no reactivar contra su elección.
  useEffect(() => {
    if (!canPublish) return;
    const preferMic = launch.micOn !== false;
    if (isHost && !preferMic) {
      if (room.localParticipant.isMicrophoneEnabled) {
        void room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
      }
      return;
    }
    if (room.localParticipant.isMicrophoneEnabled) return;
    void room.localParticipant.setMicrophoneEnabled(true).catch(() => undefined);
  }, [canPublish, room, isHost, launch.micOn]);

  const [liveEnded, setLiveEnded] = useState(false);
  const hostSessionEndedRef = useRef(false);
  const endedBackendOkRef = useRef(false);
  const endedAtMsRef = useRef(0);
  const canSendLiveBoom = Boolean(firebaseUid) && !liveEnded && !isOwnLiveAccount;
  const seenBoomIds = useRef(new Set<string>());
  const liveBoomCountRef = useRef(0);
  const serverBoomCountRef = useRef(0);
  const [liveBoomCount, setLiveBoomCount] = useState(0);
  const [viewerBoomCount, setViewerBoomCount] = useState(0);
  const { bursts: boomBursts, spawnBoom } = useLiveBoomBursts();

  const registerBoom = useCallback(
    (eventKey: string) => {
      if (!eventKey || seenBoomIds.current.has(eventKey)) return false;
      seenBoomIds.current.add(eventKey);
      spawnBoom(stageVideoRef.current);
      liveBoomCountRef.current += 1;
      setLiveBoomCount(liveBoomCountRef.current);
      return true;
    },
    [spawnBoom],
  );

  const showBoomAt = useCallback(
    (_nx: number, _ny: number, boomId?: string) => {
      if (!boomId) return;
      registerBoom(boomId);
    },
    [registerBoom],
  );
  const fireBoomAt = useCallback(
    (clientX: number, clientY: number) => {
      if (!canSendLiveBoom) return;
      const box = stageVideoRef.current;
      if (!box || box.clientWidth <= 0 || box.clientHeight <= 0) return;
      const boomId = `boom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const rect = box.getBoundingClientRect();
      const nx = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const ny = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));

      registerBoom(boomId);

      void publishRoomData(room, { type: 'boom', id: boomId, nx, ny, uid: firebaseUid }).catch(
        () => undefined,
      );

      if (firebaseUid) {
        void sendLiveRoomBoom(
          username,
          firebaseUid,
          displayName || handle || 'Liveboomer',
          nx,
          ny,
          boomId,
        )
          .then((result) => {
            seenBoomIds.current.add(result.eventId);
            serverBoomCountRef.current = Math.max(serverBoomCountRef.current, result.liveBoomCount);
            if (result.liveBoomCount >= liveBoomCountRef.current) {
              liveBoomCountRef.current = result.liveBoomCount;
              setLiveBoomCount(result.liveBoomCount);
            }
            setViewerBoomCount(result.viewerBoomCount);
          })
          .catch(() => undefined);
      }
    },
    [canSendLiveBoom, room, firebaseUid, username, displayName, handle, registerBoom],
  );
  const { boomGestureProps } = useBoomGesture({
    onBoom: fireBoomAt,
    disabled: !canSendLiveBoom,
    singleTap: true,
  });
  const goToNeighborLive = useCallback(
    (direction: 1 | -1) => {
      if (isHost || canPublish || liveEnded) return;
      const neighbors = liveNeighborsRef.current;
      if (neighbors.length === 0) return;
      const from = carouselTargetRef.current || username;
      const next = pickNeighborLive(neighbors, from, direction);
      if (!next) return;
      carouselTargetRef.current = next.username;
      setSwitchCover(next);
      warmupLivePoster(next.avatarUrl);
      disconnectLiveRoomQuiet(room);
      navigate(`/stream/${encodeURIComponent(next.username)}`, {
        replace: true,
        state: { liveCarouselDir: direction },
      });
    },
    [isHost, canPublish, liveEnded, username, room, navigate],
  );
  const onCarouselNext = useCallback(() => {
    goToNeighborLive(1);
  }, [goToNeighborLive]);
  const onCarouselPrev = useCallback(() => {
    goToNeighborLive(-1);
  }, [goToNeighborLive]);
  const canCarouselLive = Boolean(
    isSpectator &&
      !liveEnded &&
      liveNeighbors.some((stream) => roomKey(stream.username) !== roomKey(username)),
  );
  const liveCarousel = useLiveCarouselPointer({
    enabled: canCarouselLive,
    onNext: onCarouselNext,
    onPrev: onCarouselPrev,
  });
  const handleStagePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      liveCarousel.onPointerDown(event);
      boomGestureProps.onPointerDown?.(event);
    },
    [liveCarousel, boomGestureProps],
  );
  const handleStagePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      liveCarousel.onPointerMove(event);
    },
    [liveCarousel],
  );
  const handleStagePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const navigated = liveCarousel.onPointerUp(event);
      if (navigated) return;
      boomGestureProps.onPointerUp?.(event);
    },
    [liveCarousel, boomGestureProps],
  );
  const handleStagePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      liveCarousel.onPointerCancel(event);
    },
    [liveCarousel],
  );
  const liveCarouselDir = launch.liveCarouselDir;
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('excellent');
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

  useEffect(() => {
    return listenLiveBoomStats(username, firebaseUid, (stats) => {
      const official = stats.liveBoomCount;
      serverBoomCountRef.current = official;
      if (official > liveBoomCountRef.current) {
        liveBoomCountRef.current = official;
        setLiveBoomCount(official);
      }
      setViewerBoomCount(stats.viewerBoomCount);
    });
  }, [username, firebaseUid]);

  useEffect(() => {
    return listenLiveBoomEvents(username, (event) => {
      if (hostUid && event.uid && event.uid === hostUid) return;
      const eventKey = event.clientId || event.id;
      registerBoom(eventKey);
    });
  }, [username, hostUid, registerBoom]);

  useEffect(() => {
    if (!canPublish) return;
    let cancelled = false;
    const refresh = () => {
      void listLiveMediaDevices()
        .then((list) => {
          if (cancelled) return;
          setVideoInputs(list.video);
          setAudioInputs(list.audio);
        })
        .catch(() => undefined);
    };
    refresh();
    const devices = navigator.mediaDevices;
    devices?.addEventListener?.('devicechange', refresh);
    return () => {
      cancelled = true;
      devices?.removeEventListener?.('devicechange', refresh);
    };
  }, [canPublish]);

  const switchCameraDevice = useCallback(
    async (deviceId: string) => {
      if (!canPublish || !deviceId) return;
      const pub = Array.from(room.localParticipant.videoTrackPublications.values()).find(
        (item) => item.source === Track.Source.Camera,
      );
      const track = (pub?.track || cameraTrackRef.current) as LocalVideoTrack | null;
      if (!track) return;
      try {
        await track.restartTrack({ deviceId: { exact: deviceId } });
        cameraTrackRef.current = track;
        setCameraDeviceId(deviceId);
        const selected = videoInputs.find((item) => item.deviceId === deviceId);
        const nextFacing = liveCameraFacing(selected?.label || '');
        if (nextFacing === 'user' || nextFacing === 'environment') setFacing(nextFacing);
      } catch (error) {
        console.error('[live] switch camera device', error);
        setInviteNote('No se pudo cambiar a esa cámara.');
      }
    },
    [canPublish, room, videoInputs],
  );

  const switchMicrophoneDevice = useCallback(
    async (deviceId: string) => {
      if (!canPublish || !deviceId) return;
      const pub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
        (item) => item.source === Track.Source.Microphone,
      );
      const track = pub?.track as LocalAudioTrack | undefined;
      if (!track) {
        try {
          await room.localParticipant.setMicrophoneEnabled(true, { deviceId });
          setMicDeviceId(deviceId);
        } catch (error) {
          console.error('[live] switch microphone device', error);
          setInviteNote('No se pudo cambiar a ese micrófono.');
        }
        return;
      }
      try {
        await track.restartTrack({ deviceId: { exact: deviceId } });
        setMicDeviceId(deviceId);
      } catch (error) {
        console.error('[live] switch microphone device', error);
        setInviteNote('No se pudo cambiar a ese micrófono.');
      }
    },
    [canPublish, room],
  );

  useEffect(() => {
    if (!canPublish || videoInputs.length === 0) return;
    if (cameraDeviceId && videoInputs.some((item) => item.deviceId === cameraDeviceId)) return;
    const next = videoInputs[0]?.deviceId;
    if (!next) return;
    if (cameraDeviceId) void switchCameraDevice(next);
    else setCameraDeviceId(next);
  }, [canPublish, videoInputs, cameraDeviceId, switchCameraDevice]);

  useEffect(() => {
    if (!canPublish || audioInputs.length === 0) return;
    if (micDeviceId && audioInputs.some((item) => item.deviceId === micDeviceId)) return;
    const next = audioInputs[0]?.deviceId;
    if (!next) return;
    if (micDeviceId) void switchMicrophoneDevice(next);
    else setMicDeviceId(next);
  }, [canPublish, audioInputs, micDeviceId, switchMicrophoneDevice]);

  useEffect(() => {
    try {
      localStorage.setItem(LIVE_MIRROR_KEY, mirrorMode ? '1' : '0');
    } catch {
      // ignore
    }
  }, [mirrorMode]);

  const [inviteHandle, setInviteHandle] = useState('');
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [reelNote, setReelNote] = useState<string | null>(null);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenShareWizardOpen, setScreenShareWizardOpen] = useState(false);
  const [shareStopConfirmOpen, setShareStopConfirmOpen] = useState(false);
  const [shareStoppedAckOpen, setShareStoppedAckOpen] = useState(false);
  const [shareControlsOpen, setShareControlsOpen] = useState(false);
  const [shareMicrophoneEnabled, setShareMicrophoneEnabled] = useState(true);
  const [shareDeviceAudioEnabled, setShareDeviceAudioEnabled] = useState(true);
  const [floatingChatEnabled, setFloatingChatEnabled] = useState(true);
  const shareMicrophoneEnabledRef = useRef(true);
  const screenShareTransportRef = useRef<ScreenShareTransport>(null);
  const screenShareWizardResolverRef = useRef<((result: ScreenShareWizardResult | null) => void) | null>(
    null,
  );
  const [gamingMixer, setGamingMixer] = useState(() => getNativeAudioMixerState());
  const [gamingBitrateKbps, setGamingBitrateKbps] = useState<number | null>(null);
  const [gamingRttMs, setGamingRttMs] = useState<number | null>(null);
  const screenShareGateRef = useRef(new ScreenShareOperationGate());
  const restoreCamTimerRef = useRef(0);
  const [pipVisible, setPipVisible] = useState(true);
  const [pipCameraAspect, setPipCameraAspect] = useState(() => frameAspectRatio(aspectRatio));
  const [frameLayout, setFrameLayout] = useState<LiveFrameLayout>(() =>
    defaultCameraFrameLayout(aspectRatio),
  );
  const screenComposerRef = useRef<LiveScreenComposer | null>(null);
  const rawCameraTrackRef = useRef<LocalVideoTrack | null>(null);
  const compositeTrackRef = useRef<LocalVideoTrack | null>(null);
  const screenVideoLiveTrackRef = useRef<LocalVideoTrack | null>(null);
  const nativeCameraLiveTrackRef = useRef<LocalVideoTrack | null>(null);
  const nativeMicLiveTrackRef = useRef<LocalAudioTrack | null>(null);
  const screenMediaTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenAudioLiveTrackRef = useRef<LocalAudioTrack | null>(null);
  const gamingStatsPrevRef = useRef<{ bytes: number; ts: number } | null>(null);
  const pipInputTrackRef = useRef<MediaStreamTrack | null>(null);
  const [lock, setLock] = useState<LockInfo | null>(null);
  const [, setLockUnlocked] = useState(false);
  const [privacyRequests, setPrivacyRequests] = useState<PrivateAccessRequest[]>([]);
  const [privacyRequestsOpen, setPrivacyRequestsOpen] = useState(false);
  const [privacyFocusUid, setPrivacyFocusUid] = useState<string | null>(null);
  const [privacyBusyUid, setPrivacyBusyUid] = useState<string | null>(null);
  const [, setPrivateStartsAtMs] = useState<number | null>(null);
  const [privateSessionId, setPrivateSessionIdState] = useState<string | null>(null);
  const [privatePhase, setPrivatePhase] = useState<PrivateLivePhase | null>(null);
  const [privateRequirements, setPrivateRequirements] = useState<
    PrivateGiftRequirementProgress[] | null
  >(null);
  const [lockPulse, setLockPulse] = useState(false);
  const [pendingLockReqs, setPendingLockReqs] = useState<Array<{ giftId: string; quantity: number }>>(
    [],
  );
  const privateActivateOnceRef = useRef<number | null>(null);
  const pendingPrivacyReqsRef = useRef<Array<{ giftId: string; quantity: number }>>([]);
  const privatePhaseRef = useRef<PrivateLivePhase | null>(null);
  const qualifiedViewerUidsRef = useRef<string[]>([]);
  const prevPrivatePhaseRef = useRef<PrivateLivePhase | null>(null);
  const [remoteFrameLayout, setRemoteFrameLayout] = useState<LiveFrameLayout>(() =>
    defaultCameraFrameLayout(aspectRatio),
  );
  const [remotePipVisible, setRemotePipVisible] = useState(true);
  const [salaBoomOpen, setSalaBoomOpen] = useState(false);
  const [salaLayout, setSalaLayout] = useState<SalaBoomLayout>('grid');
  const [remoteSalaLayout, setRemoteSalaLayout] = useState<SalaBoomLayout>('grid');
  const [salaPinnedId, setSalaPinnedId] = useState<string | null>(null);
  const [remoteSalaPinnedId, setRemoteSalaPinnedId] = useState<string | null>(null);
  /** Host apagó cámara: perfil + audio (siguen en la sala). */
  const [salaCamOffIds, setSalaCamOffIds] = useState<string[]>([]);
  /** Invitación Sala 1 visible dentro del video para el espectador invitado. */
  const [salaInvite, setSalaInvite] = useState<IncomingSalaInvite | null>(null);
  const [salaInviteStatus, setSalaInviteStatus] = useState<SalaInviteHostStatus>(null);
  const [salaInviteBusy, setSalaInviteBusy] = useState(false);
  const [salaInviteAccepting, setSalaInviteAccepting] = useState(false);
  const [salaInviteError, setSalaInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (canPublish) setSalaInvite(null);
  }, [canPublish]);

  const applySalaLayout = useCallback(
    (next: SalaBoomLayout, pin: string | null = salaPinnedId) => {
      setSalaLayout(next);
      setRemoteSalaLayout(next);
      void publishRoomData(room, {
        type: 'sala_layout',
        layout: next,
        pin,
      }).catch(() => undefined);
      void setLiveSalaLayout(username, next, pin).catch(() => undefined);
    },
    [room, salaPinnedId, username],
  );

  useEffect(() => {
    return listenLiveSalaLayout(username, ({ layout, pin }) => {
      if (!isHost) {
        setRemoteSalaLayout(layout);
        setRemoteSalaPinnedId(pin);
      } else if (layout) {
        // Sync from durable store if another tab/host tool wrote it
        setSalaLayout((current) => (current === layout ? current : layout));
      }
    });
  }, [username, isHost]);
  const [batallaOpen, setBatallaOpen] = useState(false);

  useEffect(() => {
    // Effect A — Solo Sala Boom (nunca Screen Share / PiP).
    if (!isHost) return;
    const syncSalaLayout = () => {
      void publishRoomData(room, {
        type: 'sala_layout',
        layout: salaLayout,
        pin: salaPinnedId,
      }).catch(() => undefined);
    };
    const onParticipantConnected = () => syncSalaLayout();
    room.on(RoomEvent.Connected, syncSalaLayout);
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    if (room.state === ConnectionState.Connected) syncSalaLayout();
    return () => {
      room.off(RoomEvent.Connected, syncSalaLayout);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
    };
  }, [isHost, room, salaLayout, salaPinnedId]);

  useEffect(() => {
    // Effect B — Solo frame / PiP web (NO publica sala_layout).
    if (!isHost) return;
    // Android Screen Share: sin sync de PiP cámara.
    if (screenSharing && isNativeAndroidApp()) return;
    const syncScreenPresentation = () => {
      void publishFrameSync(room, frameLayout, screenSharing ? pipVisible : true).catch(
        () => undefined,
      );
    };
    const onParticipantConnected = () => syncScreenPresentation();
    room.on(RoomEvent.Connected, syncScreenPresentation);
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    if (room.state === ConnectionState.Connected) syncScreenPresentation();
    return () => {
      room.off(RoomEvent.Connected, syncScreenPresentation);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
    };
  }, [isHost, room, frameLayout, pipVisible, screenSharing]);

  useEffect(() => {
    const onBoomButton = () => {
      const box = stageVideoRef.current;
      if (!box) return;
      const rect = box.getBoundingClientRect();
      fireBoomAt(rect.left + rect.width * 0.5, rect.top + rect.height * 0.45);
    };
    window.addEventListener('liveboom:live-boom-tap', onBoomButton);
    return () => window.removeEventListener('liveboom:live-boom-tap', onBoomButton);
  }, [fireBoomAt]);

  useEffect(() => {
    const mapState = () => {
      if (room.state === ConnectionState.Reconnecting) setConnectionQuality('reconnecting');
      else if (room.state === ConnectionState.Disconnected) {
        setConnectionQuality('disconnected');
        console.log('[LIVE] RoomEvent disconnected', {
          room: room.name,
          mono: Math.round(performance.now()),
          screenGuard: isScreenShareLiveGuardActive(),
        });
      } else if (room.state === ConnectionState.Connected) setConnectionQuality('excellent');
      else setConnectionQuality('stable');
    };
    mapState();
    room.on(RoomEvent.ConnectionStateChanged, mapState);
    room.on(RoomEvent.Disconnected, mapState);
    return () => {
      room.off(RoomEvent.ConnectionStateChanged, mapState);
      room.off(RoomEvent.Disconnected, mapState);
    };
  }, [room]);

  const [lockPicker, setLockPicker] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [lockDraftIds, setLockDraftIds] = useState<string[]>([]);
  const [lockDraftQty, setLockDraftQty] = useState<Record<string, number>>({});
  const [viewersList, setViewersList] = useState<SalaInviteViewer[]>([]);
  const [liveStats, setLiveStats] = useState<LiveSessionStats | null>(
    goalCoins || goalLabel
      ? {
          username,
          startedAt: '',
          goalCoins,
          goalLabel,
          coinsEarned: 0,
          topGifters: [],
        }
      : null,
  );
  const [coinGoal, setCoinGoal] = useState<LiveCoinGoalCycle | null>(null);
  const [coinGoalTop, setCoinGoalTop] = useState('');
  const [newCoinGoalOpen, setNewCoinGoalOpen] = useState(false);
  const [newCoinGoalBusy, setNewCoinGoalBusy] = useState(false);
  const [newCoinGoalError, setNewCoinGoalError] = useState<string | null>(null);
  const [goalCelebrating, setGoalCelebrating] = useState(false);
  const celebratedGoalRef = useRef<string | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedLive[]>([]);
  const [recentGifts, setRecentGifts] = useState<RecentLiveGiftRow[]>([]);
  const [giftsCount, setGiftsCount] = useState(0);
  const [dashNow, setDashNow] = useState(Date.now());
  const [followingHost, setFollowingHost] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [roomMeta, setRoomMeta] = useState<{
    title: string;
    category: string;
    avatarUrl: string | null;
    displayName: string;
  }>({
    title: liveTitle || `Live de ${username}`,
    category: liveCategory || 'otro',
    avatarUrl: hostAvatarUrl || null,
    displayName: username,
  });
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

  const [liveHosts, setLiveHosts] = useState<Array<{ username: string; displayName: string }>>([]);
  const battle = useAgoraBattle({
    roomName: username,
    isHost,
    firebaseUid: firebaseUid || '',
    displayName: displayName || handle || username,
    handle: handle || username,
    room,
    cameraTrackRef,
    onActiveChange: onBattleActive,
  });
  const hostDeepAr = useHostLiveDeepAr({
    enabled: isHost && canPublish && !battle.liveBattle && !screenSharing,
    room,
    cameraTrackRef,
    facing,
    onFacingChange: setFacing,
  });
  const liveStatusNote =
    inviteNote ||
    reelNote ||
    hostDeepAr.note ||
    (hostDeepAr.activeFilter ? `Filtro AR activo: ${hostDeepAr.activeFilter}` : null);
  const inviteNoteRef = useRef(inviteNote);
  inviteNoteRef.current = inviteNote;
  const skipLiveStatusFallbackRef = useRef(false);
  const [liveStatusNoteVisible, setLiveStatusNoteVisible] = useState(false);
  useEffect(() => {
    if (!liveStatusNote) {
      skipLiveStatusFallbackRef.current = false;
      setLiveStatusNoteVisible(false);
      return;
    }
    if (skipLiveStatusFallbackRef.current) {
      skipLiveStatusFallbackRef.current = false;
      setLiveStatusNoteVisible(false);
      return;
    }
    setLiveStatusNoteVisible(true);
    const shown = liveStatusNote;
    const timer = window.setTimeout(() => {
      if (inviteNoteRef.current === shown) skipLiveStatusFallbackRef.current = true;
      setLiveStatusNoteVisible(false);
      setInviteNote((cur) => (cur === shown ? null : cur));
    }, LIVE_STATUS_NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [liveStatusNote]);
  const acceptedBattleRef = useRef<string | null>(null);

  useEffect(() => {
    return listenActiveLiveRooms((streams) => {
      setLiveHosts(
        streams
          .filter((item) => roomKey(item.username) !== roomKey(username))
          .map((item) => ({ username: item.username, displayName: item.displayName })),
      );
      const { topLives, regularLives } = getLiveRanking(streams, '');
      setLiveNeighbors(
        [...topLives, ...regularLives].map((item) => ({
          username: item.username,
          displayName: item.displayName,
          avatarUrl: item.avatarUrl,
          title: item.title,
          viewers: item.viewers,
          isPrivate: item.isPrivate,
        })),
      );
    });
  }, [username]);

  useEffect(() => {
    hadHostCamera.current = false;
  }, [username]);

  useEffect(() => {
    if (!handle || !isSpectator || liveEnded) return;
    const { prev, next } = neighborPair(liveNeighbors, username);
    const gen = currentLiveSwitchGen();
    prefetchLiveViewerTokens([prev?.username, next?.username], handle, gen);
    warmupLivePoster(prev?.avatarUrl);
    warmupLivePoster(next?.avatarUrl);
  }, [liveNeighbors, username, handle, isSpectator, liveEnded]);

  useEffect(() => {
    if (!switchCover) return;
    if (roomKey(switchCover.username) !== roomKey(username)) return;
    const tryClear = () => {
      if (room.state !== ConnectionState.Connected) return;
      const hasVideo = Array.from(room.remoteParticipants.values()).some((participant) =>
        Array.from(participant.videoTrackPublications.values()).some(
          (pub) => pub.kind === Track.Kind.Video && Boolean(pub.track) && !pub.isMuted,
        ),
      );
      if (hasVideo) setSwitchCover(null);
    };
    room.on(RoomEvent.TrackSubscribed, tryClear);
    room.on(RoomEvent.Connected, tryClear);
    tryClear();
    const fallback = window.setTimeout(() => {
      if (room.state === ConnectionState.Connected) setSwitchCover(null);
    }, 1800);
    return () => {
      room.off(RoomEvent.TrackSubscribed, tryClear);
      room.off(RoomEvent.Connected, tryClear);
      window.clearTimeout(fallback);
    };
  }, [room, username, switchCover]);

  useEffect(() => {
    if (!battle.incoming) return;
    const gate = guardEnterSalaOrBattle(screenSharing);
    if (!gate.ok) {
      setReelNote(gate.message);
      return;
    }
    setBatallaOpen(true);
    logBattleStart();
  }, [battle.incoming?.battleId, screenSharing]);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('battleAccept');
    if (!id || !isHost || !firebaseUid) return;
    if (acceptedBattleRef.current === id) return;
    acceptedBattleRef.current = id;
    void battle.accept(id);
  }, [location.search, isHost, firebaseUid]);

  useEffect(() => {
    // WEB clásico: PiP aspect. Android Screen Share: NO (sin cámara / sin PiP).
    if (!screenSharing) return;
    if (isNativeAndroidApp()) return;
    const syncAspect = () => {
      setPipCameraAspect(
        readCameraTrackAspect(
          cameraTrackRef.current?.mediaStreamTrack,
          frameAspectRatio(aspectRatio),
        ),
      );
    };
    syncAspect();
    const timer = window.setInterval(syncAspect, 500);
    return () => window.clearInterval(timer);
  }, [screenSharing, aspectRatio]);

  useScreenShareSynchronization({
    screenSharing,
    sessionId: getScreenShareSession()?.sessionId ?? null,
    transport: screenShareTransportRef.current,
  });

  useEffect(() => {
    if (!username) return;
    void api<{
      lock: LockInfo | null;
      unlocked?: boolean;
      isHost?: boolean;
      locked?: boolean;
      isPrivate?: boolean;
    }>(
      `/api/stream/lock/${encodeURIComponent(username)}?handle=${encodeURIComponent(handle || username)}`,
    )
      .then((data) => {
        setLock(data.lock);
        setLockUnlocked(Boolean(data.isHost || data.unlocked || !data.isPrivate));
      })
      .catch(() => undefined);
  }, [isHost, username, handle]);

  /** Misma fuente durable al volver de background (iPhone Safari / WebView / desktop). */
  useEffect(() => {
    if (!username) return;
    let busy = false;
    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (busy) return;
      busy = true;
      void api<{
        lock: LockInfo | null;
        unlocked?: boolean;
        isHost?: boolean;
        locked?: boolean;
        isPrivate?: boolean;
      }>(
        `/api/stream/lock/${encodeURIComponent(username)}?handle=${encodeURIComponent(handle || username)}`,
      )
        .then((data) => {
          setLock(data.lock);
          const unlocked = Boolean(data.isHost || data.unlocked || !data.isPrivate);
          setLockUnlocked(unlocked);
          if (!isHost && isSpectator) {
            if (data.isPrivate && data.lock && !unlocked) {
              onViewerPausedRef.current?.(true, data.lock);
            } else {
              onViewerPausedRef.current?.(false, null);
            }
          }
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const onPageShow = () => refresh();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [username, handle, isHost, isSpectator]);

  // Pulso periódico: el feed cierra salas sin heartbeat.
  useEffect(() => {
    if (!isHost || !username) return;
    if (hostSessionEndedRef.current || summaryOpen || liveEnded) return;
    void touchLiveRoomHeartbeat(username).catch(() => undefined);
    void refreshLiveViewerCount(username).catch(() => undefined);
    const timer = window.setInterval(() => {
      if (hostSessionEndedRef.current) return;
      void touchLiveRoomHeartbeat(username).catch(() => undefined);
      void refreshLiveViewerCount(username).catch(() => undefined);
    }, 12_000);
    return () => window.clearInterval(timer);
  }, [isHost, username, summaryOpen, liveEnded]);

  useEffect(() => {
    return listenPrivateSchedule(username, (schedule) => {
      setPrivateStartsAtMs(schedule.privateStartsAtMs);
      setPrivateSessionIdState(schedule.privateSessionId);
      setPrivatePhase(schedule.privatePhase);
      privatePhaseRef.current = schedule.privatePhase;
      setPrivateRequirements(schedule.privateRequirements);
      qualifiedViewerUidsRef.current = schedule.qualifiedViewerUids;
      const pending = schedule.privatePendingRequirements || [];
      pendingPrivacyReqsRef.current = pending;
      setPendingLockReqs(pending);
      if (schedule.privateActivatedAtMs) {
        privateActivateOnceRef.current = schedule.privateActivatedAtMs;
      }
      const prev = prevPrivatePhaseRef.current;
      if (prev === 'collecting' && (schedule.privatePhase === 'countdown' || schedule.privatePhase === 'private')) {
        setLockPulse(true);
        window.setTimeout(() => setLockPulse(false), 750);
      }
      prevPrivatePhaseRef.current = schedule.privatePhase;
    });
  }, [username]);

  useEffect(() => {
    if (!isHost) return;
    return listenPendingPrivateRequests(username, privateSessionId, setPrivacyRequests);
  }, [isHost, username, privateSessionId]);

  useEffect(() => {
    if (isHost || !firebaseUid || !privateSessionId) return;
    return listenMyPrivateGrant(username, firebaseUid, (grant) => {
      if (grant && grant.sessionId === privateSessionId && grant.accessGranted) {
        setLockUnlocked(true);
        onViewerPausedRef.current?.(false, null);
        void api('/api/stream/claim-access', {
          method: 'POST',
          body: JSON.stringify({ roomName: username, handle }),
        }).catch(() => undefined);
      }
    });
  }, [isHost, username, firebaseUid, privateSessionId, handle]);

  useEffect(() => {
    if (isHost || !isSpectator || !username || privatePhase !== 'private') return;
    let cancelled = false;
    void api<{
      lock: LockInfo | null;
      unlocked?: boolean;
      isHost?: boolean;
      isPrivate?: boolean;
    }>(
      `/api/stream/lock/${encodeURIComponent(username)}?handle=${encodeURIComponent(handle || username)}`,
    )
      .then((data) => {
        if (cancelled) return;
        setLock(data.lock);
        const unlocked = Boolean(data.isHost || data.unlocked || !data.isPrivate);
        setLockUnlocked(unlocked);
        if (!unlocked && data.lock) onViewerPausedRef.current?.(true, data.lock);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isHost, isSpectator, username, handle, privatePhase]);

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
            startedAt: persistLiveStartedAt(incoming.startedAt, current.startedAt),
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
    return listenLiveRoomEarnings(username, ({ coinsEarned, topGifters, coinGoal: nextGoal, coinGoalTop: nextTop }) => {
      setCoinGoal(nextGoal);
      setCoinGoalTop(nextTop);
      setLiveStats((current) => {
        const base =
          current ||
          ({
            username,
            startedAt: persistLiveStartedAt(
              liveStartedAt.current ? new Date(liveStartedAt.current).toISOString() : '',
            ),
            goalCoins,
            goalLabel,
            coinsEarned: 0,
            topGifters: [],
          } satisfies LiveSessionStats);
        return {
          ...base,
          coinsEarned: Math.max(base.coinsEarned || 0, coinsEarned),
          goalCoins: nextGoal?.targetCoins || base.goalCoins,
          topGifters: topGifters.length ? topGifters : base.topGifters,
        };
      });
    });
  }, [username, goalCoins, goalLabel]);

  useEffect(() => {
    const ms = liveStats?.startedAt ? Date.parse(liveStats.startedAt) : 0;
    if (!Number.isFinite(ms) || ms <= 0) return;
    if (!liveStartedAt.current || ms < liveStartedAt.current) {
      liveStartedAt.current = ms;
    }
  }, [liveStats?.startedAt]);

  useEffect(() => {
    if (summaryOpen || liveEnded) return;
    const timer = window.setInterval(() => setDashNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [summaryOpen, liveEnded]);

  useEffect(() => {
    liveStartedAt.current = 0;
    return onSnapshot(doc(db, 'liveRooms', roomKey(username)), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setRoomMeta({
        title: String(data.title || liveTitle || `Live de ${username}`),
        category: String(data.category || liveCategory || 'otro'),
        avatarUrl: (data.avatarUrl as string | null) || hostAvatarUrl || null,
        displayName: String(data.displayName || username),
      });
      const startedAtMs = Math.floor(Number(data.startedAtMs) || 0);
      if (startedAtMs > 0 && String(data.status || '') === 'live') {
        const iso = new Date(startedAtMs).toISOString();
        if (!liveStartedAt.current || startedAtMs < liveStartedAt.current) {
          liveStartedAt.current = startedAtMs;
        }
        setLiveStats((current) => {
          const nextStarted = persistLiveStartedAt(current?.startedAt, iso);
          if (!nextStarted) return current;
          if (current?.startedAt === nextStarted) return current;
          if (!current) {
            return {
              username,
              startedAt: nextStarted,
              goalCoins,
              goalLabel,
              coinsEarned: 0,
              topGifters: [],
            };
          }
          return { ...current, startedAt: nextStarted };
        });
      }
    });
  }, [username, liveTitle, liveCategory, hostAvatarUrl, goalCoins, goalLabel]);

  useEffect(() => {
    if (isHost || !firebaseUid || !hostUid) return;
    void isFollowing(firebaseUid, username, hostUid).then(setFollowingHost).catch(() => undefined);
  }, [isHost, firebaseUid, hostUid, username]);

  useEffect(() => {
    const applyGift = (
      giftId: string,
      id: string,
      senderName?: string,
      multiplier?: number,
      _senderUid?: string,
    ) => {
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
      if (isHost) {
        void applyLiveWishGiftProgress(
          username,
          giftId,
          liveWishGiftUnits(multiplier),
          id,
        )
          .then((done) => {
            if (!done) return;
            wishItemsRef.current = wishItemsRef.current.filter((row) => row.wishId !== done.wishId);
            setWishlist((current) => current.filter((item) => item !== done.giftId));
            setWishQty((current) => {
              if (!(done.giftId in current)) return current;
              const next = { ...current };
              delete next[done.giftId];
              return next;
            });
            setWishReceived((current) => {
              if (!(done.giftId in current)) return current;
              const next = { ...current };
              delete next[done.giftId];
              return next;
            });
            setCompletedWishItems((current) =>
              current.some((row) => row.wishId === done.wishId) ? current : [...current, done],
            );
          })
          .catch(() => undefined);
      }

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
      if (isHost && isDeeparLiveGift(giftId) && !battle.liveBattle) {
        const gift = findLiveGift(giftId);
        const filter = gift?.deeparFilter;
        if (filter) {
          const seconds = gift ? GIFT_LEVEL_FX[gift.level].duration : 4;
          void hostDeepAr.applyFilter(filter, seconds);
        }
      }
    };

    const unsubGifts = listenLiveGifts(username, (gift) => {
      applyGift(gift.giftId, gift.id, gift.senderName, gift.multiplier, gift.senderUid);
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
        const sealed = Boolean(data.lock?.sealed);
        if (data.lock) {
          if (isHost || !sealed) {
            setLockUnlocked(true);
            if (!sealed && isSpectator) onViewerPausedRef.current?.(false, null);
          } else {
            void api<{ unlocked?: boolean; isPrivate?: boolean }>('/api/stream/claim-access', {
              method: 'POST',
              body: JSON.stringify({ roomName: username, handle }),
            })
              .then(() => {
                setLockUnlocked(true);
                onViewerPausedRef.current?.(false, null);
              })
              .catch(() => {
                setLockUnlocked(false);
                if (isSpectator) onViewerPausedRef.current?.(true, data.lock);
              });
          }
        } else {
          setLockUnlocked(true);
          if (isSpectator) onViewerPausedRef.current?.(false, null);
        }
      }
      if (data.type === 'live_ended' && !isHost) {
        // Todos (invitados Sala + espectadores) salen a Inicio de inmediato.
        void exitLiveToHomeRef.current();
        return;
      }
      if (data.type === 'live_kick' && !isHost && data.identity === firebaseUid) {
        forgetLiveToken(username);
        void exitLiveToHomeRef.current();
        return;
      }
      if (data.type === 'boom') {
        if (!(hostUid && data.uid && data.uid === hostUid)) {
          showBoomAt(data.nx, data.ny, data.id);
        }
      }
      if (data.type === 'pip_sync' && !canPublish) {
        setRemoteFrameLayout(
          normalizeFrameLayout({
            nx: data.nx,
            ny: data.ny,
            nw: data.nw,
          }),
        );
        setRemotePipVisible(data.visible);
      }
      if (data.type === 'sala_layout') {
        setRemoteSalaLayout(parseSalaBoomLayout(data.layout));
        setRemoteSalaPinnedId(data.pin ? String(data.pin) : null);
      }
      if (data.type === 'invite' && isSpectator) {
        const myHandle = (handle || '').replace(/^@/, '').toLowerCase();
        const guest = String(data.guestHandle || '')
          .replace(/^@/, '')
          .toLowerCase();
        const sameLive =
          !data.liveId || roomKey(String(data.liveId)) === roomKey(username);
        const mine =
          (data.viewerId && data.viewerId === firebaseUid) ||
          Boolean(myHandle && guest && myHandle === guest);
        if (sameLive && mine) {
          setSalaInvite({
            inviteId: data.inviteId,
            hostName: String(data.hostName || 'host'),
            hostId: data.hostId,
            viewerId: data.viewerId || firebaseUid,
            liveId: data.liveId || username,
            guestHandle: data.guestHandle,
          });
          setSalaInviteError(null);
        }
      }
      if (data.type === 'invite_response' && isHost) {
        const viewerId = String(data.viewerId || '');
        const responseHandle = String(data.username || '').replace(/^@/, '');
        if (data.status === 'declined') {
          setSalaInviteStatus((current) =>
            !current || (viewerId && current.viewerId !== viewerId)
              ? current
              : { ...current, phase: 'declined' },
          );
          setInviteNote(
            `@${responseHandle || 'usuario'} rechazó la invitación.`,
          );
        }
        if (data.status === 'accepted') {
          setSalaInviteStatus((current) =>
            !current || (viewerId && current.viewerId !== viewerId)
              ? current
              : { ...current, phase: 'connecting' },
          );
        }
      }
      if (data.type === 'sala_control') {
        if (data.action === 'mute_cam') {
          setSalaCamOffIds((prev) =>
            prev.includes(data.identity) ? prev : [...prev, data.identity],
          );
        }
        if (data.action === 'unmute_cam' || data.action === 'restore') {
          setSalaCamOffIds((prev) => prev.filter((id) => id !== data.identity));
        }
        if (data.action === 'kick') {
          setSalaCamOffIds((prev) => prev.filter((id) => id !== data.identity));
          if (data.identity === firebaseUid) {
            void api('/api/stream/invite/leave', {
              method: 'POST',
              body: JSON.stringify({
                roomName: username,
                guestHandle: handle,
                viewerId: firebaseUid,
              }),
            }).catch(() => undefined);
            void removeLiveGuestInvites(username, [handle, firebaseUid]).catch(() => undefined);
            void onRejoinAsViewer?.();
            return;
          }
        }
        if (data.identity === firebaseUid) {
          if (data.action === 'mute_cam') {
            void room.localParticipant.setCameraEnabled(false);
            // Audio sigue activo.
            if (!room.localParticipant.isMicrophoneEnabled) {
              void room.localParticipant.setMicrophoneEnabled(true);
            }
          }
          if (data.action === 'unmute_cam' || data.action === 'restore') {
            void room.localParticipant.setCameraEnabled(true);
          }
          if (data.action === 'mute_mic') {
            void room.localParticipant.setMicrophoneEnabled(false);
          }
          if (data.action === 'unmute_mic') {
            void room.localParticipant.setMicrophoneEnabled(true);
          }
        }
      }
    };
    const onLocalGift = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          id: string;
          giftId: string;
          senderName?: string;
          multiplier?: number;
          senderUid?: string;
        }>
      ).detail;
      if (!detail?.giftId) return;
      applyGift(
        detail.giftId,
        detail.id,
        detail.senderName,
        detail.multiplier,
        detail.senderUid || firebaseUid || undefined,
      );
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
  }, [room, username, isHost, canPublish, isSpectator, showBoomAt, firebaseUid, hostUid, navigate, handle, onRejoinAsViewer]);

  useEffect(() => {
    if (!isHost) return;
    const markJoined = (identity: string) => {
      setSalaInviteStatus((current) => {
        if (!current || current.viewerId !== identity) return current;
        if (current.phase === 'declined') return current;
        return { ...current, phase: 'joined' };
      });
    };
    const onParticipantConnected = (participant: { identity?: string }) => {
      const identity = String(participant.identity || '');
      if (!identity) return;
      setSalaInviteStatus((current) => {
        if (!current || current.viewerId !== identity) return current;
        if (current.phase === 'declined' || current.phase === 'joined') return current;
        return { ...current, phase: 'connecting' };
      });
    };
    const onTrackPublished = (
      _pub: { source?: Track.Source },
      participant: { identity?: string },
    ) => {
      markJoined(String(participant.identity || ''));
    };
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.TrackPublished, onTrackPublished);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.TrackPublished, onTrackPublished);
    };
  }, [isHost, room]);

  useEffect(() => {
    if (!faceGift) return;
    const ms = Math.max(250, faceGift.endsAt - Date.now());
    const timer = window.setTimeout(() => setFaceGift(null), ms);
    return () => window.clearTimeout(timer);
  }, [faceGift?.id, faceGift?.endsAt]);

  useEffect(() => {
    if (isHost || liveEnded) return;
    return listenLiveRoomStatus(username, (status) => {
      if (status !== 'ended') return;
      // LIVE terminado: todos los no-host → Inicio de una vez.
      void exitLiveToHomeRef.current();
    });
  }, [username, isHost, canPublish, liveEnded, room, hostUid]);

  // Host: pulso también desde la sala (por si el stage se remonta).
  useEffect(() => {
    if (!isHost || !username) return;
    if (hostSessionEndedRef.current || summaryOpen || liveEnded) return;
    void touchLiveRoomHeartbeat(username).catch(() => undefined);
    const timer = window.setInterval(() => {
      if (hostSessionEndedRef.current) return;
      void touchLiveRoomHeartbeat(username).catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [isHost, username, summaryOpen, liveEnded]);

  useEffect(() => {
    if (isHost || liveEnded) return;
    let cancelled = false;
    const check = async () => {
      if (switchCoverRef.current) return;
      if (room.state !== ConnectionState.Connected) return;
      try {
        const data = await apiPublic<{ streams?: SuggestedLive[] }>('/api/stream/live');
        if (cancelled) return;
        const active = (data.streams || []).some(
          (stream) => stream.username.toLowerCase() === username.toLowerCase(),
        );
        const hostMedia = Array.from(room.remoteParticipants.values()).some((participant) => {
          if (hostUid && !isHostOrScreenParticipant(participant.identity, hostUid)) return false;
          return participantHasHostMedia(participant.videoTrackPublications.values(), {
            requireLiveMedia: true,
          });
        });
        if (hostMedia) hadHostCamera.current = true;
        // Ausencia provisional ≠ finalización confirmada.
        if (hadHostCamera.current && !active && !hostMedia) {
          await new Promise((resolve) => window.setTimeout(resolve, 2500));
          if (cancelled) return;
          // Segunda comprobación fresca del feed + tracks (no reutilizar `active`).
          let stillActive = false;
          try {
            const again = await apiPublic<{ streams?: SuggestedLive[] }>('/api/stream/live');
            stillActive = (again.streams || []).some(
              (stream) => stream.username.toLowerCase() === username.toLowerCase(),
            );
          } catch {
            stillActive = active;
          }
          const stillHostMedia = Array.from(room.remoteParticipants.values()).some((participant) => {
            if (hostUid && !isHostOrScreenParticipant(participant.identity, hostUid)) return false;
            return participantHasHostMedia(participant.videoTrackPublications.values(), {
              requireLiveMedia: true,
            });
          });
          if (!stillHostMedia && !stillActive) {
            void exitLiveToHomeRef.current();
          }
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
  }, [username, isHost, canPublish, liveEnded, room, hostUid]);

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
    let latest: Array<{
      uid: string;
      username: string;
      displayName: string;
      heartbeatAtMs: number;
    }> = [];
    const apply = (
      list: Array<{
        uid: string;
        username: string;
        displayName: string;
        heartbeatAtMs: number;
      }>,
    ) => {
      const now = Date.now();
      setViewersList(
        list
          .filter(
            (viewer) =>
              viewer.uid &&
              viewer.uid !== firebaseUid &&
              viewer.heartbeatAtMs > 0 &&
              now - viewer.heartbeatAtMs <= LIVE_VIEWER_HEARTBEAT_TTL_MS,
          )
          .map((viewer) => ({
            identity: viewer.uid,
            username: viewer.username || viewer.uid,
            name: viewer.displayName || viewer.username || viewer.uid,
          })),
      );
    };
    const unsub = listenLiveViewers(username, (list) => {
      latest = list;
      apply(list);
    });
    const timer = window.setInterval(() => apply(latest), 4000);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, [isHost, username, firebaseUid]);

  useEffect(() => {
    if (!viewersOpen) return;
    prefetchLiveChatAuthorProfiles(viewersList.map((person) => person.identity));
  }, [viewersOpen, viewersList]);

  async function kickLiveViewer(person: SalaInviteViewer) {
    if (!isHost || !person.identity || kickBusyId) return;
    setKickBusyId(person.identity);
    try {
      await api('/api/stream/viewers/kick', {
        method: 'POST',
        body: JSON.stringify({
          roomName: username,
          guestUid: person.identity,
          guestHandle: person.username,
          handle,
        }),
      });
      void publishRoomData(room, { type: 'live_kick', identity: person.identity }).catch(
        () => undefined,
      );
      void unregisterLiveViewer(username, person.identity).catch(() => undefined);
      setViewersList((current) => current.filter((row) => row.identity !== person.identity));
      setInviteNote(`Expulsaste a @${person.username || person.name}`);
    } catch (err) {
      setInviteNote(err instanceof Error ? err.message : 'No se pudo expulsar');
    } finally {
      setKickBusyId(null);
    }
  }

  async function setLiveLock(requirements: LockGiftRequirement[] | null) {
    if (!isHost) return;
    setLockBusy(true);
    try {
      const body =
        requirements && requirements.length
          ? {
              roomName: username,
              handle,
              requirements: requirements.map((row) => ({
                giftId: row.giftId,
                quantity: row.quantity,
              })),
            }
          : { roomName: username, clear: true, handle };
      const result = await api<{ lock: LockInfo | null; locked: boolean; isPrivate?: boolean }>(
        '/api/stream/lock',
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      );
      const next = result.locked ? result.lock : null;
      setLock(next);
      setLockUnlocked(!next || !result.isPrivate);
      setLockPicker(false);
      const nowPrivate = Boolean(result.isPrivate);
      onPrivacyChange?.(nowPrivate);
      if (next) {
        if (next.privateSessionId) setPrivateSessionIdState(next.privateSessionId);
        const nextPhase = nowPrivate ? 'private' : 'collecting';
        setPrivatePhase(nextPhase);
        privatePhaseRef.current = nextPhase;
      } else {
        await clearPrivateSchedule(username).catch(() => undefined);
        setPrivateStartsAtMs(null);
        setPrivatePhase(null);
        setPrivateRequirements(null);
        qualifiedViewerUidsRef.current = [];
        setPrivacyRequests([]);
      }
      await updateLiveRoomFeed(username, {
        isPrivate: nowPrivate,
        lockGiftId: next?.giftId ?? null,
      }).catch(() => undefined);
      await publishRoomData(room, { type: 'lock', lock: next });
      setInviteNote(
        next
          ? nowPrivate
            ? 'LIVE privado. Quien envíe el regalo solicita entrar; tú aceptas o rechazas.'
            : 'Candado activo. El LIVE sigue público. Pasa a privado cuando quieras.'
          : 'Candado quitado. Live reabierto al público.',
      );
    } catch (err) {
      setInviteNote(err instanceof Error ? err.message : 'No se pudo actualizar el candado');
    } finally {
      setLockBusy(false);
    }
  }

  function openLockPicker() {
    const reqs = lockRequirementsOf(lock);
    const ids = reqs.map((row) => row.giftId);
    const qty: Record<string, number> = {};
    for (const row of reqs) qty[row.giftId] = row.quantity;
    setLockDraftIds(ids);
    setLockDraftQty(qty);
    setWishlistOpen(false);
    setLockPicker(true);
  }

  function toggleLockDraftGift(giftId: string) {
    const selected = lockDraftIds[0] === giftId;
    if (selected) {
      setLockDraftIds([]);
      setLockDraftQty({});
      return;
    }
    setLockDraftIds([giftId]);
    setLockDraftQty({ [giftId]: 1 });
  }

  async function applyLockDraft() {
    if (lock) {
      setInviteNote('Quita el candado actual para elegir un regalo nuevo.');
      return;
    }
    const giftId = lockDraftIds[0];
    if (!giftId) {
      setInviteNote('Elige el regalo para entrar al privado.');
      return;
    }
    const gift = findLiveGift(giftId);
    if (!gift) return;
    await setLiveLock([
      {
        giftId: gift.id,
        giftName: gift.name,
        coins: gift.coins,
        emoji: gift.emoji || '🎁',
        quantity: 1,
      },
    ]);
  }

  async function sealLiveLock() {
    if (!isHost) return;
    setLockBusy(true);
    try {
      const result = await api<{ lock: LockInfo | null; locked: boolean; isPrivate?: boolean }>(
        '/api/stream/lock',
        {
          method: 'POST',
          body: JSON.stringify({ roomName: username, handle, seal: true }),
        },
      );
      const next = result.locked ? result.lock : null;
      if (next) {
        next.sealed = true;
        setLock(next);
        if (next.privateSessionId) setPrivateSessionIdState(next.privateSessionId);
      }
      setLockUnlocked(true);
      setLockPicker(false);
      onPrivacyChange?.(true);
      setPrivatePhase('private');
      privatePhaseRef.current = 'private';
      await updateLiveRoomFeed(username, {
        isPrivate: true,
        lockGiftId: next?.giftId ?? lock?.giftId ?? null,
      }).catch(() => undefined);
      await publishRoomData(room, { type: 'lock', lock: next ? { ...next, sealed: true } : lock });
      setInviteNote('LIVE privado. Quienes ya enviaron el regalo entran; el resto solicita acceso.');
    } catch (err) {
      setInviteNote(err instanceof Error ? err.message : 'No se pudo pasar a privado');
    } finally {
      setLockBusy(false);
    }
  }

  async function acceptPrivacyRequest(uid: string) {
    if (!isHost) return;
    setPrivacyBusyUid(uid);
    try {
      await api('/api/stream/grant-access', {
        method: 'POST',
        body: JSON.stringify({ roomName: username, viewerUid: uid, handle }),
      });
      setPrivacyFocusUid(null);
    } catch (err) {
      setInviteNote(err instanceof Error ? err.message : 'No se pudo aceptar');
    } finally {
      setPrivacyBusyUid(null);
    }
  }

  async function rejectPrivacyRequest(uid: string) {
    if (!isHost) return;
    setPrivacyBusyUid(uid);
    try {
      await api('/api/stream/reject-access', {
        method: 'POST',
        body: JSON.stringify({ roomName: username, viewerUid: uid, handle }),
      });
      setPrivacyFocusUid(null);
    } catch (err) {
      setInviteNote(err instanceof Error ? err.message : 'No se pudo rechazar');
    } finally {
      setPrivacyBusyUid(null);
    }
  }

  const flipCamera = useCallback(async () => {
    if (!canPublish || flipping) return;
    setFlipping(true);
    try {
      if (hostDeepAr.activeFilter) {
        const ok = await hostDeepAr.flipFacing();
        if (ok) return;
      }
      const nextFacing = facing === 'user' ? 'environment' : 'user';
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
  }, [canPublish, flipping, facing, room, hostDeepAr]);

  const toggleMic = useCallback(async () => {
    if (!canPublish) return;
    try {
      if (screenSharing && isNativeAndroidApp() && nativeMicLiveTrackRef.current) {
        const muted = toggleNativeMicMuted();
        const track = nativeMicLiveTrackRef.current;
        if (muted) await track.mute().catch(() => undefined);
        else await track.unmute().catch(() => undefined);
        setGamingMixer(getNativeAudioMixerState());
        return;
      }
      await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);
    } catch (err) {
      console.error('[live] mic toggle', err);
    }
  }, [canPublish, room, screenSharing]);

  const toggleCamera = useCallback(async () => {
    if (!canPublish) return;
    // Mobile Gaming: Screen Share no gestiona cámara (ni toggle UI).
    if (screenSharing && isNativeAndroidApp()) {
      setReelNote('Deja de compartir la pantalla para usar la cámara.');
      return;
    }
    try {
      const publication = [...room.localParticipant.videoTrackPublications.values()].find(
        (item) => item.source === Track.Source.Camera,
      );
      const track = publication?.track as LocalVideoTrack | undefined;
      if (!track) {
        setHostCamOn(true);
        await room.localParticipant.setCameraEnabled(true);
        return;
      }
      if (track.isMuted) {
        await track.unmute();
        if (track.mediaStreamTrack) track.mediaStreamTrack.enabled = true;
        setHostCamOn(true);
      } else {
        await track.mute();
        if (track.mediaStreamTrack) track.mediaStreamTrack.enabled = false;
        setHostCamOn(false);
      }
    } catch (err) {
      console.error('[live] camera toggle', err);
    }
  }, [canPublish, room, screenSharing]);

  useEffect(() => {
    peakViewersRef.current = 0;
    setLiveStats((current) =>
      current ? { ...current, username, startedAt: '' } : current,
    );
  }, [username]);

  useEffect(() => {
    peakViewersRef.current = Math.max(peakViewersRef.current, viewers);
  }, [viewers]);

  useEffect(() => {
    setWishSyncReady(false);
    return listenLiveWishlist(username, (ids, items, completed) => {
      wishItemsRef.current = items;
      setWishlist(ids);
      const next: Record<string, number> = {};
      const nextReceived: Record<string, number> = {};
      for (const item of items) {
        next[item.giftId] = item.targetQuantity;
        nextReceived[item.giftId] = item.receivedQuantity;
      }
      setWishQty(next);
      setWishReceived(nextReceived);
      setCompletedWishItems(completed);
      setWishSyncReady(true);
    });
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

  function wishlistEntries(ids: string[], qtyMap: Record<string, number>): LiveWishItem[] {
    return ids.slice(0, LIVE_WISH_ACTIVE_MAX).map((giftId) => {
      const prev = wishItemsRef.current.find((row) => row.giftId === giftId);
      const gift = findLiveGift(giftId);
      return {
        wishId: prev?.wishId || newLiveWishId(),
        giftId,
        giftName: gift?.name || prev?.giftName || giftId,
        giftIcon: gift?.emoji || gift?.image || prev?.giftIcon || '',
        giftPrice: gift?.coins || prev?.giftPrice || 0,
        targetQuantity: Math.min(99, Math.max(1, Math.floor(qtyMap[giftId] || 1))),
        receivedQuantity: prev?.receivedQuantity || 0,
        status: 'ACTIVE',
      };
    });
  }

  async function persistWishlist(ids: string[], qtyMap: Record<string, number>) {
    await setLiveWishlist(username, ids, wishlistEntries(ids, qtyMap)).catch(() => undefined);
  }

  async function toggleWishlistGift(giftId: string) {
    if (!isHost) return;
    const selected = wishlist.includes(giftId);
    if (selected) {
      const next = wishlist.filter((id) => id !== giftId);
      const nextQty = { ...wishQty };
      delete nextQty[giftId];
      setWishlist(next);
      setWishQty(nextQty);
      await persistWishlist(next, nextQty);
      return;
    }
    if (wishlist.length >= LIVE_WISH_ACTIVE_MAX) return;
    const next = [...wishlist, giftId];
    const nextQty = { ...wishQty, [giftId]: 1 };
    setWishlist(next);
    setWishQty(nextQty);
    await persistWishlist(next, nextQty);
  }

  async function setWishlistQuantity(giftId: string, value: number) {
    if (!isHost) return;
    const qty = Math.min(99, Math.max(0, Math.floor(Number(value) || 0)));
    const selected = wishlist.includes(giftId);
    if (qty <= 0) {
      if (!selected) return;
      const next = wishlist.filter((id) => id !== giftId);
      const nextQty = { ...wishQty };
      delete nextQty[giftId];
      setWishlist(next);
      setWishQty(nextQty);
      await persistWishlist(next, nextQty);
      return;
    }
    if (!selected) {
      if (wishlist.length >= LIVE_WISH_ACTIVE_MAX) return;
      const next = [...wishlist, giftId];
      const nextQty = { ...wishQty, [giftId]: qty };
      setWishlist(next);
      setWishQty(nextQty);
      await persistWishlist(next, nextQty);
      return;
    }
    const nextQty = { ...wishQty, [giftId]: qty };
    setWishQty(nextQty);
    await persistWishlist(wishlist, nextQty);
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
            startedAt: persistLiveStartedAt(
              liveStartedAt.current ? new Date(liveStartedAt.current).toISOString() : '',
            ),
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
      setGiftsCount((n) => n + 1);
      setRecentGifts((rows) =>
        [
          {
            id: gift.id,
            senderName: gift.senderName || 'Liveboomer',
            giftId: gift.giftId,
            giftName: gift.giftName || gift.giftId,
            coins: gift.coins,
            atLabel: 'Ahora',
          },
          ...rows.map((row) =>
            row.atLabel === 'Ahora' ? { ...row, atLabel: 'Hace 1m' } : row,
          ),
        ].slice(0, 12),
      );
      void addFirestoreCoins(firebaseUid, gift.coins)
        .then((next) => {
          if (typeof next === 'number') setCoins(next);
        })
        .catch(() => {
          const current = useAuthStore.getState().profile?.coinsBalance ?? 0;
          setCoins(current + gift.coins);
        });
      void addLevelXp(firebaseUid, Math.max(1, Math.floor(gift.coins / 2))).catch(() => undefined);
      battle.creditGift(gift.coins);
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

  async function confirmLeave(dest: '/' | '/transmitir' = '/') {
    if (leaving) return;
    setLeaving(true);
    setEndLiveError(null);
    try {
      if (isHost) {
        if (endedBackendOkRef.current) {
          setLeaveOpen(false);
          setSummaryOpen(true);
          return;
        }
        hostSessionEndedRef.current = true;
        const endedAtMs = Date.now();
        endedAtMsRef.current = endedAtMs;
        const startedAt =
          persistLiveStartedAt(
            liveStats?.startedAt,
            liveStartedAt.current ? new Date(liveStartedAt.current).toISOString() : '',
          ) || new Date(endedAtMs).toISOString();
        const durationMs = Math.max(0, endedAtMs - new Date(startedAt).getTime());
        const endStats: LiveEndStats = {
          durationMs,
          viewers: Math.max(viewers, peakViewersRef.current),
          coinsEarned: liveStats?.coinsEarned || 0,
          giftsCount,
          likes: liveBoomCount,
          goalCoins: liveStats?.goalCoins || goalCoins || 0,
        };
        if (!onLeaveLive) {
          hostSessionEndedRef.current = false;
          endedAtMsRef.current = 0;
          setEndLiveError('No se pudo finalizar el LIVE. Intenta nuevamente.');
          return;
        }
        try {
          await onLeaveLive(endStats);
        } catch {
          hostSessionEndedRef.current = false;
          endedAtMsRef.current = 0;
          setEndLiveError('No se pudo finalizar el LIVE. Intenta nuevamente.');
          return;
        }
        endedBackendOkRef.current = true;
        const guestIdentities = Array.from(room.remoteParticipants.values())
          .map((p) => p.identity)
          .filter(
            (id) =>
              Boolean(id) &&
              id !== firebaseUid &&
              !isScreenShareIdentity(id),
          );
        // Avisar a todos (espectadores + invitados Sala) ANTES de desconectar.
        await publishRoomData(room, {
          type: 'live_ended',
          hostName: displayName || handle || username,
        }).catch(() => undefined);
        if (guestIdentities.length > 0) {
          await Promise.all([
            banLiveSalaGuests(username, guestIdentities).catch(() => undefined),
            removeLiveGuestInvites(username, guestIdentities).catch(() => undefined),
          ]);
        }
        // Ventana para que espectadores e invitados reciban live_ended y vayan a Inicio.
        await new Promise((resolve) => window.setTimeout(resolve, 320));
        await Promise.all([
          battle.stop().catch(() => undefined),
          stopScreenCaptureRef.current().catch(() => undefined),
        ]);
        onHangupLiveKit?.();
        const local = room.localParticipant;
        await Promise.all(
          [...local.trackPublications.values()].map(async (pub) => {
            const track = pub.track;
            try {
              if (track && 'mediaStreamTrack' in track) {
                track.mediaStreamTrack?.stop();
              }
            } catch {
              /* ignore */
            }
            try {
              if (track && 'stop' in track && typeof track.stop === 'function') {
                track.stop();
              }
            } catch {
              /* ignore */
            }
            try {
              if (track) await local.unpublishTrack(track, true);
            } catch {
              /* ignore */
            }
          }),
        );
        try {
          cameraTrackRef.current?.mediaStreamTrack?.stop();
          cameraTrackRef.current?.stop();
        } catch {
          /* ignore */
        }
        cameraTrackRef.current = null;
        try {
          rawCameraTrackRef.current?.mediaStreamTrack?.stop();
          rawCameraTrackRef.current?.stop();
        } catch {
          /* ignore */
        }
        rawCameraTrackRef.current = null;
        try {
          await local.setCameraEnabled(false);
        } catch {
          /* ignore */
        }
        try {
          await local.setMicrophoneEnabled(false);
        } catch {
          /* ignore */
        }
        try {
          await local.setScreenShareEnabled(false);
        } catch {
          /* ignore */
        }
        await room.disconnect().catch(() => undefined);
        if (firebaseUid) {
          await archiveLiveActivity(firebaseUid, {
            username,
            displayName: displayName || handle || username,
            title: liveStats?.goalLabel
              ? `Live · ${liveStats.goalLabel}`
              : `Live de ${displayName || handle || username}`,
            startedAt,
            endedAt: new Date(endedAtMs).toISOString(),
            durationMs,
            viewers: Math.max(viewers, peakViewersRef.current),
            coinsEarned: liveStats?.coinsEarned || 0,
            goalCoins: liveStats?.goalCoins || goalCoins || 0,
            goalLabel: liveStats?.goalLabel || goalLabel || '',
            topGifters: liveStats?.topGifters || [],
          }).catch((error) => console.error('[live] archive', error));
        }
        setLiveEnded(true);
        setLeaveOpen(false);
        setSummaryOpen(true);
        return;
      }
      if (canPublish && handle) {
        await api('/api/stream/invite/leave', {
          method: 'POST',
          body: JSON.stringify({
            roomName: username,
            guestHandle: handle,
            viewerId: firebaseUid,
          }),
        }).catch(() => undefined);
        await removeLiveGuestInvites(username, [handle, firebaseUid]).catch(() => undefined);
      }
      await room.disconnect().catch(() => undefined);
      await onLeaveLive?.();
      navigate(dest, { replace: true });
    } finally {
      setLeaving(false);
      if (!isHost || endedBackendOkRef.current) {
        setLeaveOpen(false);
      }
    }
  }

  async function shareLive() {
    const url = `${window.location.origin}/stream/${encodeURIComponent(username)}`;
    const result = await shareContent({
      url,
      title: t('share.liveOf', { name: username }),
      text: t('share.lookAtLive'),
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
      title: t('share.profileOf', { name: username }),
      text: t('share.lookAtProfile', { name: username }),
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
  void shareHostProfile;

  async function inviteGuest(viewer: SalaInviteViewer) {
    if (!isHost) return;
    const viewerId = String(viewer.identity || '').trim();
    const guestHandle = String(viewer.username || viewer.name || '')
      .trim()
      .replace(/^@/, '');
    if (!viewerId || !guestHandle) return;
    if (!viewersList.some((item) => item.identity === viewerId)) {
      setInviteNote('Esa persona ya no está viendo este LIVE.');
      return;
    }
    setInviteNote(null);
    setSalaInviteBusy(true);
    try {
      const result = await api<{
        invite?: {
          inviteId?: string;
          viewerId?: string;
          guestHandle?: string;
          uid?: string | null;
        };
      }>('/api/stream/invite', {
        method: 'POST',
        body: JSON.stringify({
          roomName: username,
          liveId: username,
          viewerId,
          guestHandle,
          handle,
          hostId: firebaseUid,
          targetSlot: 'SALA_1',
        }),
      });
      const inviteId = result.invite?.inviteId || '';
      await publishRoomData(room, {
        type: 'invite',
        guestHandle,
        hostName: handle || displayName || username,
        inviteId,
        liveId: username,
        hostId: firebaseUid,
        viewerId,
        targetSlot: 'SALA_1',
      });
      if (viewerId && firebaseUid) {
        await notifyLiveInvite({
          hostUid: firebaseUid,
          hostUsername: username,
          hostName: handle || displayName || username,
          guestUid: viewerId,
          guestHandle,
        }).catch(() => undefined);
      }
      setSalaInviteStatus({
        viewerId,
        username: guestHandle,
        phase: 'waiting',
      });
      setInviteNote(`Invitación enviada a @${guestHandle}`);
    } catch (err) {
      setInviteNote(err instanceof Error ? err.message : 'No se pudo invitar');
    } finally {
      setSalaInviteBusy(false);
    }
  }

  const stopScreenCapture = useCallback(async () => {
    const gate = screenShareGateRef.current;
    await gate.runStop(async () => {
      if (restoreCamTimerRef.current) {
        window.clearTimeout(restoreCamTimerRef.current);
        restoreCamTimerRef.current = 0;
      }
      const composer = screenComposerRef.current;
      const composite = compositeTrackRef.current;
      const screenLive = screenVideoLiveTrackRef.current;
      const nativeCamLive = nativeCameraLiveTrackRef.current;
      const nativeMicLive = nativeMicLiveTrackRef.current;
      const screenMedia = screenMediaTrackRef.current;
      const screenAudio = screenAudioTrackRef.current;
      const screenAudioLive = screenAudioLiveTrackRef.current;

      screenComposerRef.current = null;
      compositeTrackRef.current = null;
      screenVideoLiveTrackRef.current = null;
      nativeCameraLiveTrackRef.current = null;
      nativeMicLiveTrackRef.current = null;
      screenMediaTrackRef.current = null;
      screenAudioTrackRef.current = null;
      screenAudioLiveTrackRef.current = null;
      pipInputTrackRef.current = null;

      composer?.stop();

      const unpublishScreenOnly = async (track: LocalVideoTrack | LocalAudioTrack | null) => {
        if (!track) return;
        try {
          await room.localParticipant.unpublishTrack(track, true);
        } catch {
          /* ignore */
        }
      };

      await Promise.all([
        unpublishScreenOnly(screenAudioLive),
        unpublishScreenOnly(screenLive),
        unpublishScreenOnly(nativeCamLive),
        unpublishScreenOnly(nativeMicLive),
        unpublishScreenOnly(composite),
      ]);

      try {
        const extraScreen = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
        if (extraScreen?.track && extraScreen.track !== screenLive) {
          await room.localParticipant.unpublishTrack(extraScreen.track, true);
        }
        const extraAudio = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
        if (extraAudio?.track && extraAudio.track !== screenAudioLive) {
          await room.localParticipant.unpublishTrack(extraAudio.track, true);
        }
      } catch {
        /* ignore */
      }

      screenMedia?.stop();
      screenAudio?.stop();
      const androidShare = isNativeAndroidApp();
      await Promise.all([
        // Android Screen Share nunca inicia overlay camera → no stopearla aquí.
        androidShare
          ? Promise.resolve()
          : stopNativeOverlayCameraStream().catch(() => undefined),
        stopNativeScreenAudioStream().catch(() => undefined),
        stopNativeMicStream().catch(() => undefined),
        stopNativeLiveKitScreenShare().catch(() => undefined),
        stopNativeScreenShareIfAny().catch(() => undefined),
        setNativePresentationOverlaysVisible(false).catch(() => undefined),
      ]);

      screenShareTransportRef.current = null;
      endScreenShareSession('stop');
      logScreenStop({ reason: 'user_or_system' });
      ssLog('SS-STOP', { reason: 'user_or_system' });
      resetScreenShareChatHudCache();

      // Volver al LIVE limpio. No tocar Sala/Battle.
      setScreenSharing(false);
      setScreenShareLiveGuard(false);
      if (!androidShare) {
        setFrameLayout(defaultCameraFrameLayout(aspectRatio));
      }
      setPipVisible(true);
      setReelNote('Dejaste de compartir la pantalla. Tu transmisión continúa normalmente.');
      logModeNormal('after_screen_stop');

      if (isNativeAndroidApp()) {
        await new Promise<void>((r) => window.setTimeout(r, 40));
        if (hostCamOn) {
          const cameraId = cameraDeviceId || String(launch.cameraId || '');
          const camOpts = cameraId ? { deviceId: cameraId } : { facingMode: facing };
          for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
              await room.localParticipant.setCameraEnabled(true, camOpts);
            } catch {
              /* retry */
            }
            await new Promise<void>((r) => window.setTimeout(r, 90));
            const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
            const media =
              pub?.track && 'mediaStreamTrack' in pub.track
                ? pub.track.mediaStreamTrack
                : undefined;
            if (media && media.readyState === 'live') break;
          }
        }
        // Restaurar mic según estado independiente del share (no forzar ON).
        const wantMic = shareMicrophoneEnabledRef.current;
        try {
          await room.localParticipant.setMicrophoneEnabled(
            wantMic,
            wantMic && micDeviceId ? { deviceId: micDeviceId } : undefined,
          );
        } catch {
          /* ignore */
        }
      }
    });
  }, [
    room,
    aspectRatio,
    hostCamOn,
    launch.cameraId,
    micDeviceId,
    cameraDeviceId,
    facing,
  ]);

  const stopScreenCaptureRef = useRef(stopScreenCapture);
  stopScreenCaptureRef.current = stopScreenCapture;

  useEffect(() => {
    return () => {
      // No detener captura nativa al desmontar React: el FGS es el propietario.
      if (isScreenShareLiveGuardActive()) {
        console.log('[SCREEN SHARE] unmount skipped stopCapture (guard)');
        return;
      }
      if (isNativeAndroidApp() && isHost) {
        console.log('[SCREEN SHARE] unmount skipped stopCapture (host continuity)');
        return;
      }
      void stopScreenCaptureRef.current();
    };
  }, [isHost]);

  useEffect(() => {
    if (!isHost || !isNativeAndroidApp()) return;
    let cancelled = false;
    let unbind: (() => void) | undefined;
    void bindScreenShareAudioLimited((message) => {
      if (!cancelled) {
        if (message === 'AUDIO_HOST_BRANCH') {
          ssLog('SS-AUDIO', { signal: 'AUDIO_HOST_BRANCH' });
          return;
        }
        setReelNote(message);
      }
    }).then((fn) => {
      if (cancelled) {
        void fn();
        return;
      }
      unbind = fn;
    });
    return () => {
      cancelled = true;
      unbind?.();
    };
  }, [isHost]);

  useEffect(() => {
    if (!isHost || !isNativeAndroidApp()) return;
    let cancelled = false;
    let unbind: (() => void) | undefined;
    void bindNativeStopScreenShare(() => {
      void stopScreenCaptureRef.current().then(() => {
        setReelNote(null);
      });
    }).then((fn) => {
      if (cancelled) {
        void fn();
        return;
      }
      unbind = fn;
    });
    return () => {
      cancelled = true;
      unbind?.();
    };
  }, [isHost]);

  useEffect(() => {
    if (!isHost || !screenSharing || !isNativeAndroidApp()) return;
    let cancelled = false;
    let unbind: (() => void) | undefined;
    void bindPresentationHudAction((action) => {
      if (action === 'exit') {
        void stopScreenCaptureRef.current().then(() => setReelNote(null));
        return;
      }
      if (action === 'mic') {
        void (async () => {
          const muted = toggleNativeMicMuted();
          const nextEnabled = !muted;
          setShareMicrophoneEnabled(nextEnabled);
          shareMicrophoneEnabledRef.current = nextEnabled;
          const track = nativeMicLiveTrackRef.current;
          if (track) {
            if (muted) await track.mute().catch(() => undefined);
            else await track.unmute().catch(() => undefined);
          } else {
            try {
              await room.localParticipant.setMicrophoneEnabled(
                nextEnabled,
                nextEnabled && micDeviceId ? { deviceId: micDeviceId } : undefined,
              );
            } catch {
              /* ignore */
            }
          }
          setGamingMixer(getNativeAudioMixerState());
        })();
        return;
      }
      if (action === 'gameAudio') {
        void (async () => {
          const muted = toggleNativeGameAudioMuted();
          const nextEnabled = !muted;
          setShareDeviceAudioEnabled(nextEnabled);
          const track = screenAudioLiveTrackRef.current;
          if (track) {
            if (muted) await track.mute().catch(() => undefined);
            else await track.unmute().catch(() => undefined);
          }
          setGamingMixer(getNativeAudioMixerState());
        })();
      }
    }).then((fn) => {
      if (cancelled) {
        void fn();
        return;
      }
      unbind = fn;
    });
    return () => {
      cancelled = true;
      unbind?.();
    };
  }, [isHost, screenSharing, room, micDeviceId]);

  useEffect(() => {
    if (!isHost || !screenSharing || !gamingSpaceActive) return;
    const tick = window.setInterval(() => {
      setGamingMixer(getNativeAudioMixerState());
    }, 250);
    return () => window.clearInterval(tick);
  }, [isHost, screenSharing, gamingSpaceActive]);

  useEffect(() => {
    if (!isHost || !screenSharing) {
      setGamingBitrateKbps(null);
      setGamingRttMs(null);
      gamingStatsPrevRef.current = null;
      return;
    }
    let cancelled = false;
    const probe = async () => {
      try {
        const snap = await readHostPublisherStats(
          room as unknown as {
            engine?: { pcManager?: { publisher?: { getStats?: () => Promise<RTCStatsReport> } } };
          },
        );
        if (cancelled) return;
        if (snap) {
          if (snap.bitrateKbps > 0) setGamingBitrateKbps(snap.bitrateKbps);
          if (snap.rttMs > 0) setGamingRttMs(snap.rttMs);
          pushScreenShareDiag({
            transport: screenShareTransportRef.current,
            bitrateKbps: snap.bitrateKbps,
            rttMs: snap.rttMs,
            width: snap.width,
            height: snap.height,
            framesEncoded: snap.framesEncoded,
            framesDropped: snap.framesDropped,
            packetLoss: snap.packetLoss,
            gameAudioActive: Boolean(screenAudioLiveTrackRef.current && !screenAudioLiveTrackRef.current.isMuted),
            micActive: Boolean(
              nativeMicLiveTrackRef.current
                ? !nativeMicLiveTrackRef.current.isMuted
                : shareMicrophoneEnabledRef.current,
            ),
            orientation:
              typeof window !== 'undefined' && window.innerWidth > window.innerHeight
                ? 'landscape'
                : 'portrait',
            note: 'host-publisher-stats-2s',
          });
        }
      } catch {
        /* ignore */
      }
    };
    void probe();
    const timer = window.setInterval(() => void probe(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isHost, screenSharing, room]);

  async function askScreenShareWizard(): Promise<ScreenShareWizardResult | null> {
    if (!isNativeAndroidApp()) {
      return {
        target: 'full_display',
        microphoneEnabled: true,
        deviceAudioEnabled: true,
      };
    }
    setScreenShareWizardOpen(true);
    return await new Promise<ScreenShareWizardResult | null>((resolve) => {
      screenShareWizardResolverRef.current = resolve;
    });
  }

  function finishScreenShareWizard(result: ScreenShareWizardResult | null) {
    const resolve = screenShareWizardResolverRef.current;
    screenShareWizardResolverRef.current = null;
    setScreenShareWizardOpen(false);
    resolve?.(result);
  }

  async function toggleScreenCapture() {
    if (!isHost) return;
    // APK Android: Screen Share inactivo en todas las modalidades.
    if (isAndroidScreenShareDisabled()) {
      setReelNote(SCREEN_SHARE_COMING_SOON_MESSAGE);
      return;
    }
    const gamingPresent = canPresentGamingInLive(gamingSpaceActive);
    if (!canUseClassicScreenShare() && !gamingPresent) {
      setReelNote('Compartir pantalla no disponible en este dispositivo');
      return;
    }
    const gate = screenShareGateRef.current;
    if (screenSharing || gate.phase === 'active') {
      if (isNativeAndroidApp()) {
        setShareStopConfirmOpen(true);
        return;
      }
      await stopScreenCapture();
      setReelNote(null);
      setShareStoppedAckOpen(true);
      return;
    }
    if (gate.phase === 'stopping') {
      setReelNote('Espera a que termine de detener la captura…');
      await gate.runStop(async () => undefined);
      return;
    }

    const salaActive =
      salaBoomOpen ||
      Boolean(salaPinnedId) ||
      salaCamOffIds.length > 0 ||
      Array.from(room.remoteParticipants.values()).some((p) => {
        if (p.identity === firebaseUid) return false;
        return Array.from(p.videoTrackPublications.values()).some(
          (pub) => pub.source === Track.Source.Camera && !pub.isMuted,
        );
      });
    const battleActive = Boolean(battle.liveBattle || battle.battle || batallaOpen);
    const mutex = guardEnterScreenShare(salaActive, battleActive);
    if (!mutex.ok) {
      setReelNote(mutex.message);
      return;
    }

    let wizard: ScreenShareWizardResult | null = null;
    if (isNativeAndroidApp()) {
      wizard = await askScreenShareWizard();
      if (!wizard) {
        setReelNote(null);
        return;
      }
      setShareMicrophoneEnabled(wizard.microphoneEnabled);
      setShareDeviceAudioEnabled(wizard.deviceAudioEnabled);
      shareMicrophoneEnabledRef.current = wizard.microphoneEnabled;
      setNativeMicMuted(!wizard.microphoneEnabled);
      setNativeGameAudioMuted(!wizard.deviceAudioEnabled);
    } else {
      wizard = {
        target: 'full_display',
        microphoneEnabled: true,
        deviceAudioEnabled: true,
      };
    }

    const opId = gate.beginStart();
    if (opId == null) {
      setReelNote('Ya hay una solicitud de pantalla en curso…');
      return;
    }

    console.log('[SCREEN SHARE SUPPORT]', {
      getDisplayMedia: typeof navigator.mediaDevices?.getDisplayMedia === 'function',
      nativeAndroid: isNativeAndroidApp(),
      gamingSpace: gamingPresent,
      target: wizard.target,
      opId,
    });

    setScreenShareLiveGuard(true);
    let display: MediaStream | null = null;
    try {
      if (isNativeAndroidApp()) {
        setReelNote('Autoriza la captura en Android…');
        await ensureNativeScreenSharePermissions({
          microphoneEnabled: wizard.microphoneEnabled,
        });
        if (!gate.isCurrent(opId)) return;
      }
      if (!gate.advance(opId, 'starting')) {
        throw new Error('Operación de pantalla cancelada');
      }

      // —— Ruta preferente: LiveKit Android nativo (sin JPEG/canvas) ——
      const transportPref = resolveScreenShareTransport();
      if (isNativeAndroidApp() && firebaseUid && username && transportPref.kind === 'native') {
        try {
          const ssId = screenShareSessionIdFor(firebaseUid, opId);
          const screenTok = await api<{
            token: string;
            serverUrl: string;
            identity?: string;
          }>(`/api/stream/screen-token/${encodeURIComponent(username)}`, {
            method: 'POST',
            body: JSON.stringify({ handle: handle || username, sessionId: ssId }),
          });
          if (!gate.isCurrent(opId)) return;
          if (!screenTok?.token || !screenTok?.serverUrl) {
            throw new Error('Token de Screen Share incompleto');
          }
          if (!gate.advance(opId, 'publishing')) {
            throw new Error('Operación de pantalla cancelada');
          }
          const quality = getScreenShareQuality();
          ssLog('SS-SESSION', {
            transport: 'native',
            quality: quality.id,
            sessionId: ssId,
            identity: screenTok.identity,
          });
          await startNativeLiveKitScreenShare({
            serverUrl: screenTok.serverUrl,
            token: screenTok.token,
            // Solo indica si FGS debe capturar audio de juego (NO ScreenAudioCapturer nativo).
            deviceAudioEnabled: wizard.deviceAudioEnabled,
          });
          if (!gate.isCurrent(opId)) {
            await stopNativeLiveKitScreenShare().catch(() => undefined);
            return;
          }
          screenShareTransportRef.current = 'native';
          pushScreenShareDiag({
            transport: 'native',
            opId,
            sessionId: ssId,
            identity: screenTok.identity,
            note: `video-only native; quality=${quality.label}`,
            targetFps: quality.maxFps,
          });
          ssLog('SS-VIDEO', { transport: 'native', identity: screenTok.identity, quality: quality.id });

          // —— Rama MIC (host): FGS; si PCM silencioso → WebRTC (caso yemdups) ——
          let micBranch: 'host_fgs' | 'host_webrtc' | 'off' = wizard.microphoneEnabled
            ? 'host_fgs'
            : 'off';
          let gameBranch: 'host_playback_capture' | 'none' | 'unavailable' = wizard.deviceAudioEnabled
            ? 'host_playback_capture'
            : 'none';
          if (wizard.microphoneEnabled) {
            try {
              await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
              const micStream = await startNativeMicStream();
              const mt = micStream?.getAudioTracks()[0];
              const hasPcm = mt ? await waitForNativeMicSignal(2000) : false;
              if (mt && hasPcm && gate.isCurrent(opId)) {
                const existingMic =
                  room.localParticipant.getTrackPublication(Track.Source.Microphone);
                if (existingMic?.track) {
                  await room.localParticipant
                    .unpublishTrack(existingMic.track, true)
                    .catch(() => undefined);
                }
                const micLive = new LocalAudioTrack(mt);
                nativeMicLiveTrackRef.current = micLive;
                await room.localParticipant.publishTrack(micLive, {
                  source: Track.Source.Microphone,
                  name: 'microphone',
                });
                micBranch = 'host_fgs';
              } else {
                await stopNativeMicStream().catch(() => undefined);
                nativeMicLiveTrackRef.current = null;
                await room.localParticipant.setMicrophoneEnabled(
                  true,
                  micDeviceId ? { deviceId: micDeviceId } : undefined,
                );
                micBranch = 'host_webrtc';
                console.warn('[SS-MIC] FGS PCM silencioso → webrtc');
              }
            } catch (micErr) {
              console.warn('[SS-MIC] FGS fallback → webrtc', micErr);
              nativeMicLiveTrackRef.current = null;
              try {
                await stopNativeMicStream().catch(() => undefined);
                await room.localParticipant.setMicrophoneEnabled(
                  true,
                  micDeviceId ? { deviceId: micDeviceId } : undefined,
                );
                micBranch = 'host_webrtc';
              } catch {
                /* ignore */
              }
            }
            ssLog('SS-MIC', { branch: micBranch });
          } else {
            try {
              await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
            } catch {
              /* ignore */
            }
            ssLog('SS-MIC', { branch: 'off' });
          }

          // —— Rama AUDIO JUEGO (host): ScreenShareAudio; sin PCM → no publicar silencio ——
          if (wizard.deviceAudioEnabled) {
            try {
              const nativeAudio = await startNativeScreenAudioStream();
              const at = nativeAudio?.getAudioTracks()[0];
              const hasGamePcm = at ? await waitForNativeGameAudioSignal(2500) : false;
              if (at && hasGamePcm && gate.isCurrent(opId)) {
                screenAudioTrackRef.current = at;
                const audioLive = new LocalAudioTrack(at);
                screenAudioLiveTrackRef.current = audioLive;
                await room.localParticipant.publishTrack(audioLive, {
                  source: Track.Source.ScreenShareAudio,
                  name: 'screen_audio',
                });
                gameBranch = 'host_playback_capture';
                ssLog('SS-AUDIO', { branch: gameBranch });
              } else {
                await stopNativeScreenAudioStream().catch(() => undefined);
                screenAudioLiveTrackRef.current = null;
                screenAudioTrackRef.current = null;
                gameBranch = 'unavailable';
                setReelNote('Este juego no permite compartir su audio interno.');
                ssLog('SS-AUDIO', { branch: gameBranch });
              }
            } catch (audioErr) {
              console.warn('[SS-AUDIO] host branch failed', audioErr);
              gameBranch = 'unavailable';
              setReelNote('Este juego no permite compartir su audio interno.');
            }
          }

          beginScreenShareSession({
            opId,
            sessionId: ssId,
            transport: 'native',
            branch: {
              video: 'native_participant',
              microphone: micBranch === 'off' ? 'host_webrtc' : micBranch,
              gameAudio: gameBranch === 'unavailable' ? 'none' : gameBranch,
            },
          });

          setPipVisible(false);
          if (!gate.markActive(opId)) {
            await stopScreenCapture();
            return;
          }
          setScreenSharing(true);
          logScreenStart({ transport: 'native', opId, ssId });
          setReelNote(null);
          const overlayOk = await showScreenShareOverlayIfAllowed({ allowOverlayCamera: false });
          if (!overlayOk) {
            setReelNote(
              'Activa “Mostrar sobre otras apps” para Live Boom si quieres el chat flotante en el juego.',
            );
          } else {
            // Sync inicial de la ventana de mensajes (mismo patrón que al onPause).
            resetScreenShareChatHudCache();
            forcePushScreenShareChatLines(screenShareChatLinesFromCache(username));
          }
          console.log('[SS-SESSION] native ready', {
            identity: screenTok.identity || screenShareIdentityFor(firebaseUid),
            overlayOk,
            ssId,
            micBranch,
            gameBranch,
          });
          return;
        } catch (nativeErr) {
          console.warn('[SCREEN SHARE] native path failed → legacy fallback', nativeErr);
          await stopNativeLiveKitScreenShare().catch(() => undefined);
          setReelNote('Usando modo compatibilidad…');
        }
      }

      // —— Fallback legacy: JPEG → canvas → LiveKit WebView ——
      display = await requestScreenCaptureStream({
        preferSingleApp: true,
      });
      if (!gate.isCurrent(opId)) {
        releaseMediaStream(display);
        display = null;
        return;
      }

      const screenMedia = display.getVideoTracks()[0];
      const screenAudio = display.getAudioTracks()[0];
      if (!screenMedia) {
        releaseMediaStream(display);
        display = null;
        throw new Error('Sin pista de pantalla');
      }
      screenMediaTrackRef.current = screenMedia;
      if (screenAudio) screenAudioTrackRef.current = screenAudio;
      screenShareTransportRef.current = getActiveScreenShareTransport() || 'legacy';

      screenMedia.onended = () => {
        if (!gate.isCurrent(opId)) return;
        void stopScreenCapture().then(() => {
          setReelNote(null);
          setShareStoppedAckOpen(true);
        });
      };

      if (room.state !== ConnectionState.Connected) {
        await waitRoomConnected(room, {
          isCancelled: () => !gate.isCurrent(opId),
        });
      }
      if (!gate.isCurrent(opId)) {
        releaseMediaStream(display);
        display = null;
        screenMediaTrackRef.current = null;
        screenAudioTrackRef.current = null;
        return;
      }

      if (!gate.advance(opId, 'publishing')) {
        releaseMediaStream(display);
        display = null;
        throw new Error('Operación de pantalla cancelada');
      }

      const screenLive = new LocalVideoTrack(screenMedia);
      screenVideoLiveTrackRef.current = screenLive;
      try {
        screenMedia.contentHint = isNativeAndroidApp() ? 'motion' : 'detail';
      } catch {
        /* ignore */
      }

      await room.localParticipant.publishTrack(screenLive, {
        source: Track.Source.ScreenShare,
        name: 'screen',
        simulcast: !isNativeAndroidApp(),
        ...(isNativeAndroidApp()
          ? {
              videoCodec: 'vp8' as const,
              videoEncoding: {
                maxBitrate: 2_800_000,
                maxFramerate: 30,
              },
              degradationPreference: 'balanced' as const,
            }
          : {
              videoEncoding: {
                maxBitrate: 3_500_000,
                maxFramerate: 30,
              },
            }),
      });
      if (!gate.isCurrent(opId)) {
        await room.localParticipant.unpublishTrack(screenLive, true).catch(() => undefined);
        releaseMediaStream(display);
        return;
      }
      console.log('[SCREEN SHARE] legacy published');

      if (screenAudio && wizard.deviceAudioEnabled) {
        try {
          const audioLive = new LocalAudioTrack(screenAudio);
          screenAudioLiveTrackRef.current = audioLive;
          await room.localParticipant.publishTrack(audioLive, {
            source: Track.Source.ScreenShareAudio,
            name: 'screen_audio',
          });
        } catch (audioErr) {
          console.warn('[SCREEN SHARE] audio opcional falló', audioErr);
          screenAudioLiveTrackRef.current = null;
        }
      }

      if (
        isNativeAndroidApp() &&
        wizard.deviceAudioEnabled &&
        !screenAudioLiveTrackRef.current
      ) {
        try {
          const nativeAudio = await startNativeScreenAudioStream();
          const at = nativeAudio?.getAudioTracks()[0];
          const hasGamePcm = at ? await waitForNativeGameAudioSignal(2500) : false;
          if (at && hasGamePcm) {
            screenAudioTrackRef.current = at;
            const audioLive = new LocalAudioTrack(at);
            screenAudioLiveTrackRef.current = audioLive;
            await room.localParticipant.publishTrack(audioLive, {
              source: Track.Source.ScreenShareAudio,
              name: 'screen_audio',
            });
          } else {
            await stopNativeScreenAudioStream().catch(() => undefined);
            setReelNote('Esta aplicación no permite compartir su audio.');
          }
        } catch (audioErr) {
          console.warn('[SCREEN SHARE] native game audio', audioErr);
          setReelNote('Esta aplicación no permite compartir su audio.');
        }
      }

      if (isNativeAndroidApp() && wizard.microphoneEnabled) {
        try {
          await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
          const micStream = await startNativeMicStream();
          const mt = micStream?.getAudioTracks()[0];
          const hasPcm = mt ? await waitForNativeMicSignal(2000) : false;
          if (mt && hasPcm && gate.isCurrent(opId)) {
            const existingMic = room.localParticipant.getTrackPublication(Track.Source.Microphone);
            if (existingMic?.track) {
              await room.localParticipant
                .unpublishTrack(existingMic.track, true)
                .catch(() => undefined);
            }
            const micLive = new LocalAudioTrack(mt);
            nativeMicLiveTrackRef.current = micLive;
            await room.localParticipant.publishTrack(micLive, {
              source: Track.Source.Microphone,
              name: 'microphone',
            });
          } else {
            await stopNativeMicStream().catch(() => undefined);
            nativeMicLiveTrackRef.current = null;
            await room.localParticipant.setMicrophoneEnabled(
              true,
              micDeviceId ? { deviceId: micDeviceId } : undefined,
            );
            console.warn('[SCREEN SHARE] FGS PCM silencioso → webrtc');
          }
        } catch (micErr) {
          console.warn('[SCREEN SHARE] native mic', micErr);
          try {
            await stopNativeMicStream().catch(() => undefined);
            await room.localParticipant.setMicrophoneEnabled(
              true,
              micDeviceId ? { deviceId: micDeviceId } : undefined,
            );
          } catch {
            /* ignore */
          }
        }
      } else if (isNativeAndroidApp() && !wizard.microphoneEnabled) {
        try {
          await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
        } catch {
          /* ignore */
        }
      }

      // Sin cámara PiP / overlay camera durante presentación.
      setPipVisible(false);

      if (!gate.markActive(opId)) {
        await stopScreenCapture();
        return;
      }
      setScreenSharing(true);
      logScreenStart({
        transport: screenShareTransportRef.current || 'legacy',
        opId,
      });
      setReelNote(null);
      if (isNativeAndroidApp()) {
        void showScreenShareOverlayIfAllowed({ allowOverlayCamera: false });
      }
    } catch (err) {
      console.error('[SCREEN SHARE]', err);
      gate.failStart(opId);
      releaseMediaStream(display);
      display = null;
      screenShareTransportRef.current = null;
      setScreenShareLiveGuard(false);
      setScreenSharing(false);
      setReelNote(screenShareUserMessage(err) || 'No se pudo compartir la pantalla');
      if (isNativeAndroidApp()) {
        try {
          await stopNativeLiveKitScreenShare();
          await stopNativeScreenShareIfAny();
        } catch {
          /* ignore */
        }
      }
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

  const toggleMirror = useCallback(() => {
    setMirrorMode((current) => !current);
  }, []);

  const showLocalMirror = false;
  const effectiveFrameLayout =
    canPublish || isHost ? frameLayout : remoteFrameLayout;
  const effectivePipVisible = canPublish || isHost ? pipVisible : remotePipVisible;

  const effectiveSalaLayout = isHost ? salaLayout : remoteSalaLayout;
  const effectiveSalaPin = isHost ? salaPinnedId : remoteSalaPinnedId;

  const handleSalaControl = useCallback(
    (action: SalaCameraAction, identity: string) => {
      if (!isHost) return;
      if (action === 'pin') {
        const next = identity === salaPinnedId ? null : identity;
        setSalaPinnedId(next);
        void publishRoomData(room, {
          type: 'sala_layout',
          layout: salaLayout,
          pin: next,
        }).catch(() => undefined);
        void setLiveSalaLayout(username, salaLayout, next).catch(() => undefined);
        return;
      }
      if (action === 'mute_cam') {
        setSalaCamOffIds((prev) => (prev.includes(identity) ? prev : [...prev, identity]));
      }
      if (action === 'unmute_cam' || action === 'restore') {
        setSalaCamOffIds((prev) => prev.filter((id) => id !== identity));
      }
      if (action === 'kick') {
        setSalaCamOffIds((prev) => prev.filter((id) => id !== identity));
        void publishRoomData(room, { type: 'sala_control', action, identity }).catch(
          () => undefined,
        );
        void api('/api/stream/invite/kick', {
          method: 'POST',
          body: JSON.stringify({
            roomName: username,
            guestUid: identity,
            handle,
          }),
        }).catch(() => undefined);
        void banLiveSalaGuests(username, [identity]).catch(() => undefined);
        void removeLiveGuestInvites(username, [identity]).catch(() => undefined);
        return;
      }
      void publishRoomData(room, { type: 'sala_control', action, identity }).catch(() => undefined);
    },
    [room, salaLayout, salaPinnedId, username, isHost, handle],
  );

  const publishHostFrame = useCallback(
    (layout: LiveFrameLayout, visible: boolean) => {
      setFrameLayout(layout);
      void publishFrameSync(room, layout, visible).catch(() => undefined);
    },
    [room],
  );

  const verticalHost = Boolean(isHost && aspectRatio === '9:16' && !battle.liveBattle);
  const liveGoal = (() => {
    const totalEarned = liveStats?.coinsEarned || 0;
    const fallbackTarget = Number(liveStats?.goalCoins || goalCoins || 0);
    const cycle =
      coinGoal ||
      (fallbackTarget > 0
        ? {
            goalId: 'launch',
            targetCoins: fallbackTarget,
            baselineCoins: 0,
            status: 'ACTIVE' as const,
            createdAt: 0,
          }
        : null);
    const progress = liveGoalProgress(cycle, totalEarned);
    if (progress.target <= 0 && totalEarned <= 0) return null;
    const target = progress.target || Math.max(100, Math.ceil(Math.max(totalEarned, 1) / 100) * 100);
    const current = progress.target > 0 ? progress.current : totalEarned;
    const pct = progress.target > 0 ? progress.pct : Math.min(100, Math.round((totalEarned / target) * 100));
    return {
      goalId: cycle?.goalId,
      earned: current,
      goal: progress.target || target,
      pct,
      label: liveStats?.goalLabel || goalLabel || 'Meta en coins',
      top: coinGoalTop || liveStats?.topGifters[0]?.name || '',
      reached: progress.reached,
    } satisfies LiveCoinGoalInfo;
  })();

  useEffect(() => {
    if (!liveGoal?.reached || !liveGoal.goalId) return;
    if (celebratedGoalRef.current === liveGoal.goalId) return;
    celebratedGoalRef.current = liveGoal.goalId;
    setGoalCelebrating(true);
    const timer = window.setTimeout(() => setGoalCelebrating(false), 4200);
    return () => window.clearTimeout(timer);
  }, [liveGoal?.reached, liveGoal?.goalId]);

  async function createNextCoinGoal(target: number) {
    if (!isHost || newCoinGoalBusy) return;
    setNewCoinGoalBusy(true);
    setNewCoinGoalError(null);
    try {
      const next = await startLiveCoinGoal(username, target, {
        coinsEarnedHint: liveStats?.coinsEarned || 0,
      });
      setCoinGoal(next);
      setCoinGoalTop('');
      setLiveStats((current) =>
        current ? { ...current, goalCoins: next.targetCoins } : current,
      );
      setNewCoinGoalOpen(false);
      setGoalCelebrating(false);
    } catch (err) {
      setNewCoinGoalError(err instanceof Error ? err.message : 'No se pudo crear la meta');
    } finally {
      setNewCoinGoalBusy(false);
    }
  }

  return (
    <div
      className={
        isHost
          ? 'lb-host-stage-wrap flex min-h-0 w-full flex-1 flex-col gap-2 lg:w-[72%] lg:min-w-0'
          : 'lb-viewer-stage-wrap flex min-h-0 w-full flex-1 flex-col lg:w-[70%]'
      }
    >
      <div className={`flex min-h-0 flex-1 ${isHost ? 'gap-3' : ''}`}>
        {isHost ? (
          <HostLiveLeftRail
            stats={{
              startedAt: liveStats?.startedAt,
              endedAtMs: endedAtMsRef.current || undefined,
              viewers,
              likes: liveBoomCount,
              giftsCount,
              coinsEarned: liveStats?.coinsEarned || 0,
              goalCoins: liveGoal?.goal || liveStats?.goalCoins || goalCoins || 20,
              goalCurrent: liveGoal?.earned,
              goalReached: Boolean(liveGoal?.reached),
              goalLabel: liveStats?.goalLabel || goalLabel,
              topGifters: liveStats?.topGifters || [],
            }}
            recentGifts={recentGifts}
            nowMs={dashNow}
            onOpenWishlist={() => {
              setLockPicker(false);
              setWishlistOpen(true);
            }}
            onNewCoinGoal={
              liveGoal?.reached
                ? () => {
                    setNewCoinGoalError(null);
                    setNewCoinGoalOpen(true);
                  }
                : undefined
            }
          />
        ) : null}
        <section className={liveStageSectionClass({ hostDashboard: isHost })}>
      <div className="relative h-full w-full max-w-full lg:max-h-full">
        <div className={`${liveStageOuterClass(aspectRatio, liveViewport)}${verticalHost ? ' lb-live-vtools-host' : ''}${canCarouselLive ? ' is-live-carousel-nav' : ''}`}>
          {isHost && !battle.liveBattle ? (
            <div className={`lb-live-vtools-slot${verticalHost ? '' : ' is-wide'}`}>
              <VerticalLiveToolsMenu
                micOn={
                  screenSharing && isNativeAndroidApp()
                    ? !gamingMixer.micMuted
                    : isMicrophoneEnabled
                }
                cameraOn={hostCamOn}
                screenSharing={screenSharing}
                mirrorOn={mirrorMode}
                notifyBusy={notifyBusy}
                wishlistCount={wishlist.length}
                lockActive={Boolean(lock)}
                hideScreenShare={
                  !canUseClassicScreenShare() && !showScreenShareComingSoonButton()
                }
                hideCamera={Boolean(screenSharing && isNativeAndroidApp())}
                screenToolLabel={
                  showScreenShareComingSoonButton()
                    ? 'Pantalla'
                    : isNativeAndroidApp()
                      ? 'Compartir'
                      : undefined
                }
                onInvite={() => {
                  const gate = guardEnterSalaOrBattle(screenSharing);
                  if (!gate.ok) {
                    setReelNote(gate.message);
                    return;
                  }
                  setBatallaOpen(false);
                  setSalaBoomOpen(true);
                  logSalaStart();
                }}
                onVs={() => {
                  const gate = guardEnterSalaOrBattle(screenSharing);
                  if (!gate.ok) {
                    setReelNote(gate.message);
                    return;
                  }
                  setSalaBoomOpen(false);
                  setBatallaOpen(true);
                  logBattleStart();
                }}
                onScreen={() => {
                  if (isAndroidScreenShareDisabled()) {
                    setReelNote(SCREEN_SHARE_COMING_SOON_MESSAGE);
                    return;
                  }
                  void toggleScreenCapture();
                }}
                onMic={() => void toggleMic()}
                onCamera={() => void toggleCamera()}
                onMirror={toggleMirror}
                onNotify={() => void notifyFollowers()}
                onWishlist={() => {
                  setLockPicker(false);
                  setWishlistOpen(true);
                }}
                onLock={() => {
                  openLockPicker();
                }}
                onReel={verticalHost ? undefined : () => void recordReel()}
                onWithdraw={verticalHost ? undefined : () => setWithdrawOpen(true)}
              />
            </div>
          ) : null}
          <div
            ref={stageVideoRef}
            className={`${liveStageInnerClass(aspectRatio)}${showLocalMirror ? ' lb-live-mirror-on' : ''}${canCarouselLive ? ' is-live-carousel' : ''}${liveCarouselDir === 1 ? ' is-live-slide-next' : liveCarouselDir === -1 ? ' is-live-slide-prev' : ''}`}
            onDoubleClick={canSendLiveBoom ? boomGestureProps.onDoubleClick : undefined}
            onPointerDown={handleStagePointerDown}
            onPointerMove={handleStagePointerMove}
            onPointerUp={handleStagePointerUp}
            onPointerCancel={handleStagePointerCancel}
          >
            <BoomReactionLayer bursts={boomBursts} />
            <CreatorVideo
              canPublish={canPublish}
              allowPublish={!liveEnded && !summaryOpen}
              hostUid={hostUid}
              facing={facing}
              preferredCameraId={cameraDeviceId || String(launch.cameraId || '')}
              preferredMicrophoneId={micDeviceId || String(launch.microphoneId || '')}
              preferredMicOn={
                screenSharing && isNativeAndroidApp()
                  ? shareMicrophoneEnabled
                  : launch.micOn !== false
              }
              preferredCamOn={hostCamOn}
              externalAvManaged={Boolean(screenSharing && isNativeAndroidApp())}
              cameraTrackRef={cameraTrackRef}
              frameLayout={effectiveFrameLayout}
              frameAspect={aspectRatio}
              pipVisible={effectivePipVisible}
              mirrorCamera={mirrorMode}
              pipAspectRatio={screenSharing ? pipCameraAspect : undefined}
              pipRectOptions={screenSharing ? SCREEN_SHARE_PIP_OPTS : undefined}
              salaLayout={effectiveSalaLayout}
              salaFrameAspect={aspectRatio}
              salaIsHost={isHost}
              salaLocalIdentity={firebaseUid}
              salaPinnedIdentity={effectiveSalaPin}
              salaCamOffIdentities={salaCamOffIds}
              onSalaControl={isHost ? handleSalaControl : undefined}
              onSalaLayoutChange={isHost ? applySalaLayout : undefined}
              onSalaLeaveSelf={
                !isHost && canPublish
                  ? () => setLeaveOpen(true)
                  : undefined
              }
            />
            {salaInvite && isSpectator ? (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 px-4 backdrop-blur-[2px]">
                <div className="w-full max-w-sm rounded-2xl border border-cyan-400/40 bg-zinc-950/95 p-4 text-center shadow-2xl">
                  <p className="text-sm font-bold text-white">
                    @{salaInvite.hostName} te invita a Sala 1
                  </p>
                  {salaInviteError ? (
                    <p className="mt-2 text-[11px] text-rose-300">{salaInviteError}</p>
                  ) : null}
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      disabled={salaInviteAccepting}
                      className="min-h-11 flex-1 rounded-xl bg-cyan-400 py-2.5 text-xs font-bold text-zinc-950 disabled:opacity-50"
                      onClick={() => {
                        void (async () => {
                          setSalaInviteAccepting(true);
                          setSalaInviteError(null);
                          try {
                            await onAcceptSalaInvite?.(salaInvite);
                            await publishRoomData(room, {
                              type: 'invite_response',
                              status: 'accepted',
                              inviteId: salaInvite.inviteId,
                              viewerId: firebaseUid,
                              username: handle || '',
                            }).catch(() => undefined);
                            await onJoinSala1?.();
                            setSalaInvite(null);
                          } catch (err) {
                            setSalaInviteError(
                              err instanceof Error ? err.message : 'No se pudo unir a Sala 1',
                            );
                          } finally {
                            setSalaInviteAccepting(false);
                          }
                        })();
                      }}
                    >
                      {salaInviteAccepting ? 'Conectando...' : 'Aceptar'}
                    </button>
                    <button
                      type="button"
                      disabled={salaInviteAccepting}
                      className="min-h-11 flex-1 rounded-xl bg-white/10 py-2.5 text-xs font-bold text-zinc-200 disabled:opacity-50"
                      onClick={() => {
                        void publishRoomData(room, {
                          type: 'invite_response',
                          status: 'declined',
                          inviteId: salaInvite.inviteId,
                          viewerId: firebaseUid,
                          username: handle || '',
                        }).catch(() => undefined);
                        setSalaInvite(null);
                        onDeclineSalaInvite?.(salaInvite);
                      }}
                    >
                      {t('common.reject')}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            {(battle.liveBattle || battle.resultBattle) && firebaseUid ? (
              <BattleStage
                battle={battle.liveBattle || battle.resultBattle!}
                remotes={battle.remotes}
                localVideo={battle.localVideo}
                localUid={firebaseUid}
                aspectRatio={aspectRatio}
                isHost={isHost}
                remainingMs={
                  battle.liveBattle
                    ? Math.max(0, battle.liveBattle.endsAtMs - Date.now())
                    : 0
                }
                onEnd={() => void battle.stop()}
                onRematch={() => void battle.rematch()}
                onDismissResult={() => void battle.dismissResult()}
                rematchBusy={battle.busy}
              />
            ) : null}
            {isHost &&
            gamingSpaceActive &&
            !screenSharing &&
            isNativeAndroidApp() &&
            !isAndroidScreenShareDisabled() ? (
              <div className="pointer-events-auto absolute inset-x-2 bottom-[max(5.5rem,calc(var(--lb-safe-bottom)+4.5rem))] z-[46] flex justify-center sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
                <button
                  type="button"
                  onClick={() => void toggleScreenCapture()}
                  className="inline-flex min-h-12 min-w-[min(100%,18rem)] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-5 text-sm font-black text-zinc-950 shadow-lg shadow-fuchsia-500/30"
                >
                  <Gamepad2 size={18} />
                  Presentar juego
                </button>
              </div>
            ) : null}
            {isHost &&
            gamingSpaceActive &&
            screenSharing &&
            isNativeAndroidApp() &&
            !isAndroidScreenShareDisabled() ? (
              <GamingPresentPanel
                micLevel={gamingMixer.micLevel}
                gameLevel={gamingMixer.gameLevel}
                micVolume={gamingMixer.micVolume}
                gameVolume={gamingMixer.gameVolume}
                micMuted={gamingMixer.micMuted}
                gameMuted={gamingMixer.gameMuted}
                quality={connectionQuality}
                bitrateKbps={gamingBitrateKbps}
                rttMs={gamingRttMs}
                onMicVolumeChange={(v) => {
                  setNativeMicVolume(v);
                  setGamingMixer(getNativeAudioMixerState());
                }}
                onGameVolumeChange={(v) => {
                  setNativeGameVolume(v);
                  setGamingMixer(getNativeAudioMixerState());
                }}
                onToggleMic={() => void toggleMic()}
                onToggleGame={() => {
                  toggleNativeGameAudioMuted();
                  setGamingMixer(getNativeAudioMixerState());
                }}
                onStopPresent={() => void toggleScreenCapture()}
              />
            ) : null}
            {isHost && screenSharing && !(gamingSpaceActive && isNativeAndroidApp()) ? (
              <div className="pointer-events-auto absolute inset-x-2 top-[max(3.75rem,calc(var(--lb-safe-top)+3.1rem))] z-[45] flex items-center justify-between gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-950/90 px-3 py-2 text-white shadow-lg backdrop-blur-md sm:inset-x-auto sm:left-3 sm:right-auto sm:min-w-[16rem]">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-wide text-emerald-200">
                    Transmitiendo pantalla
                  </p>
                  <p className="truncate text-[10px] text-emerald-100/80">
                    {isNativeAndroidApp()
                      ? 'Espectadores ven tu pantalla · chat flotante fuera de LiveBoom'
                      : 'Los espectadores ven tu pantalla · cámara en PiP'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {isNativeAndroidApp() ? (
                    <button
                      type="button"
                      onClick={() => setShareControlsOpen(true)}
                      className="rounded-full bg-violet-500 px-3 py-2 text-[11px] font-bold text-white"
                    >
                      Controles
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      if (isNativeAndroidApp()) setShareStopConfirmOpen(true);
                      else void toggleScreenCapture();
                    }}
                    className="rounded-full bg-red-500 px-3 py-2 text-[11px] font-bold text-white"
                  >
                    Dejar de compartir
                  </button>
                </div>
              </div>
            ) : null}
            {isHost && screenSharing && !isNativeAndroidApp() ? (
              <LiveFrameEditor
                layout={frameLayout}
                frameAspect={aspectRatio}
                visible={pipVisible}
                pipAspectRatio={pipCameraAspect}
                rectOptions={SCREEN_SHARE_PIP_OPTS}
                onLayoutChange={(layout) => publishHostFrame(layout, pipVisible)}
                onToggleVisible={() => {
                  const next = !pipVisible;
                  setPipVisible(next);
                  void publishFrameSync(room, frameLayout, next).catch(() => undefined);
                }}
                toggleLabel={{ show: 'Mostrar cámara', hide: 'Ocultar cámara' }}
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
                <p className="text-lg font-bold text-white sm:text-xl">{t('liveUi.ended')}</p>
                <p className="text-sm text-zinc-400">{t('liveUi.followFriendsLives')}</p>
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
                              <span className="ml-1 text-[10px] font-bold text-cyan-300">{t('liveUi.friend')}</span>
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
            {switchCover ? (
              <div className="pointer-events-none absolute inset-0 z-[60]">
                {switchCover.avatarUrl ? (
                  <img
                    src={switchCover.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-zinc-950" />
                )}
              </div>
            ) : null}
          </div>
          {canCarouselLive ? (
            <>
              <button
                type="button"
                className="lb-live-carousel-nav is-prev"
                data-boom-ignore
                aria-label="LIVE anterior"
                onClick={(event) => {
                  event.stopPropagation();
                  onCarouselPrev();
                }}
              >
                <ChevronLeft size={18} strokeWidth={2.4} />
              </button>
              <button
                type="button"
                className="lb-live-carousel-nav is-next"
                data-boom-ignore
                aria-label="Siguiente LIVE"
                onClick={(event) => {
                  event.stopPropagation();
                  onCarouselNext();
                }}
              >
                <ChevronRight size={18} strokeWidth={2.4} />
              </button>
            </>
          ) : null}
          {verticalHost ? <div className="lb-live-vtools-slot is-spacer" aria-hidden /> : null}
        </div>
      </div>
      <div
        data-boom-ignore
        className={
          isHost
            ? `pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-3 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4 ${verticalHost ? '' : 'lg:pb-10'}`
            : 'lb-live-viewer-overlay pointer-events-none absolute inset-x-0 top-0 z-10'
        }
      >
        {isHost ? (
          <>
          <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="live-dot inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white">
                <Radio size={11} /> EN VIVO
              </span>
              <span className="hidden tabular-nums text-xs font-semibold text-zinc-200 sm:inline">
                {formatLiveElapsed(liveStats?.startedAt, endedAtMsRef.current || undefined)}
              </span>
              <button
                type="button"
                onClick={() => setViewersOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur"
              >
                <Eye size={12} /> {formatLiveCompact(viewers)} viendo
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => {
                  const gate = guardEnterSalaOrBattle(screenSharing);
                  if (!gate.ok) {
                    setReelNote(gate.message);
                    return;
                  }
                  setSalaBoomOpen(false);
                  setBatallaOpen(true);
                  logBattleStart();
                }}
                className="hidden items-center gap-1.5 rounded-full bg-violet-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-violet-500 lg:inline-flex"
              >
                <VsBattleIcon size={18} /> Crear VS
              </button>
              <button
                type="button"
                onClick={() => void shareLive()}
                className="grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75"
                aria-label={t('actions.share')}
              >
                <Share2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => setLeaveOpen(true)}
                className="rounded-full bg-red-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-red-500"
              >
                Finalizar live
              </button>
            </div>
          </div>
          <div className="lb-live-host-info">
            <LiveGoalWishHud
              username={username}
              goal={liveGoal}
              wishlist={wishlist}
              wishQty={wishQty}
              wishReceived={wishReceived}
              achievedWish={achievedWish}
              leaving={wishAchievedLeaving}
              isHost
              celebrating={goalCelebrating}
              lock={lock}
              lockDraftIds={lockPicker || lock || privatePhase ? lockDraftIds : undefined}
              lockDraftQty={lockDraftQty}
              pendingLockReqs={pendingLockReqs}
              pendingRequests={privacyRequests}
              privatePhase={privatePhase}
              privateRequirements={privateRequirements}
              lockPulse={lockPulse}
              onLockClick={() => {
                openLockPicker();
              }}
              onRequestClick={(row) => {
                setPrivacyFocusUid(row.uid);
                setPrivacyRequestsOpen(true);
              }}
              onOverflowClick={() => {
                setPrivacyFocusUid(null);
                setPrivacyRequestsOpen(true);
              }}
              onNewGoal={() => {
                setNewCoinGoalError(null);
                setNewCoinGoalOpen(true);
              }}
              onSealPrivate={() => void sealLiveLock()}
              reopenBusy={lockBusy}
            />
          </div>
          </>
        ) : (
          <div className="lb-live-viewer-hud">
            <div className="lb-live-viewer-hud__row">
              <div className="lb-live-viewer-hud__identity">
                <span className="live-dot lb-live-viewer-hud__live">
                  <Radio size={11} /> EN VIVO
                </span>
                {roomMeta.avatarUrl ? (
                  <img
                    src={roomMeta.avatarUrl}
                    alt=""
                    className="lb-live-viewer-hud__avatar"
                  />
                ) : (
                  <span className="lb-live-viewer-hud__avatar is-fallback">
                    {(roomMeta.displayName || username).slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <Link
                    to={profileHref(username, hostUid)}
                    className="lb-live-viewer-hud__user"
                  >
                    @{username}
                  </Link>
                  <button
                    type="button"
                    onClick={() => setViewersOpen((v) => !v)}
                    className="lb-live-viewer-hud__viewers"
                  >
                    <Eye size={11} /> {formatLiveCompact(viewers)} viendo
                  </button>
                </div>
                <span className="lb-live-viewer-hud__chip is-boom">
                  <img src="/reactions/boom-on.png" alt="" draggable={false} />
                  {liveBoomCount}
                </span>
                {isSpectator ? (
                  <span className="lb-live-viewer-hud__chip">Mis {viewerBoomCount}</span>
                ) : null}
              </div>
              <div className="lb-live-viewer-hud__actions">
                <button
                  type="button"
                  onClick={() => void shareLive()}
                  className="lb-live-viewer-hud__icon"
                  aria-label={t('actions.share')}
                >
                  <Share2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setLeaveOpen(true)}
                  className="lb-live-viewer-hud__leave"
                >
                  Salir
                </button>
              </div>
            </div>
            <LiveGoalWishHud
              username={username}
              goal={liveGoal}
              wishlist={wishlist}
              wishQty={wishQty}
              wishReceived={wishReceived}
              achievedWish={achievedWish}
              leaving={wishAchievedLeaving}
              celebrating={goalCelebrating}
              lock={lock}
              pendingLockReqs={pendingLockReqs}
              privatePhase={privatePhase}
              privateRequirements={privateRequirements}
              lockPulse={lockPulse}
            />
          </div>
        )}
        {shareNote ? (
          <p className="pointer-events-none mt-2 text-[11px] font-semibold text-cyan-200">{shareNote}</p>
        ) : null}
        {connectionQuality === 'reconnecting' ? (
          <p className="pointer-events-none mt-2 text-[11px] font-semibold text-amber-200">
            Reconectando transmisión…
          </p>
        ) : null}
      </div>
      {isHost ? (
        <LiveNewCoinGoalModal
          open={newCoinGoalOpen}
          busy={newCoinGoalBusy}
          error={newCoinGoalError}
          onClose={() => {
            if (newCoinGoalBusy) return;
            setNewCoinGoalOpen(false);
            setNewCoinGoalError(null);
          }}
          onCreate={(target) => void createNextCoinGoal(target)}
        />
      ) : null}
      {wishlistOpen && isHost ? (
        <div className="pointer-events-auto absolute left-2 right-2 top-[calc(max(0.75rem,env(safe-area-inset-top))+5.5rem)] z-40 max-h-[min(48dvh,22rem)] overflow-y-auto rounded-2xl border border-cyan-400/30 bg-zinc-950/95 p-3 shadow-xl sm:left-4 sm:right-auto sm:top-[4.8rem] sm:w-[min(100%,18rem)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-300">
              Lista de deseos (máx. 5)
            </p>
            <button type="button" onClick={() => setWishlistOpen(false)} className="text-zinc-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <div className="space-y-1">
            {sortedLiveGiftCatalog().map((gift) => {
              const active = wishlist.includes(gift.id);
              const qty = active ? wishQty[gift.id] || 1 : 0;
              return (
                <div
                  key={gift.id}
                  className={`rounded-lg px-2 py-1.5 ${
                    active ? 'bg-cyan-500/20 text-cyan-100' : 'text-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void toggleWishlistGift(gift.id)}
                    className="flex w-full min-w-0 items-center justify-between gap-2 text-left text-xs"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <GiftIcon giftId={gift.id} size={16} />
                      <span className="truncate">{gift.name}</span>
                    </span>
                    <span className="shrink-0 text-cyan-400">{gift.coins}</span>
                  </button>
                  {active ? (
                    <div className="lb-live-wish-qty mt-1.5">
                      <button
                        type="button"
                        aria-label="Menos"
                        onClick={() => void setWishlistQuantity(gift.id, qty - 1)}
                      >
                        −
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={qty}
                        aria-label={`Cantidad de ${gift.name}`}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/\D/g, '').slice(0, 2);
                          if (!digits) {
                            void setWishlistQuantity(gift.id, 0);
                            return;
                          }
                          void setWishlistQuantity(gift.id, Number(digits));
                        }}
                      />
                      <button
                        type="button"
                        aria-label="Más"
                        onClick={() => void setWishlistQuantity(gift.id, qty + 1)}
                      >
                        +
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      <LivePrivacySetupSheet
        open={Boolean(lockPicker && isHost)}
        busy={lockBusy}
        draftIds={lockDraftIds}
        lockArmed={Boolean(lock) && privatePhase !== 'private'}
        privateActive={privatePhase === 'private'}
        onClose={() => setLockPicker(false)}
        onToggleGift={toggleLockDraftGift}
        onConfirm={() => void applyLockDraft()}
        onSealPrivate={() => void sealLiveLock()}
        onClearPrivate={() => void setLiveLock(null)}
      />
      <LivePrivacyRequestsSheet
        open={Boolean(isHost && privacyRequestsOpen)}
        requests={privacyRequests}
        busyUid={privacyBusyUid}
        focusUid={privacyFocusUid}
        onClose={() => {
          setPrivacyRequestsOpen(false);
          setPrivacyFocusUid(null);
        }}
        onAccept={(uid) => void acceptPrivacyRequest(uid)}
        onReject={(uid) => void rejectPrivacyRequest(uid)}
      />
      <SalaBoomModal
        open={isHost && salaBoomOpen}
        onClose={() => setSalaBoomOpen(false)}
        onInvite={(viewer) => void inviteGuest(viewer)}
        viewersList={viewersList}
        layout={salaLayout}
        onLayoutChange={applySalaLayout}
        inviteStatus={salaInviteStatus}
        inviteBusy={salaInviteBusy}
      />
      {screenShareWizardOpen ? (
        <LiveScreenShareWizard
          open={screenShareWizardOpen}
          onCancel={() => finishScreenShareWizard(null)}
          onConfirm={(result) => finishScreenShareWizard(result)}
        />
      ) : null}
      {shareStopConfirmOpen ? (
        <div className="pointer-events-auto absolute inset-0 z-[80] flex items-center justify-center bg-black/60 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl border border-white/15 bg-zinc-950 p-4 shadow-2xl"
          >
            <h2 className="text-base font-bold text-white">Presentación en vivo</h2>
            <p className="mt-2 text-sm text-zinc-400">¿Qué deseas hacer?</p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                className="min-h-11 rounded-xl bg-white/10 px-4 text-sm font-semibold text-white"
                onClick={() => setShareStopConfirmOpen(false)}
              >
                Seguir compartiendo
              </button>
              <button
                type="button"
                className="min-h-11 rounded-xl bg-rose-500 px-4 text-sm font-bold text-white"
                onClick={() => {
                  setShareStopConfirmOpen(false);
                  void stopScreenCapture().then(() => {
                    setReelNote(null);
                    setShareControlsOpen(false);
                    setShareStoppedAckOpen(true);
                  });
                }}
              >
                Dejar de compartir pantalla
              </button>
              <button
                type="button"
                className="min-h-11 rounded-xl px-4 text-sm font-semibold text-zinc-400"
                onClick={() => setShareStopConfirmOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {shareStoppedAckOpen ? (
        <div className="pointer-events-auto absolute inset-0 z-[80] flex items-center justify-center bg-black/60 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl border border-emerald-400/30 bg-zinc-950 p-4 text-center shadow-2xl"
          >
            <p className="text-lg font-bold text-white">Dejaste de compartir la pantalla</p>
            <p className="mt-2 text-sm text-zinc-400">
              Tu transmisión en vivo continúa normalmente.
            </p>
            <button
              type="button"
              className="mt-4 min-h-11 w-full rounded-xl bg-violet-500 px-4 text-sm font-bold text-white"
              onClick={() => setShareStoppedAckOpen(false)}
            >
              Entendido
            </button>
          </div>
        </div>
      ) : null}
      {shareControlsOpen && screenSharing && isNativeAndroidApp() ? (
        <LiveScreenShareControlsSheet
          open={shareControlsOpen}
          microphoneEnabled={shareMicrophoneEnabled}
          deviceAudioEnabled={shareDeviceAudioEnabled}
          floatingChatEnabled={floatingChatEnabled}
          qualityLabel="720p"
          onClose={() => setShareControlsOpen(false)}
          onToggleMic={() => {
            const next = !shareMicrophoneEnabled;
            setShareMicrophoneEnabled(next);
            shareMicrophoneEnabledRef.current = next;
            setNativeMicMuted(!next);
            void (async () => {
              const track = nativeMicLiveTrackRef.current;
              if (track) {
                if (next) await track.unmute().catch(() => undefined);
                else await track.mute().catch(() => undefined);
                return;
              }
              void toggleMic();
            })();
          }}
          onToggleDeviceAudio={() => {
            const next = !shareDeviceAudioEnabled;
            setShareDeviceAudioEnabled(next);
            setNativeGameAudioMuted(!next);
            void (async () => {
              const track = screenAudioLiveTrackRef.current;
              if (track) {
                if (next) await track.unmute().catch(() => undefined);
                else await track.mute().catch(() => undefined);
              }
              setGamingMixer(getNativeAudioMixerState());
            })();
          }}
          onToggleChat={() => {
            setFloatingChatEnabled((v) => {
              const next = !v;
              try {
                sessionStorage.setItem('liveboom.ss.floatingChat', next ? '1' : '0');
              } catch {
                /* ignore */
              }
              void setNativePresentationOverlaysVisible(next);
              return next;
            });
          }}
          onStopShare={() => {
            setShareControlsOpen(false);
            setShareStopConfirmOpen(true);
          }}
        />
      ) : null}
      <BatallaBoomModal
        open={isHost && batallaOpen}
        onClose={() => setBatallaOpen(false)}
        inviteHandle={inviteHandle}
        onInviteHandleChange={setInviteHandle}
        onInvite={(handle) => void battle.invite(handle || inviteHandle)}
        liveHosts={liveHosts}
        durationMs={battle.durationMs}
        onDurationMsChange={battle.setDurationMs}
        incoming={battle.incoming}
        waitingName={
          battle.battle?.status === 'pending' && roomKey(battle.battle.hostAUsername) === roomKey(username)
            ? battle.battle.hostBUsername
            : null
        }
        busy={battle.busy}
        note={battle.note}
        onAccept={() => {
          void battle.accept();
          setBatallaOpen(false);
        }}
        onDecline={() => {
          void battle.decline();
          setBatallaOpen(false);
        }}
      />
      {liveStatusNote && liveStatusNoteVisible && isHost ? (
        <p className="pointer-events-none absolute left-3 right-3 top-[8.5rem] z-10 text-[11px] text-cyan-200 max-lg:top-[calc(max(0.75rem,env(safe-area-inset-top))+6.5rem)] sm:left-4 sm:max-w-md">
          {liveStatusNote}
        </p>
      ) : null}
      {withdrawOpen ? (
        <WithdrawModal
          initialCoins={liveStats?.coinsEarned || 0}
          onClose={() => setWithdrawOpen(false)}
        />
      ) : null}
      {canPublish && !isHost ? (
        <div
          className={`pointer-events-auto absolute right-3 z-30 flex flex-col gap-2 lg:hidden ${liveHostControlsBottomClass(liveViewport)}`}
        >
          {canPublish ? (
          <>
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
          </>
          ) : null}
          <button
            type="button"
            onClick={toggleMirror}
            className={`grid h-12 w-12 place-items-center rounded-full shadow-lg backdrop-blur ring-1 ${
              mirrorMode
                ? 'bg-cyan-500/40 text-white ring-cyan-400/50'
                : 'bg-black/60 text-white ring-white/20'
            }`}
            aria-label={mirrorMode ? 'Desactivar modo espejo' : 'Activar modo espejo'}
            title={screenSharing ? 'Espejo en cámara PiP' : 'Modo espejo'}
          >
            <FlipHorizontal size={20} />
          </button>
          {canUseClassicScreenShare() || showScreenShareComingSoonButton() ? (
            <button
              type="button"
              onClick={() => {
                if (isAndroidScreenShareDisabled()) {
                  setReelNote(SCREEN_SHARE_COMING_SOON_MESSAGE);
                  return;
                }
                void toggleScreenCapture();
              }}
              className={`grid h-12 w-12 place-items-center rounded-full shadow-lg backdrop-blur ring-1 ${
                screenSharing
                  ? 'bg-emerald-500/40 text-white ring-emerald-400/50'
                  : showScreenShareComingSoonButton()
                    ? 'bg-black/45 text-white/70 ring-white/15'
                    : 'bg-black/60 text-white ring-white/20'
              }`}
              aria-label={
                showScreenShareComingSoonButton()
                  ? SCREEN_SHARE_COMING_SOON_MESSAGE
                  : screenSharing
                    ? 'Detener pantalla compartida'
                    : 'Compartir pantalla'
              }
              title={
                showScreenShareComingSoonButton()
                  ? SCREEN_SHARE_COMING_SOON_MESSAGE
                  : screenSharing
                    ? 'Detener pantalla'
                    : 'Compartir pantalla'
              }
            >
              <MonitorUp size={20} />
            </button>
          ) : null}
        </div>
      ) : null}
      {viewersOpen ? (
        <div className="pointer-events-auto absolute left-2 right-2 top-[4.8rem] z-30 max-h-[min(48dvh,22rem)] overflow-hidden rounded-2xl border border-white/15 bg-zinc-950/95 p-3 shadow-xl sm:left-auto sm:right-4 sm:w-[min(100%,18.5rem)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-cyan-300">
              <Users size={12} />
              Espectadores
            </p>
            <button type="button" onClick={() => setViewersOpen(false)} className="grid h-11 w-11 place-items-center text-zinc-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <ul className="max-h-[40dvh] space-y-1 overflow-y-auto">
            {viewersList.length === 0 ? (
              <li className="text-xs text-zinc-500">Nadie en la sala aún.</li>
            ) : (
              viewersList.map((person) => (
                <LiveViewerListRow
                  key={person.identity}
                  uid={person.identity}
                  username={person.username || person.name || person.identity}
                  displayName={person.name}
                  canKick={isHost}
                  kicking={kickBusyId === person.identity}
                  onKick={() => void kickLiveViewer(person)}
                />
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
      {leaveOpen && isHost ? (
        <EndLiveModal
          open={leaveOpen}
          busy={leaving}
          error={endLiveError}
          onCancel={() => {
            if (leaving) return;
            setEndLiveError(null);
            setLeaveOpen(false);
          }}
          onConfirm={() => void confirmLeave()}
        />
      ) : null}
      {leaveOpen && !isHost ? (
        <div className="pointer-events-auto absolute inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-zinc-950 p-5 shadow-xl">
            <p className="text-base font-bold text-white">¿Salir del LIVE?</p>
            <p className="mt-2 text-sm text-zinc-400">
              Sales por completo. Puedes seguir en la app o transmitir el tuyo.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={leaving}
                onClick={() => void confirmLeave('/')}
                className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 py-2.5 text-sm font-bold text-zinc-950 disabled:opacity-60"
              >
                {leaving ? 'Saliendo…' : 'Ir al inicio'}
              </button>
              <button
                type="button"
                disabled={leaving}
                onClick={() => void confirmLeave('/transmitir')}
                className="rounded-xl border border-cyan-400/40 py-2.5 text-sm font-semibold text-cyan-200 disabled:opacity-60"
              >
                Transmitir el mío
              </button>
              <button
                type="button"
                disabled={leaving}
                onClick={() => setLeaveOpen(false)}
                className="rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/5 disabled:opacity-60"
              >
                Cancelar
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
                    const origin =
                      Date.parse(liveStats?.startedAt || '') || liveStartedAt.current || 0;
                    const endAt = endedAtMsRef.current || Date.now();
                    const ms = origin > 0 ? Math.max(0, endAt - origin) : 0;
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
      </div>
      {isHost ? (
        <HostLiveFooterBar
          stats={{
            startedAt: liveStats?.startedAt,
            endedAtMs: endedAtMsRef.current || undefined,
            viewers,
            likes: liveBoomCount,
            giftsCount,
            coinsEarned: liveStats?.coinsEarned || 0,
            goalCoins: liveStats?.goalCoins || goalCoins || 20,
            goalLabel: liveStats?.goalLabel || goalLabel,
            topGifters: liveStats?.topGifters || [],
          }}
          hostUid={firebaseUid || hostUid}
          hostUsername={username}
          hostAvatarUrl={hostAvatarUrl || roomMeta.avatarUrl}
          onCrearVs={() => {
            const gate = guardEnterSalaOrBattle(screenSharing);
            if (!gate.ok) {
              setReelNote(gate.message);
              return;
            }
            setSalaBoomOpen(false);
            setBatallaOpen(true);
            logBattleStart();
          }}
        />
      ) : (
        <ViewerLiveInfoBar
          username={username}
          displayName={roomMeta.displayName}
          avatarUrl={roomMeta.avatarUrl}
          title={roomMeta.title}
          subtitle="¡Únete al chat y envía regalos!"
          category={roomMeta.category}
          following={followingHost}
          followBusy={followBusy}
          isSelf={Boolean(firebaseUid && hostUid && firebaseUid === hostUid)}
          coins={walletCoins}
          onFollow={() => {
            const me = useAuthStore.getState().profile;
            if (!me?.firebaseUid || !hostUid) return;
            setFollowBusy(true);
            void (async () => {
              try {
                if (followingHost) {
                  await unfollowUser(me.firebaseUid, username, hostUid);
                  setFollowingHost(false);
                } else {
                  await followUser(me, username, hostUid, {
                    displayName: roomMeta.displayName,
                    avatarUrl: roomMeta.avatarUrl,
                  });
                  setFollowingHost(true);
                }
              } catch {
                // ignore
              } finally {
                setFollowBusy(false);
              }
            })();
          }}
          onGift={() => window.dispatchEvent(new CustomEvent('liveboom:open-gifts'))}
          onRecharge={() => window.dispatchEvent(new CustomEvent('liveboom:open-recharge'))}
        />
      )}
    </div>
  );
}

function waitConnected(room: ReturnType<typeof useRoomContext>, ms = 20000) {
  return waitRoomConnected(room, { timeoutMs: ms });
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
  allowPublish = true,
  hostUid,
  facing,
  preferredCameraId,
  preferredMicrophoneId,
  preferredMicOn = true,
  preferredCamOn = true,
  externalAvManaged = false,
  cameraTrackRef,
  frameLayout,
  frameAspect,
  pipVisible = true,
  mirrorCamera = false,
  pipAspectRatio,
  pipRectOptions,
  salaLayout = 'grid',
  salaFrameAspect = '9:16',
  salaIsHost = false,
  salaLocalIdentity,
  salaPinnedIdentity,
  salaCamOffIdentities = [],
  onSalaControl,
  onSalaLeaveSelf,
  onSalaLayoutChange,
}: {
  canPublish: boolean;
  allowPublish?: boolean;
  hostUid?: string;
  facing: 'user' | 'environment';
  preferredCameraId?: string;
  preferredMicrophoneId?: string;
  preferredMicOn?: boolean;
  preferredCamOn?: boolean;
  /** Android screen-share: A/V lo gestiona el FGS nativo; no tocar setCamera/Mic. */
  externalAvManaged?: boolean;
  cameraTrackRef: React.MutableRefObject<LocalVideoTrack | null>;
  frameLayout: LiveFrameLayout;
  frameAspect: LiveAspectRatio;
  pipVisible?: boolean;
  mirrorCamera?: boolean;
  pipAspectRatio?: number;
  pipRectOptions?: import('../lib/liveScreenComposer').PipRectOptions;
  salaLayout?: SalaBoomLayout;
  salaFrameAspect?: LiveAspectRatio;
  salaIsHost?: boolean;
  salaLocalIdentity?: string;
  salaPinnedIdentity?: string | null;
  salaCamOffIdentities?: string[];
  onSalaControl?: (action: SalaCameraAction, identity: string) => void;
  onSalaLeaveSelf?: () => void;
  onSalaLayoutChange?: (layout: SalaBoomLayout) => void;
}) {
  const room = useRoomContext();
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);
  const [camError, setCamError] = useState<string | null>(null);
  const [camBusy, setCamBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [trackEpoch, setTrackEpoch] = useState(0);
  const preferredCameraIdRef = useRef(preferredCameraId);
  const preferredMicrophoneIdRef = useRef(preferredMicrophoneId);
  const preferredMicOnRef = useRef(preferredMicOn);
  const preferredCamOnRef = useRef(preferredCamOn);
  const externalAvManagedRef = useRef(externalAvManaged);
  preferredCameraIdRef.current = preferredCameraId;
  preferredMicrophoneIdRef.current = preferredMicrophoneId;
  preferredMicOnRef.current = preferredMicOn;
  preferredCamOnRef.current = preferredCamOn;
  externalAvManagedRef.current = externalAvManaged;

  const targetIdentity = canPublish
    ? room.localParticipant.identity
    : hostUid || room.remoteParticipants.values().next().value?.identity;

  const pickParticipantTracks = (identity: string | undefined) => {
    if (!identity) return { camera: null as TrackReference | null, screen: null as TrackReference | null };
    const mine = tracks.filter(
      (track): track is TrackReference =>
        Boolean(track.publication) && track.participant.identity === identity,
    );
    const cameraRef = mine.find((track) => track.publication?.source === Track.Source.Camera);
    const screenRef = mine.find((track) => track.publication?.source === Track.Source.ScreenShare);
    return {
      camera: cameraRef?.publication ? cameraRef : null,
      screen: screenRef && trackIsRenderable(screenRef) ? screenRef : null,
    };
  };

  /** Identidad del anfitrión de la sala (no del co-host local). */
  const roomHostIdentity =
    hostUid ||
    (salaIsHost ? room.localParticipant.identity : undefined) ||
    (!canPublish ? targetIdentity : undefined);

  const hostTracks = pickParticipantTracks(roomHostIdentity || targetIdentity);
  const screenOwnerUid = roomHostIdentity || hostUid || undefined;
  // Participante técnico screen:<ownerUid>[:session] — no matching exacto de identity.
  const techScreenRef = (() => {
    if (!screenOwnerUid) return null;
    const hit = tracks.find((track): track is TrackReference => {
      if (!track.publication || track.publication.source !== Track.Source.ScreenShare) return false;
      return isScreenShareForOwner(track.participant.identity, screenOwnerUid);
    });
    return hit && trackIsRenderable(hit) ? hit : null;
  })();
  const localTracksPick = pickParticipantTracks(room.localParticipant.identity);
  // Host Android en app durante share: solo su cámara (espectadores siguen viendo pantalla).
  const hostSelfCameraOnly = Boolean(canPublish && externalAvManaged);
  const resolvedScreen =
    techScreenRef ||
    (hostTracks.screen && trackIsRenderable(hostTracks.screen) ? hostTracks.screen : null);
  const mainIsScreen = Boolean(resolvedScreen) && !hostSelfCameraOnly;
  const main = hostSelfCameraOnly ? null : resolvedScreen;
  const framedCamera = hostTracks.camera || (salaIsHost ? localTracksPick.camera : null);
  // Spec: NUNCA cámara PiP sobre el juego / pantalla compartida.
  const showFramedCamera = Boolean(framedCamera && !mainIsScreen);
  const framedPipAspect =
    mainIsScreen && framedCamera
      ? readCameraTrackAspect(
          framedCamera.publication?.track &&
            'mediaStreamTrack' in framedCamera.publication.track
            ? framedCamera.publication.track.mediaStreamTrack
            : null,
          pipAspectRatio ?? frameAspectRatio(frameAspect),
        )
      : pipAspectRatio;
  const framedRectOptions = mainIsScreen ? pipRectOptions : undefined;

  const hostIdentityKey = roomHostIdentity || hostTracks.camera?.participant.identity || '';
  const localCamOff = Boolean(
    salaLocalIdentity && salaCamOffIdentities.includes(salaLocalIdentity),
  );
  // Incluye cámaras muteadas: host apagó cam → tile con perfil + audio.
  const guestCameras = tracks
    .filter((track): track is TrackReference => Boolean(track.publication))
    .filter((track) => track.publication?.source === Track.Source.Camera)
    .filter((track) => track.participant.identity !== hostIdentityKey)
    .filter((track) => !isScreenShareIdentity(track.participant.identity))
    .filter((track) => {
      if (trackIsRenderable(track)) return true;
      return salaCamOffIdentities.includes(track.participant.identity);
    });

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
  if (!mainIsScreen && framedCamera && trackIsRenderable(framedCamera)) {
    lastMainRef.current = { room: room.name, track: framedCamera };
  }
  const cached =
    lastMainRef.current.room === room.name ? lastMainRef.current.track : null;
  const shownScreen = mainIsScreen && main && trackIsRenderable(main) ? main : null;
  const renderableCamera =
    framedCamera && trackIsRenderable(framedCamera)
      ? framedCamera
      : !mainIsScreen && cached && trackIsRenderable(cached)
        ? cached
        : null;
  const shownCamera = renderableCamera || (!shownScreen && framedCamera ? framedCamera : null);

  useEffect(() => {
    let timer = 0;
    let first = true;
    const bump = () => {
      window.clearTimeout(timer);
      const delay = canPublish ? 80 : first ? 0 : 48;
      first = false;
      timer = window.setTimeout(() => setTrackEpoch((value) => value + 1), delay);
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

  useEffect(() => watchSpectatorLiveQuality(room, !canPublish), [room, canPublish]);

  useEffect(() => {
    if (!canPublish || !allowPublish) return;
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
        if (!canPublish || !allowPublish) return;
        if (room.localParticipant.permissions?.canPublish === false) return;

    // Screen Share Android: NO pedir CAMERA/mic general; AV lo gestiona el módulo Screen Share.
        if (externalAvManagedRef.current) {
          return;
        }

        try {
          await ensureNativeLiveAvPermissions();
        } catch (permErr) {
          if (!cancelled) {
            setCamError(
              permErr instanceof Error
                ? permErr.message
                : 'Activa cámara y micrófono en los permisos de LiveBoom.',
            );
          }
          return;
        }
        if (cancelled) return;

        if (localCamOff || preferredCamOnRef.current === false) {
          discardLiveCameraHandoff();
          await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
          // Respetar mic del host/invitado: no forzar ON solo porque la cámara esté apagada.
          if (preferredMicOnRef.current !== false) {
            if (!room.localParticipant.isMicrophoneEnabled) {
              await room.localParticipant.setMicrophoneEnabled(
                true,
                preferredMicrophoneIdRef.current
                  ? { deviceId: preferredMicrophoneIdRef.current }
                  : undefined,
              ).catch(() => undefined);
            }
          } else if (room.localParticipant.isMicrophoneEnabled) {
            await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
          }
          await attachCameraRef();
          return;
        }

        const alreadyOn = room.localParticipant.isCameraEnabled;
        if (alreadyOn && retry === 0) {
          discardLiveCameraHandoff();
          if (preferredMicOnRef.current && !room.localParticipant.isMicrophoneEnabled) {
            await room.localParticipant.setMicrophoneEnabled(true, preferredMicrophoneIdRef.current
              ? { deviceId: preferredMicrophoneIdRef.current }
              : undefined);
          }
          if (!preferredMicOnRef.current && room.localParticipant.isMicrophoneEnabled) {
            await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
          }
          await attachCameraRef();
          return;
        }

        setCamBusy(true);
        setCamError(null);

        const handoff = takeLiveCameraHandoff();
        if (handoff?.video) {
          try {
            const existingCam = Array.from(room.localParticipant.videoTrackPublications.values()).find(
              (item) => item.source === Track.Source.Camera,
            );
            if (existingCam?.track) {
              await room.localParticipant.unpublishTrack(existingCam.track, true).catch(() => undefined);
            }
            const localVideo = new LocalVideoTrack(handoff.video);
            cameraTrackRef.current = localVideo;
            await room.localParticipant.publishTrack(localVideo, {
              source: Track.Source.Camera,
              name: 'camera',
            });

            const micId = preferredMicrophoneIdRef.current || handoff.microphoneId;
            if (preferredMicOnRef.current !== false) {
              if (handoff.audio) {
                const existingMic = Array.from(
                  room.localParticipant.audioTrackPublications.values(),
                ).find((item) => item.source === Track.Source.Microphone);
                if (existingMic?.track) {
                  await room.localParticipant
                    .unpublishTrack(existingMic.track, true)
                    .catch(() => undefined);
                }
                const localAudio = new LocalAudioTrack(handoff.audio);
                await room.localParticipant.publishTrack(localAudio, {
                  source: Track.Source.Microphone,
                  name: 'microphone',
                });
              } else {
                await room.localParticipant.setMicrophoneEnabled(
                  true,
                  micId ? { deviceId: micId } : undefined,
                );
              }
            } else {
              handoff.audio?.stop();
              if (room.localParticipant.isMicrophoneEnabled) {
                await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
              }
            }

            await attachCameraRef();
            if (!cancelled) setCamError(null);
            return;
          } catch (handoffErr) {
            console.warn('[live] camera handoff failed, falling back', handoffErr);
            try {
              handoff.video.stop();
            } catch {
              /* ignore */
            }
            try {
              handoff.audio?.stop();
            } catch {
              /* ignore */
            }
          }
        } else if (handoff?.audio) {
          try {
            handoff.audio.stop();
          } catch {
            /* ignore */
          }
        }

        const cameraId = preferredCameraIdRef.current;
        try {
          await room.localParticipant.setCameraEnabled(
            true,
            cameraId ? { deviceId: cameraId } : { facingMode: facing },
          );
        } catch (camErr) {
          console.warn('[live] camera with preferred device failed, retry default', camErr);
          await room.localParticipant.setCameraEnabled(true, { facingMode: facing });
        }
        const micId = preferredMicrophoneIdRef.current;
        try {
          await room.localParticipant.setMicrophoneEnabled(
            preferredMicOnRef.current !== false,
            micId ? { deviceId: micId } : undefined,
          );
        } catch (micErr) {
          console.warn('[live] mic with preferred device failed, retry default', micErr);
          await room.localParticipant.setMicrophoneEnabled(preferredMicOnRef.current !== false);
        }
        await attachCameraRef();
        if (preferredMicOnRef.current !== false && !room.localParticipant.isMicrophoneEnabled) {
          await room.localParticipant.setMicrophoneEnabled(true);
        }
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
  }, [canPublish, allowPublish, retry, room, cameraTrackRef, facing, localCamOff, preferredCamOn, externalAvManaged]);

  if (!shownScreen && !shownCamera) {
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
      {shownScreen ? (
        <ScreenShareContainer
          key={`${trackRenderKey(shownScreen)}-${trackEpoch}`}
          screenTrack={shownScreen}
        />
      ) : null}
      {/* WEB PiP cámara sobre pantalla — nunca en Android Screen Share (showFramedCamera=false). */}
      {showFramedCamera && shownCamera && shownScreen ? (
        <LiveFramedVideo
          trackRef={shownCamera}
          layout={frameLayout}
          frameAspect={frameAspect}
          visible={pipVisible}
          mirrored={mirrorCamera}
          pipAspectRatio={framedPipAspect}
          rectOptions={framedRectOptions}
        />
      ) : null}
      {/* Sala Boom: solo cuando NO hay Screen Share. */}
      {shownCamera && !shownScreen ? (
        <SalaBoomStage
          hostRef={shownCamera}
          guests={guestCameras}
          layout={salaLayout}
          frameAspect={salaFrameAspect}
          mirrorHost={mirrorCamera}
          isHost={salaIsHost}
          localIdentity={salaLocalIdentity}
          pinnedIdentity={salaPinnedIdentity}
          camOffIdentities={salaCamOffIdentities}
          onControl={onSalaControl}
          onLeaveSelf={onSalaLeaveSelf}
          onLayoutChange={onSalaLayoutChange}
        />
      ) : null}
      {/* Invitados flotantes sobre Screen Share: desactivado (modo exclusivo). */}
      {null}
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
  uiRole = 'viewer',
  onAcceptInvite,
  onDeclineInvite,
}: {
  roomName: string;
  canPublish: boolean;
  isHostRoom?: boolean;
  uiRole?: 'host' | 'viewer';
  onAcceptInvite?: () => void;
  onDeclineInvite?: () => void;
}) {
  const t = useT();
  const room = useRoomContext();
  const profile = useAuthStore((state) => state.profile);
  const coins = profile?.coinsBalance ?? 0;
  const setCoins = useAuthStore((state) => state.setCoins);
  const [messages, setMessages] = useState<ChatMessage[]>(() => liveChatCache.get(roomName) ?? []);
  const [text, setText] = useState('');
  const [openGifts, setOpenGifts] = useState(false);
  const [sideTab, setSideTab] = useState<'chat' | 'gifts'>('chat');
  const [pendingGiftId, setPendingGiftId] = useState<string | null>(null);
  const [giftMultiplier, setGiftMultiplier] = useState<1 | 2 | 4 | 8>(1);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [sendingGift, setSendingGift] = useState<string | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeNeeded, setRechargeNeeded] = useState<number | null>(null);
  const [inviteBanner, setInviteBanner] = useState<string | null>(null);
  const [pinnedBottom, setPinnedBottom] = useState(true);
  const [chatHidden, setChatHidden] = useState(() => !isHostRoom && !canPublish);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seen = useRef(new Set<string>((liveChatCache.get(roomName) ?? []).map((msg) => msg.id)));
  const levelXpRef = useRef(0);
  const giftCatalog = useMemo(() => sortedLiveGiftCatalog(), []);
  const popularGifts = useMemo(() => giftCatalog.slice(0, 8), [giftCatalog]);
  const [accessHoldGiftId, setAccessHoldGiftId] = useState<string | null>(null);

  useEffect(() => {
    return listenPrivateSchedule(roomName, (schedule) => {
      const id =
        schedule.privateRequirements?.[0]?.giftId ||
        schedule.privatePendingRequirements?.[0]?.giftId ||
        null;
      setAccessHoldGiftId(schedule.privatePhase === 'collecting' && id ? id : null);
    });
  }, [roomName]);

  useEffect(() => {
    const openGiftsEv = () => {
      setChatHidden(false);
      setOpenGifts(true);
      setSideTab('gifts');
    };
    const openRechargeEv = () => setRechargeOpen(true);
    window.addEventListener('liveboom:open-gifts', openGiftsEv);
    window.addEventListener('liveboom:open-recharge', openRechargeEv);
    return () => {
      window.removeEventListener('liveboom:open-gifts', openGiftsEv);
      window.removeEventListener('liveboom:open-recharge', openRechargeEv);
    };
  }, []);

  useEffect(() => {
    if (!profile?.firebaseUid) return;
    seedLiveChatAuthorProfile(profile.firebaseUid, {
      avatarUrl: profile.avatarUrl,
      levelXp: profile.levelXp ?? 0,
    });
    void fetchLevelXp(profile.firebaseUid).then((xp) => {
      levelXpRef.current = xp;
      seedLiveChatAuthorProfile(profile.firebaseUid, { levelXp: xp, avatarUrl: profile.avatarUrl });
    });
  }, [profile?.firebaseUid, profile?.avatarUrl, profile?.levelXp]);

  function rememberMessages(next: ChatMessage[]) {
    liveChatCache.set(roomName, next);
    prefetchLiveChatAuthorProfiles(next.map((msg) => msg.authorUid));
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
        sourceLang: msg.sourceLang || undefined,
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
        sourceLang?: string;
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
              sourceLang: msg.sourceLang,
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
        authorUid: gift.senderUid || undefined,
        text: `envió ${gift.giftName}`,
        gift: { giftId: gift.giftId, emoji: gift.emoji, name: gift.giftName },
      });
      window.dispatchEvent(
        new CustomEvent('liveboom:gift', {
          detail: { id: gift.id, giftId: gift.giftId, senderName: gift.senderName, multiplier: gift.multiplier },
        }),
      );
    });
  }, [roomName]);

  useEffect(() => {
    const onData = (payload: Uint8Array) => {
      const data = parseRoomData(payload);
      if (!data) return;
      if (data.type === 'chat') {
        pushMessage({
          id: data.id,
          author: data.author,
          authorUid: data.authorUid,
          text: data.text,
          sourceLang: data.sourceLang,
        });
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
        return;
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, profile?.handle]);

  // Mientras se comparte pantalla: chat nativo event-driven (sin polling).
  useEffect(() => {
    if (!isHostRoom || !isNativeAndroidApp()) return;
    if (!isScreenShareLiveGuardActive()) return;
    try {
      if (sessionStorage.getItem('liveboom.ss.floatingChat') === '0') {
        void updateScreenShareChatHud([]);
        return;
      }
    } catch {
      /* ignore */
    }
    const lines = messages.slice(-5).map((m) => {
      const who = String(m.author || '').slice(0, 14);
      const body = String(m.text || '').slice(0, 80);
      return `@${who}: ${body}`;
    });
    pushScreenShareChatLinesIfChanged(lines);
  }, [messages, isHostRoom]);

  // Al salir al juego el overlay se muestra: forzar sync de la ventana de mensajes.
  useEffect(() => {
    if (!isHostRoom || !isNativeAndroidApp()) return;
    let unbind: (() => void) | undefined;
    let cancelled = false;
    void bindScreenShareOverlaysVisible((visible) => {
      if (!visible || !isScreenShareLiveGuardActive()) return;
      try {
        if (sessionStorage.getItem('liveboom.ss.floatingChat') === '0') return;
      } catch {
        /* ignore */
      }
      forcePushScreenShareChatLines(screenShareChatLinesFromCache(roomName));
    }).then((fn) => {
      if (cancelled) {
        void fn();
        return;
      }
      unbind = fn;
    });
    return () => {
      cancelled = true;
      unbind?.();
    };
  }, [isHostRoom, roomName]);

  useEffect(() => {
    if (!isHostRoom || !isNativeAndroidApp()) return;
    let unbind: (() => void) | undefined;
    let cancelled = false;
    void bindScreenShareChatSend((incoming) => {
      const value = incoming.trim();
      if (!value || !profile) return;
      const author = profile.displayName || profile.handle || 'Liveboomer';
      const message: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        author,
        authorUid: profile.firebaseUid,
        text: value,
        sourceLang: getLocale(),
      };
      pushMessage(message);
      persistChatCopy(message);
      void publishLiveChatMessage(roomName, {
        clientId: message.id,
        authorUid: profile.firebaseUid,
        author,
        text: value,
        sourceLang: message.sourceLang,
      }).catch(() => undefined);
      void publishRoomData(room, { type: 'chat', ...message }).catch(() => undefined);
    }).then((fn) => {
      if (cancelled) {
        void fn();
        return;
      }
      unbind = fn;
    });
    return () => {
      cancelled = true;
      unbind?.();
    };
  }, [isHostRoom, room, roomName, profile]);

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
      sourceLang: getLocale(),
    };
    pushMessage(message);
    setText('');
    persistChatCopy(message);
    void publishLiveChatMessage(roomName, {
      clientId: message.id,
      authorUid: profile.firebaseUid,
      author,
      text: value,
      sourceLang: message.sourceLang,
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

    if (accessHoldGiftId && catalog.id === accessHoldGiftId) {
      setGiftError(null);
      setRechargeNeeded(null);
      setSendingGift(giftId);
      setPendingGiftId(null);
      setOpenGifts(false);
      setGiftMultiplier(1);
      const previousCoins = coins;
      const clientId = `hold-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        const result = await api<{
          pending?: boolean;
          unlocked?: boolean;
          duplicate?: boolean;
          requestStatus?: string;
          senderBalance?: number;
        }>('/api/stream/unlock', {
          method: 'POST',
          body: JSON.stringify({
            roomName,
            handle: profile.handle,
            giftId: catalog.id,
            clientId,
            currentBalance: previousCoins,
            username: profile.handle,
          }),
        });
        if (typeof result.senderBalance === 'number') {
          setCoins(result.senderBalance);
          void setFirestoreCoins(profile.firebaseUid, result.senderBalance).catch(() => undefined);
        }
        if (result.unlocked || result.requestStatus === 'approved') {
          setGiftError(null);
          return;
        }
        setGiftError(
          result.duplicate
            ? 'Solicitud pendiente. El creador te avisará.'
            : 'Regalo en reserva. El creador acepta o rechaza.',
        );
      } catch (err) {
        setCoins(previousCoins);
        setGiftError(err instanceof Error ? err.message : 'No se pudo reservar el regalo');
        setOpenGifts(true);
      } finally {
        setSendingGift(null);
      }
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
          seedLiveChatAuthorProfile(profile.firebaseUid, {
            avatarUrl: profile.avatarUrl,
            levelXp: xp,
          });
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
              Aceptar
            </button>
            <button
              type="button"
              onClick={() => {
                onDeclineInvite?.();
                setInviteBanner(null);
              }}
              className="ml-1 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-200"
            >
              {t('common.reject')}
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
            <MessageCircle size={14} /> {t('actions.commentLive')}
          </button>
          <button
            type="button"
            onClick={() => {
              setChatHidden(false);
              setOpenGifts(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-3 py-2 text-xs font-bold text-zinc-950"
          >
            <Gift size={14} /> {t('actions.gifts')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <aside
      data-boom-ignore
      className={`lb-live-chat-float z-20 flex min-h-0 min-w-0 flex-col overflow-visible border-white/10 lg:overflow-hidden lg:static lg:h-full lg:min-h-0 lg:max-h-full lg:w-[28%] lg:min-w-[260px] lg:max-w-[340px] lg:rounded-2xl lg:border lg:bg-zinc-950/90 lg:backdrop-blur-md ${
        canPublish || uiRole === 'host' ? 'lb-live-chat-float--host' : ''
      } pointer-events-none absolute inset-x-0 bottom-0 border-0 bg-transparent lg:pointer-events-auto lg:relative lg:inset-auto`}
    >
      <div className="pointer-events-auto hidden shrink-0 border-b border-white/10 px-3 py-2.5 lg:block">
        {uiRole === 'host' ? (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                setSideTab('chat');
                setOpenGifts(false);
              }}
              className={`pb-1 text-sm font-bold ${
                sideTab === 'chat' ? 'border-b-2 border-violet-500 text-white' : 'text-zinc-500'
              }`}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => {
                setSideTab('gifts');
                setOpenGifts(true);
              }}
              className={`pb-1 text-sm font-bold ${
                sideTab === 'gifts' ? 'border-b-2 border-violet-500 text-white' : 'text-zinc-500'
              }`}
            >
              Regalos
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-white">Chat en vivo</p>
            <div className="flex items-center gap-1 text-[10px] font-semibold text-zinc-400">
              <Users size={12} /> Top en línea
            </div>
          </div>
        )}
        {uiRole === 'viewer' && !isHostRoom ? (
          <div className="mt-2 hidden items-center gap-2 rounded-xl bg-violet-600/25 px-2.5 py-2 text-[11px] font-semibold text-violet-100 lg:flex">
            <Gift size={14} /> Envía un regalo y destaca tu mensaje
          </div>
        ) : null}
        {inviteBanner ? (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-cyan-500/20 px-2 py-1.5 text-[11px] text-cyan-100 backdrop-blur">
            <span className="flex-1">{inviteBanner}</span>
            <button
              type="button"
              onClick={() => (onAcceptInvite ? onAcceptInvite() : window.location.reload())}
              className="shrink-0 rounded-md bg-cyan-400 px-2 py-0.5 text-[10px] font-bold text-zinc-950"
            >
              Aceptar
            </button>
            <button
              type="button"
              onClick={() => {
                onDeclineInvite?.();
                setInviteBanner(null);
              }}
              className="shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-200"
            >
              {t('common.reject')}
            </button>
          </div>
        ) : null}
      </div>
      <div className="pointer-events-none relative flex min-h-0 flex-col overflow-visible lg:pointer-events-auto lg:flex-1 lg:overflow-hidden">
        <div
          ref={listRef}
          onScroll={onChatScroll}
          className="chat-scroll lb-live-chat-float__list min-h-0 overflow-y-auto overscroll-contain px-3 py-3 lg:flex-1 lg:space-y-2"
        >
          {uiRole === 'host' && sideTab === 'gifts' ? (
            messages.filter((m) => m.gift).length === 0 ? (
              <p className="text-xs text-zinc-500">Los regalos de la sala aparecerán aquí.</p>
            ) : (
              messages
                .filter((m) => m.gift)
                .slice()
                .reverse()
                .map((message) => (
                  <div
                    key={message.id}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                  >
                    <LiveChatUserIdentity
                      layout="inline"
                      author={message.author}
                      authorUid={message.authorUid}
                      className="min-w-0 flex-1"
                    >
                      <p className="truncate text-[10px] text-zinc-400">{message.gift?.name}</p>
                    </LiveChatUserIdentity>
                    {message.gift ? <GiftIcon giftId={message.gift.giftId} size={22} /> : null}
                  </div>
                ))
            )
          ) : messages.length === 0 ? (
            <p className="lb-live-chat-empty text-xs lg:text-zinc-500">
              Sé el primero en saludar.
            </p>
          ) : (
            <p className="hidden text-[10px] text-zinc-600 lg:block">
              Historial · {messages.length} mensajes
            </p>
          )}
          {!(uiRole === 'host' && sideTab === 'gifts') &&
          messages.map((message) => {
            const isHostMsg =
              isHostRoom &&
              profile?.handle &&
              message.author.toLowerCase().replace(/^@/, '') ===
                profile.handle.toLowerCase().replace(/^@/, '');
            const hostChip = isHostMsg ? (
              <span className="ml-1 rounded bg-violet-500 px-1 py-0.5 text-[9px] font-black text-white">
                {t('live.host')}
              </span>
            ) : null;
            return message.gift ? (
              <div
                key={message.id}
                className={`lb-live-chat-msg is-gift flex items-start gap-2 lg:items-center lg:rounded-xl lg:px-3 lg:py-2 ${
                  canPublish
                    ? 'lg:border lg:border-yellow-400/40 lg:bg-black/25 lg:backdrop-blur-sm'
                    : 'lg:border lg:border-yellow-500/50 lg:bg-gradient-to-r lg:from-yellow-500/20 lg:to-fuchsia-500/20'
                }`}
              >
                <LiveChatUserIdentity
                  author={message.author}
                  authorUid={message.authorUid}
                >
                  <span className="lb-live-chat-msg__text inline-flex items-center gap-1 text-sm text-white drop-shadow lg:inline-flex">
                    <GiftIcon giftId={message.gift.giftId} size={16} />
                    {t('live.sentGift')} {message.gift.name}
                  </span>
                </LiveChatUserIdentity>
              </div>
            ) : (
              <div
                key={message.id}
                className={`lb-live-chat-msg flex gap-2 lg:rounded-xl lg:px-2 lg:py-1.5 ${
                  isHostMsg ? 'lg:border lg:border-violet-400/40 lg:bg-violet-500/15' : ''
                }`}
              >
                <LiveChatUserIdentity
                  author={message.author}
                  authorUid={message.authorUid}
                  trailing={hostChip}
                >
                  <span className="lb-live-chat-msg__text">
                    <TranslatedText
                      text={message.text}
                      sourceLang={message.sourceLang}
                      mine={Boolean(profile?.firebaseUid && message.authorUid === profile.firebaseUid)}
                    />
                  </span>
                </LiveChatUserIdentity>
              </div>
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
            {t('live.jumpToEnd')}
          </button>
        ) : null}
      </div>
      <div className="lb-live-chat-float__input pointer-events-auto relative shrink-0 space-y-0 px-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1.5 sm:px-3 lg:border-t lg:border-white/10 lg:bg-transparent lg:p-3">
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
        {uiRole === 'viewer' && !isHostRoom && !openGifts ? (
          <div className="mb-2 hidden border-t border-white/10 pt-2 lg:block">
            <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              Regalos populares ›
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {popularGifts.map((gift) => (
                <button
                  key={gift.id}
                  type="button"
                  onClick={() => {
                    setGiftError(null);
                    setGiftMultiplier(1);
                    setPendingGiftId(gift.id);
                    setOpenGifts(true);
                    setSideTab('gifts');
                  }}
                  className="flex w-14 shrink-0 flex-col items-center gap-0.5"
                >
                  <GiftIcon giftId={gift.id} size={28} />
                  <span className="w-full truncate text-center text-[9px] text-zinc-400">{gift.name}</span>
                  <span className="text-[9px] font-bold text-amber-300">{gift.coins}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {uiRole === 'host' && sideTab === 'gifts' ? (
          <button
            type="button"
            onClick={() => setOpenGifts(true)}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-xs font-bold text-white"
          >
            <Gift size={14} /> Ver todos los regalos
          </button>
        ) : null}
        <div className="flex gap-2">
          {!isHostRoom ? (
          <button
            type="button"
            onClick={() => {
              setOpenGifts((value) => !value);
              setSideTab('gifts');
            }}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-600 text-white shadow-[0_0_18px_rgba(139,92,246,0.35)]"
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
            placeholder={t('chat.writeMessage')}
            className="lb-live-chat-input h-11 flex-1 rounded-full px-3.5 text-sm outline-none lg:rounded-xl"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 text-zinc-950"
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
