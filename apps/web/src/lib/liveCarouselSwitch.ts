import {
  ConnectionQuality as LkConnectionQuality,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  VideoQuality,
} from 'livekit-client';
import { api } from './api';
import { roomKey } from './roomKey';

export type LiveCarouselNeighbor = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  title?: string;
};

export type LiveSwitchToken = {
  token: string;
  serverUrl: string;
  canPublish: boolean;
  isHost?: boolean;
  roomName: string;
  hostUid?: string | null;
};

export type LiveQualityTier = 'low' | 'medium' | 'high';

const TOKEN_TTL_MS = 50_000;
const tokenCache = new Map<string, { at: number; data: LiveSwitchToken }>();
const inflight = new Map<
  string,
  { gen: number; abort: AbortController; promise: Promise<LiveSwitchToken | null> }
>();

let switchGen = 0;

export function bumpLiveSwitchGen(keepRoom?: string): number {
  switchGen += 1;
  abortStaleTokenFetches(switchGen, keepRoom);
  return switchGen;
}

export function currentLiveSwitchGen(): number {
  return switchGen;
}

export function pickNeighborLive<T extends LiveCarouselNeighbor>(
  neighbors: T[],
  currentUsername: string,
  direction: 1 | -1,
): T | null {
  if (neighbors.length === 0) return null;
  const currentIdx = neighbors.findIndex(
    (stream) => roomKey(stream.username) === roomKey(currentUsername),
  );
  const base = currentIdx >= 0 ? currentIdx : -1;
  const nextIdx = (base + direction + neighbors.length) % neighbors.length;
  const next = neighbors[nextIdx];
  if (!next || roomKey(next.username) === roomKey(currentUsername)) return null;
  return next;
}

export function neighborPair<T extends LiveCarouselNeighbor>(neighbors: T[], currentUsername: string) {
  return {
    prev: pickNeighborLive(neighbors, currentUsername, -1),
    next: pickNeighborLive(neighbors, currentUsername, 1),
  };
}

function cacheKey(username: string) {
  return roomKey(username);
}

export function peekCachedLiveToken(username: string): LiveSwitchToken | null {
  const hit = tokenCache.get(cacheKey(username));
  if (!hit) return null;
  if (Date.now() - hit.at > TOKEN_TTL_MS) {
    tokenCache.delete(cacheKey(username));
    return null;
  }
  return hit.data;
}

export function rememberLiveToken(username: string, data: LiveSwitchToken) {
  if (data.canPublish || data.isHost) return;
  tokenCache.set(cacheKey(username), { at: Date.now(), data });
}

function abortStaleTokenFetches(keepGen: number, keepRoom?: string) {
  const keepKey = keepRoom ? cacheKey(keepRoom) : '';
  for (const [key, job] of inflight) {
    if (keepKey && key === keepKey) {
      job.gen = keepGen;
      continue;
    }
    if (job.gen !== keepGen) {
      job.abort.abort();
      inflight.delete(key);
    }
  }
}

export async function fetchLiveViewerToken(
  username: string,
  handle: string,
  gen: number,
): Promise<LiveSwitchToken | null> {
  const cached = peekCachedLiveToken(username);
  if (cached) return cached;
  const key = cacheKey(username);
  const existing = inflight.get(key);
  if (existing) {
    const data = await existing.promise;
    return gen === switchGen ? data : null;
  }
  const abort = new AbortController();
  const promise = (async () => {
    try {
      const data = await api<LiveSwitchToken>(
        `/api/stream/token/${encodeURIComponent(username)}?handle=${encodeURIComponent(handle)}`,
        { signal: abort.signal },
      );
      const token: LiveSwitchToken = {
        ...data,
        roomName: data.roomName || key,
      };
      rememberLiveToken(username, token);
      return token;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, { gen, abort, promise });
  const data = await promise;
  return gen === switchGen ? data : null;
}

export function prefetchLiveViewerTokens(
  usernames: Array<string | null | undefined>,
  handle: string,
  gen: number,
) {
  for (const name of usernames) {
    if (!name) continue;
    if (peekCachedLiveToken(name)) continue;
    void fetchLiveViewerToken(name, handle, gen);
  }
}

export function warmupLivePoster(url: string | null | undefined) {
  if (!url || typeof Image === 'undefined') return;
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
}

export function disconnectLiveRoomQuiet(room: Room | null | undefined) {
  if (!room) return;
  void room.disconnect(true).catch(() => undefined);
}

export function liveSwitchVideoQualityFromNetwork(): LiveQualityTier {
  if (typeof navigator === 'undefined') return 'high';
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean; downlink?: number; rtt?: number };
    deviceMemory?: number;
  };
  const conn = nav.connection;
  const cores = navigator.hardwareConcurrency || 8;
  const memory = nav.deviceMemory;
  if (conn?.saveData) return 'low';
  const type = String(conn?.effectiveType || '');
  if (type === 'slow-2g' || type === '2g') return 'low';
  if (cores <= 2 || (typeof memory === 'number' && memory > 0 && memory <= 2)) return 'low';
  if (type === '3g') return 'medium';
  if (typeof conn?.downlink === 'number' && conn.downlink > 0 && conn.downlink < 1.2) return 'low';
  if (typeof conn?.rtt === 'number' && conn.rtt > 400) return 'low';
  if (typeof conn?.rtt === 'number' && conn.rtt > 200) return 'medium';
  if (cores <= 4 || (typeof memory === 'number' && memory <= 4)) return 'medium';
  return 'high';
}

