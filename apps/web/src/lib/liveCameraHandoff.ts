/**
 * Handoff de tracks de preview (Transmit) → LiveRoom / LiveKit.
 * Evita un segundo getUserMedia al ir LIVE.
 */

export type LiveCameraHandoff = {
  video: MediaStreamTrack | null;
  audio: MediaStreamTrack | null;
  cameraId: string | null;
  microphoneId: string | null;
  at: number;
};

const TTL_MS = 30_000;

let pending: LiveCameraHandoff | null = null;

function stopTracks(payload: LiveCameraHandoff | null) {
  if (!payload) return;
  try {
    payload.video?.stop();
  } catch {
    /* ignore */
  }
  try {
    payload.audio?.stop();
  } catch {
    /* ignore */
  }
}

function isExpired(payload: LiveCameraHandoff): boolean {
  return Date.now() - payload.at > TTL_MS;
}

function isUsable(track: MediaStreamTrack | null | undefined): track is MediaStreamTrack {
  return Boolean(track && track.readyState === 'live');
}

/** Guarda tracks vivos para que LiveRoom los publique. Detiene cualquier handoff previo. */
export function stashLiveCameraHandoff(input: {
  video?: MediaStreamTrack | null;
  audio?: MediaStreamTrack | null;
  cameraId?: string | null;
  microphoneId?: string | null;
}): boolean {
  const video = isUsable(input.video) ? input.video : null;
  const audio = isUsable(input.audio) ? input.audio : null;
  if (!video && !audio) return false;
  if (pending) stopTracks(pending);
  pending = {
    video,
    audio,
    cameraId: input.cameraId || null,
    microphoneId: input.microphoneId || null,
    at: Date.now(),
  };
  return true;
}

/** Consume el handoff (una sola vez). Descarta si expiró o tracks muertos. */
export function takeLiveCameraHandoff(): LiveCameraHandoff | null {
  const current = pending;
  pending = null;
  if (!current) return null;
  if (isExpired(current)) {
    stopTracks(current);
    return null;
  }
  if (!isUsable(current.video) && !isUsable(current.audio)) {
    stopTracks(current);
    return null;
  }
  return {
    ...current,
    video: isUsable(current.video) ? current.video : null,
    audio: isUsable(current.audio) ? current.audio : null,
  };
}

/** Descarta sin consumir (p. ej. abort). */
export function discardLiveCameraHandoff(): void {
  if (!pending) return;
  stopTracks(pending);
  pending = null;
}

export function hasLiveCameraHandoff(): boolean {
  if (!pending) return false;
  if (isExpired(pending)) {
    stopTracks(pending);
    pending = null;
    return false;
  }
  return isUsable(pending.video) || isUsable(pending.audio);
}
