const PREFS_KEY = 'liveboom.liveMedia.v1';

export type LiveMediaPrefs = {
  cameraId: string | null;
  microphoneId: string | null;
  mirror: boolean;
  orientation: '9:16' | '16:9';
  micOn: boolean;
};

const defaultPrefs: LiveMediaPrefs = {
  cameraId: null,
  microphoneId: null,
  mirror: true,
  orientation: '9:16',
  micOn: true,
};

export function loadLiveMediaPrefs(): LiveMediaPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...defaultPrefs };
    const parsed = JSON.parse(raw) as Partial<LiveMediaPrefs>;
    return {
      cameraId: typeof parsed.cameraId === 'string' && parsed.cameraId ? parsed.cameraId : null,
      microphoneId: typeof parsed.microphoneId === 'string' && parsed.microphoneId ? parsed.microphoneId : null,
      mirror: parsed.mirror !== false,
      orientation: parsed.orientation === '16:9' ? '16:9' : '9:16',
      micOn: parsed.micOn !== false,
    };
  } catch {
    return { ...defaultPrefs };
  }
}

export function saveLiveMediaPrefs(prefs: LiveMediaPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export async function listLiveMediaDevices(): Promise<{
  video: MediaDeviceInfo[];
  audio: MediaDeviceInfo[];
}> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return { video: [], audio: [] };
  }
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    return {
      video: list.filter((item) => item.kind === 'videoinput' && item.deviceId),
      audio: list.filter((item) => item.kind === 'audioinput' && item.deviceId),
    };
  } catch {
    return { video: [], audio: [] };
  }
}

export function liveCameraFacing(label: string, facingMode?: string): 'user' | 'environment' | 'other' {
  const text = `${label} ${facingMode || ''}`.toLowerCase();
  if (/front|user|frontal|face/.test(text)) return 'user';
  if (/back|rear|environment|trasera|wide|ultra/.test(text)) return 'environment';
  return 'other';
}

export function labelLiveCamera(device: MediaDeviceInfo, index: number): string {
  const facing = liveCameraFacing(device.label);
  if (device.label.trim()) return device.label;
  if (facing === 'user') return 'Cámara frontal';
  if (facing === 'environment') return 'Cámara trasera';
  return `Cámara ${index + 1}`;
}

export function labelLiveMicrophone(device: MediaDeviceInfo, index: number): string {
  const label = device.label.trim();
  if (label) return label;
  return `Micrófono ${index + 1}`;
}

export function pickExistingId(preferred: string | null | undefined, devices: MediaDeviceInfo[]): string {
  if (preferred && devices.some((item) => item.deviceId === preferred)) return preferred;
  return devices[0]?.deviceId || '';
}

export function liveCameraDeniedMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  const msg = error instanceof Error ? error.message : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || /permiso|denied/i.test(msg)) {
    return 'No se pudo acceder a la cámara. En el móvil: Ajustes → LiveBoom → Permisos → Cámara y Micrófono.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No se encontró cámara en este dispositivo.';
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'La cámara seleccionada no está disponible. Se intentará con la cámara por defecto.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'La cámara está ocupada por otra app o llamada. Ciérrala y toca Reintentar.';
  }
  return 'No se pudo acceder a la cámara. Revisa los permisos de la app.';
}

/** Estados visibles de la cámara en LIVE / Flash Boom. */
export type LiveCameraStatus =
  | 'available'
  | 'requesting'
  | 'denied'
  | 'blocked'
  | 'busy'
  | 'hardware'
  | 'ready';

export const LIVE_CAMERA_STATUS_LABEL: Record<LiveCameraStatus, string> = {
  available: 'Cámara disponible',
  requesting: 'Solicitando permiso',
  denied: 'Permiso denegado',
  blocked: 'Permiso bloqueado',
  busy: 'Cámara ocupada',
  hardware: 'Error de hardware',
  ready: 'Cámara lista',
};

function mediaErrorName(error: unknown) {
  return error instanceof DOMException || error instanceof Error ? error.name : '';
}

export function isCameraBusyError(error: unknown) {
  const name = mediaErrorName(error);
  return name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError';
}

