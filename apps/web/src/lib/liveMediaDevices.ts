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
  return 'No se pudo acceder a la cámara. Revisa los permisos de la app.';
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
  try {
    return await navigator.mediaDevices.getUserMedia(primary);
  } catch (err) {
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
    throw err;
  }
}