function lkQualityToTier(quality: LkConnectionQuality): LiveQualityTier | null {
  if (quality === LkConnectionQuality.Excellent) return 'high';
  if (quality === LkConnectionQuality.Good) return 'medium';
  if (quality === LkConnectionQuality.Poor || quality === LkConnectionQuality.Lost) return 'low';
  return null;
}

function worstTier(...tiers: Array<LiveQualityTier | null | undefined>): LiveQualityTier {
  if (tiers.includes('low')) return 'low';
  if (tiers.includes('medium')) return 'medium';
  return 'high';
}

function interpretRtcStats(report: RTCStatsReport): LiveQualityTier | null {
  let rttMs = 0;
  let loss = 0;
  let jitter = 0;
  let hasInbound = false;
  report.forEach((entry) => {
    const row = entry as Record<string, unknown>;
    if (row.type === 'candidate-pair' && row.state === 'succeeded') {
      const rtt = Number(row.currentRoundTripTime || 0);
      if (rtt > 0) rttMs = rtt * 1000;
    }
    if (row.type === 'inbound-rtp' && row.kind === 'video') {
      hasInbound = true;
      jitter = Number(row.jitter || 0);
      const lost = Number(row.packetsLost || 0);
      const received = Number(row.packetsReceived || 0);
      if (received + lost > 0) loss = lost / (received + lost);
    }
  });
  if (!hasInbound && rttMs <= 0) return null;
  if (loss > 0.08 || rttMs > 450 || jitter > 0.05) return 'low';
  if (loss > 0.03 || rttMs > 220 || jitter > 0.025) return 'medium';
  return 'high';
}

async function readSubscriberStats(room: Room): Promise<RTCStatsReport | null> {
  const engine = (room as unknown as { engine?: { pcManager?: { subscriber?: unknown } } }).engine;
  const sub = engine?.pcManager?.subscriber as
    | { getStats?: () => Promise<RTCStatsReport>; pc?: RTCPeerConnection }
    | undefined;
  if (typeof sub?.getStats === 'function') return sub.getStats();
  if (sub?.pc && typeof sub.pc.getStats === 'function') return sub.pc.getStats();
  return null;
}

export async function probeLiveReceiverHealth(room: Room): Promise<LiveQualityTier> {
  const fromNet = liveSwitchVideoQualityFromNetwork();
  const fromLk = lkQualityToTier(room.localParticipant.connectionQuality);
  let fromStats: LiveQualityTier | null = null;
  try {
    const report = await readSubscriberStats(room);
    if (report) fromStats = interpretRtcStats(report);
  } catch {
    /* LiveKit internals pueden cambiar; la red y ConnectionQuality bastan. */
  }
  return worstTier(fromNet, fromLk, fromStats);
}

export function videoQualityForTier(tier: LiveQualityTier): VideoQuality {
  if (tier === 'low') return VideoQuality.LOW;
  if (tier === 'medium') return VideoQuality.MEDIUM;
  return VideoQuality.HIGH;
}

function applyVideoQuality(room: Room, quality: VideoQuality) {
  for (const participant of room.remoteParticipants.values()) {
    for (const pub of participant.videoTrackPublications.values()) {
      if (pub instanceof RemoteTrackPublication) pub.setVideoQuality(quality);
    }
  }
}

/**
 * Espectador: conectar en baja y subir si la red/dispositivo lo permiten.
 * No publica cámara ni mantiene una segunda sala.
 */
export function watchSpectatorLiveQuality(room: Room, enabled: boolean): () => void {
  if (!enabled) return () => undefined;
  let cancelled = false;
  let upgradeTimer = 0;
  let statsTimer = 0;

  const run = (phase: 'fast' | 'adapt') => {
    if (cancelled) return;
    if (phase === 'fast') {
      applyVideoQuality(room, VideoQuality.LOW);
      return;
    }
    void probeLiveReceiverHealth(room).then((tier) => {
      if (cancelled) return;
      applyVideoQuality(room, videoQualityForTier(tier));
    });
  };

  const onSubscribed = (track: Track, publication: RemoteTrackPublication) => {
    if (track.kind !== Track.Kind.Video) return;
    publication.setVideoQuality(VideoQuality.LOW);
    window.clearTimeout(upgradeTimer);
    upgradeTimer = window.setTimeout(() => run('adapt'), 280);
  };

  room.on(RoomEvent.TrackSubscribed, onSubscribed);
  run('fast');
  upgradeTimer = window.setTimeout(() => run('adapt'), 360);
  statsTimer = window.setInterval(() => run('adapt'), 8_000);

  return () => {
    cancelled = true;
    window.clearTimeout(upgradeTimer);
    window.clearInterval(statsTimer);
    room.off(RoomEvent.TrackSubscribed, onSubscribed);
  };
}
