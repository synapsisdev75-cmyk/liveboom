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
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'No se pudo acceder a la cámara. Revisa los permisos del navegador.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No se encontró cámara en este dispositivo.';
  }
  return 'No se pudo acceder a la cámara. Revisa los permisos del navegador.';
}

export function liveMicDeniedMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'No se pudo acceder al micrófono. Revisa los permisos del navegador.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No se encontró micrófono en este dispositivo.';
  }
  return 'No se pudo acceder al micrófono.';
}

export function cameraConstraints(deviceId?: string | null, facing: 'user' | 'environment' = 'user') {
  if (deviceId) return { deviceId: { exact: deviceId } };
  return { facingMode: { ideal: facing } };
}

export function micConstraints(deviceId?: string | null) {
  if (deviceId) return { deviceId: { exact: deviceId } };
  return true;
}