/**
 * Traduce el error de getUserMedia a un estado y un mensaje que explica por qué hace falta
 * la cámara. `blocked` = el sistema ya no muestra el diálogo: hay que abrir la configuración.
 */
export async function classifyLiveCameraError(
  error: unknown,
): Promise<{ status: Exclude<LiveCameraStatus, 'available' | 'requesting' | 'ready'>; message: string }> {
  const name = mediaErrorName(error);
  const msg = error instanceof Error ? error.message : '';
  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    name === 'SecurityError' ||
    /permiso|denied/i.test(msg)
  ) {
    const { checkAppPermission } = await import('./appPermissions');
    const state = await checkAppPermission('camera');
    if (state === 'blocked') {
      return {
        status: 'blocked',
        message:
          'El permiso de cámara está bloqueado. Para transmitir con video, ábrelo en Configuración → Permisos → Cámara.',
      };
    }
    return {
      status: 'denied',
      message: 'LiveBoom necesita la cámara solo para mostrar tu video en el directo. Toca Reintentar y elige Permitir.',
    };
  }
  if (isCameraBusyError(error)) {
    return {
      status: 'busy',
      message: 'La cámara está ocupada por otra app o una llamada. Ciérrala y toca Reintentar.',
    };
  }
  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError' ||
    name === 'ConstraintNotSatisfiedError'
  ) {
    return { status: 'hardware', message: 'No se encontró una cámara disponible en este dispositivo.' };
  }
  return { status: 'hardware', message: 'La cámara no respondió. Toca Reintentar.' };
}

export function liveMicDeniedMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  const msg = error instanceof Error ? error.message : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || /permiso|denied/i.test(msg)) {
    return 'No se pudo acceder al micrófono. En el móvil: Ajustes → LiveBoom → Permisos → Micrófono.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No se encontró micrófono en este dispositivo.';
  }
  return 'No se pudo acceder al micrófono.';
}

export function cameraConstraints(deviceId?: string | null, facing: 'user' | 'environment' = 'user') {
  // En Android/WebView `exact` suele fallar si el deviceId guardado ya no existe.
  if (deviceId) return { deviceId: { ideal: deviceId }, facingMode: { ideal: facing } };
  return { facingMode: { ideal: facing } };
}

export function micConstraints(deviceId?: string | null) {
  if (deviceId) return { deviceId: { ideal: deviceId } };
  return true;
}

/** getUserMedia con reintento sin deviceId (crítico en app Android). */
export async function getLiveUserMedia(options: {
  cameraId?: string | null;
  microphoneId?: string | null;
  video?: boolean;
  audio?: boolean;
  facing?: 'user' | 'environment';
}): Promise<MediaStream> {
  const wantVideo = options.video !== false;
  const wantAudio = options.audio !== false;
  const facing = options.facing || 'user';
  const primary: MediaStreamConstraints = {
    video: wantVideo ? cameraConstraints(options.cameraId, facing) : false,
    audio: wantAudio ? micConstraints(options.microphoneId) : false,
  };
  const markRequested = () => {
    void import('./appPermissions').then(({ markAppPermissionRequested }) => {
      if (wantVideo) markAppPermissionRequested('camera');
      if (wantAudio) markAppPermissionRequested('microphone');
    });
  };
  try {
    const stream = await navigator.mediaDevices.getUserMedia(primary);
    markRequested();
    return stream;
  } catch (err) {
    markRequested();
    const name = err instanceof DOMException ? err.name : '';
    if (
      wantVideo &&
      (name === 'OverconstrainedError' ||
        name === 'ConstraintNotSatisfiedError' ||
        name === 'NotFoundError')
    ) {
      return navigator.mediaDevices.getUserMedia({
        video: wantVideo ? { facingMode: { ideal: facing } } : false,
        audio: wantAudio ? true : false,
      });
    }
    // Cámara aún retenida (vista previa anterior, otra app que la soltó, volver de segundo plano):
    // un reintento breve suele bastar.
    if (wantVideo && isCameraBusyError(err)) {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      return navigator.mediaDevices.getUserMedia(primary);
    }
    throw err;
  }
}
