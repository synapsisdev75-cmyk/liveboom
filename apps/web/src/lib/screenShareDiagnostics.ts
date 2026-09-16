/**
 * Diagnóstico Screen Share (dev/logcat). Sin UI permanente.
 * Sampler cada ~2s para cuellos de botella (capture/encode/red).
 */

import { getScreenShareSession } from './screenShareSessionCoordinator';
import { getScreenShareQuality } from './screenShareQuality';

export type ScreenShareDiagSample = {
  atMs: number;
  transport: string | null;
  opId?: number;
  sessionId?: string;
  note?: string;
  identity?: string;
  width?: number;
  height?: number;
  targetFps?: number;
  bitrateKbps?: number;
  rttMs?: number;
  framesEncoded?: number;
  framesDropped?: number;
  packetLoss?: number;
  gameAudioActive?: boolean;
  micActive?: boolean;
  orientation?: string;
};

const samples: ScreenShareDiagSample[] = [];

export function ssLog(tag: string, payload?: Record<string, unknown>): void {
  if (payload) console.log(`[${tag}]`, payload);
  else console.log(`[${tag}]`);
}

export function pushScreenShareDiag(sample: Omit<ScreenShareDiagSample, 'atMs'>): void {
  const session = getScreenShareSession();
  const quality = getScreenShareQuality();
  const row: ScreenShareDiagSample = {
    ...sample,
    transport: sample.transport ?? session?.transport ?? null,
    opId: sample.opId ?? session?.opId,
    sessionId: sample.sessionId ?? session?.sessionId,
    targetFps: sample.targetFps ?? quality.maxFps,
    atMs: Date.now(),
  };
  samples.push(row);
  if (samples.length > 60) samples.shift();
  console.log('[SS-DIAG]', row);
}

export function getScreenShareDiagSamples(): ScreenShareDiagSample[] {
  return samples.slice();
}

export type PublisherStatsSnapshot = {
  bitrateKbps: number;
  rttMs: number;
  width: number;
  height: number;
  framesEncoded: number;
  framesDropped: number;
  packetLoss: number;
};

/**
 * Lee stats del publisher WebRTC del host (Room JS).
 * El video nativo va por otro PeerConnection; esto cubre mic/juego del host
 * y el legacy canvas. Para native video, mirar logcat SS-LIVEKIT.
 */
export async function readHostPublisherStats(room: {
  engine?: {
    pcManager?: {
      publisher?: { getStats?: () => Promise<RTCStatsReport> };
    };
  };
}): Promise<PublisherStatsSnapshot | null> {
  try {
    const report = await room.engine?.pcManager?.publisher?.getStats?.();
    if (!report) return null;
    let bitrateKbps = 0;
    let rttMs = 0;
    let width = 0;
    let height = 0;
    let framesEncoded = 0;
    let framesDropped = 0;
    let packetsSent = 0;
    let packetsLost = 0;
    report.forEach((entry) => {
      const row = entry as Record<string, unknown>;
      if (row.type === 'outbound-rtp' && row.kind === 'video') {
        const bytes = Number(row.bytesSent || 0);
        const ts = Number(row.timestamp || 0);
        // bitrate puntual aproximado vía targetBitrate si existe
        const target = Number(row.targetBitrate || 0);
        if (target > 0) bitrateKbps = Math.round(target / 1000);
        width = Number(row.frameWidth || width || 0);
        height = Number(row.frameHeight || height || 0);
        framesEncoded = Number(row.framesEncoded || framesEncoded || 0);
        framesDropped = Number(row.framesDropped || framesDropped || 0);
        packetsSent = Number(row.packetsSent || packetsSent || 0);
        void bytes;
        void ts;
      }
      if (row.type === 'candidate-pair' && row.state === 'succeeded') {
        const cur = Number(row.currentRoundTripTime || 0);
        if (cur > 0) rttMs = Math.round(cur * 1000);
      }
      if (row.type === 'remote-inbound-rtp' && row.kind === 'video') {
        packetsLost = Number(row.packetsLost || packetsLost || 0);
        const fraction = Number(row.fractionLost || 0);
        if (fraction > 0) {
          // fractionLost es 0..1 en algunos stacks
        }
      }
    });
    const packetLoss =
      packetsSent > 0 ? Math.round((packetsLost / (packetsSent + packetsLost)) * 1000) / 10 : 0;
    return {
      bitrateKbps,
      rttMs,
      width,
      height,
      framesEncoded,
      framesDropped,
      packetLoss,
    };
  } catch {
    return null;
  }
}
