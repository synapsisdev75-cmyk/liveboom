/**
 * Coordinador único de Screen Share (in-LIVE).
 * No reemplaza LiveRoom: solo orquesta start/stop/transport/diagnóstico.
 */

export type ScreenShareTransportMode = 'native' | 'legacy';

export type ScreenShareBranch = {
  /** Video: participante técnico nativo o canvas legacy en host. */
  video: 'native_participant' | 'legacy_host_canvas';
  /** Micrófono del host (WebView o FGS). Nunca en la Room nativa. */
  microphone: 'host_webrtc' | 'host_fgs';
  /** Audio del juego: pista ScreenShareAudio del host. */
  gameAudio: 'host_playback_capture' | 'none';
};

export type ScreenShareSessionSnapshot = {
  opId: number;
  sessionId: string;
  transport: ScreenShareTransportMode | null;
  branch: ScreenShareBranch;
  startedAtMs: number;
};

let current: ScreenShareSessionSnapshot | null = null;

export function beginScreenShareSession(input: {
  opId: number;
  sessionId: string;
  transport: ScreenShareTransportMode;
  branch: ScreenShareBranch;
}): ScreenShareSessionSnapshot {
  current = {
    opId: input.opId,
    sessionId: input.sessionId,
    transport: input.transport,
    branch: input.branch,
    startedAtMs: Date.now(),
  };
  console.log('[SS-SESSION] begin', current);
  return current;
}

export function getScreenShareSession(): ScreenShareSessionSnapshot | null {
  return current;
}

export function endScreenShareSession(reason: string): void {
  console.log('[SS-SESSION] end', reason, current);
  current = null;
}

export function screenShareSessionIdFor(hostUid: string, opId: number): string {
  return `ss_${String(hostUid).slice(0, 8)}_${opId}_${Date.now().toString(36)}`;
}
