/**
 * Lógica aislada de compartir pantalla (testeable sin montar LiveRoom).
 * No toca regalos, chat ni otras funciones del LIVE.
 */

export type ScreenSharePhase =
  | 'idle'
  | 'authorizing'
  | 'starting'
  | 'publishing'
  | 'active'
  | 'stopping';

/** Bloqueo sincrónico + id de operación para descartar callbacks viejos. */
export class ScreenShareOperationGate {
  phase: ScreenSharePhase = 'idle';
  opId = 0;
  private stopShared: Promise<void> | null = null;

  /** true si se puede iniciar una captura nueva. */
  canStart(): boolean {
    return this.phase === 'idle';
  }

  /** Inicia autorización; null si hay otra operación en curso. */
  beginStart(): number | null {
    if (!this.canStart()) return null;
    this.phase = 'authorizing';
    this.opId += 1;
    return this.opId;
  }

  isCurrent(id: number): boolean {
    return id === this.opId;
  }

  advance(id: number, phase: ScreenSharePhase): boolean {
    if (!this.isCurrent(id)) return false;
    this.phase = phase;
    return true;
  }

  /** Falla un start: vuelve a idle solo si el op sigue vigente. */
  failStart(id: number): void {
    if (!this.isCurrent(id)) return;
    if (this.phase === 'stopping' || this.phase === 'active') return;
    this.phase = 'idle';
  }

  markActive(id: number): boolean {
    return this.advance(id, 'active');
  }

  /**
   * Detenciones concurrentes comparten la misma Promise.
   * Invalida starts en vuelo incrementando opId.
   */
  runStop(worker: () => Promise<void>): Promise<void> {
    if (this.stopShared) return this.stopShared;
    this.phase = 'stopping';
    this.opId += 1;
    const myStopGen = this.opId;
    let workerPromise: Promise<void>;
    try {
      workerPromise = Promise.resolve().then(() => worker());
    } catch (err) {
      this.phase = 'idle';
      this.stopShared = null;
      return Promise.reject(err);
    }
    this.stopShared = workerPromise.finally(() => {
      if (this.opId === myStopGen) this.phase = 'idle';
      this.stopShared = null;
    });
    return this.stopShared;
  }
}

export function releaseMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  try {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

export type WaitConnectedRoom = {
  state: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on: (event: any, cb: (...args: any[]) => void) => unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off: (event: any, cb: (...args: any[]) => void) => unknown;
};

function isConnectedState(state: string): boolean {
  return state === 'connected';
}

function scheduleTimeout(fn: () => void, ms: number): { clear: () => void } {
  const id = setTimeout(fn, ms);
  return { clear: () => clearTimeout(id) };
}

/**
 * Espera conexión inicial o reconexión.
 * Reconoce Connected, Reconnected y ConnectionStateChanged.
 * AbortSignal / isCancelled no esperan al timeout ni se reportan como fallo de red.
 */
export function waitRoomConnected(
  room: WaitConnectedRoom,
  options: {
    timeoutMs?: number;
    isCancelled?: () => boolean;
    signal?: AbortSignal;
  } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const cancelled = () =>
    Boolean(options.isCancelled?.() || options.signal?.aborted);

  if (cancelled()) {
    return Promise.reject(Object.assign(new Error('waitConnected cancelado'), { name: 'AbortError' }));
  }
  if (isConnectedState(room.state)) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer: { clear: () => void } | null = null;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      timer?.clear();
      options.signal?.removeEventListener('abort', onAbort);
      room.off('connected', onMaybeReady);
      room.off('reconnected', onMaybeReady);
      room.off('connectionStateChanged', onMaybeReady);
      fn();
    };

    const onAbort = () => {
      finish(() =>
        reject(Object.assign(new Error('waitConnected cancelado'), { name: 'AbortError' })),
      );
    };

    const onMaybeReady = () => {
      if (cancelled()) {
        onAbort();
        return;
      }
      if (isConnectedState(room.state)) {
        finish(() => resolve());
      }
    };

    timer = scheduleTimeout(() => {
      if (cancelled()) {
        onAbort();
        return;
      }
      finish(() => reject(new Error('Tiempo de espera agotado al conectar LiveKit')));
    }, timeoutMs);

    options.signal?.addEventListener('abort', onAbort, { once: true });
    room.on('connected', onMaybeReady);
    room.on('reconnected', onMaybeReady);
    room.on('connectionStateChanged', onMaybeReady);
    onMaybeReady();
  });
}

/** Publicación de video usable del host: cámara O pantalla. */
export function isHostVideoPublication(pub: {
  source?: string;
  isMuted?: boolean;
  track?: { mediaStreamTrack?: { readyState?: string } | null } | null;
  requireLiveMedia?: boolean;
}): boolean {
  const source = String(pub.source || '');
  if (source !== 'camera' && source !== 'screen_share') return false;
  if (pub.isMuted) return false;
  if (!pub.track) return false;
  if (pub.requireLiveMedia) {
    const state = pub.track.mediaStreamTrack?.readyState;
    if (state && state !== 'live') return false;
  }
  return true;
}

export function participantHasHostMedia(
  publications: Iterable<{
    source?: string;
    isMuted?: boolean;
    track?: { mediaStreamTrack?: { readyState?: string } | null } | null;
  }>,
  options?: { requireLiveMedia?: boolean },
): boolean {
  for (const pub of publications) {
    // Leer getters del TrackPublication real (no copiar con spread).
    const source = pub.source;
    const isMuted = pub.isMuted;
    const track = pub.track;
    if (
      isHostVideoPublication({
        source,
        isMuted,
        track,
        requireLiveMedia: options?.requireLiveMedia,
      })
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Tras publicar pantalla, un fallo de overlay no debe tumbar la captura.
 * Devuelve el mensaje de aviso o null si todo ok / no aplica.
 */
export function overlayFailureWarning(
  overlayShown: boolean,
  hasPermission: boolean,
  baseMsg: string,
): string | null {
  if (overlayShown || hasPermission) return null;
  return `${baseMsg} · compartiendo · (opcional) “Mostrar sobre otras apps” después del live`;
}

/** Simula: publicar OK + overlay falla ⇒ captura sigue activa. */
export function shouldKeepCaptureAfterOverlayError(published: boolean, overlayError: boolean): boolean {
  return published && overlayError;
}

/** Simula: stream obtenido + waitConnected falla ⇒ hay que liberar el stream. */
export function mustReleaseStreamOnConnectFailure(hasStream: boolean, connectOk: boolean): boolean {
  return hasStream && !connectOk;
}

/** Simula: segundo start mientras authorizing debe bloquearse. */
export function secondStartBlocked(phase: ScreenSharePhase): boolean {
  return phase !== 'idle';
}
