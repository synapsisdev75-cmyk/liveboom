/** Pide permiso de micrófono (y cámara si es video) antes de conectar la llamada. */

function stopStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}

function micDeniedMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'LiveBoom necesita acceso al micrófono. Revisa los permisos del navegador.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No se encontró micrófono en este dispositivo.';
  }
  return 'No se pudo acceder al micrófono.';
}

/** Micrófono es obligatorio. La cámara de videollamada no debe abortar la conexión. */
export async function ensureCallMediaPermission(video: boolean): Promise<string | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'Este dispositivo no puede iniciar llamadas desde el navegador.';
  }
  try {
    const audio = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stopStream(audio);
  } catch (error) {
    console.error('[ERROR]', {
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
      stage: 'microphone-permission',
    });
    return micDeniedMessage(error);
  }
  if (!video) return null;
  try {
    const camera = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user' },
    });
    stopStream(camera);
  } catch (error) {
    console.warn('[CALL MEDIA] Cámara no disponible; la llamada continúa con audio', {
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return null;
}

export function canShareScreen() {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getDisplayMedia) &&
    !/iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

export type CallCameraFacing = 'user' | 'environment' | 'other';

export async function listCallMediaDevices(): Promise<{
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

export function inferCallCameraFacing(label: string, facingMode?: string): CallCameraFacing {
  const text = `${label} ${facingMode || ''}`.toLowerCase();
  if (/front|user|frontal|face/.test(text)) return 'user';
  if (/back|rear|environment|trasera|wide|ultra/.test(text)) return 'environment';
  return 'other';
}

export function labelCallCamera(device: MediaDeviceInfo, index: number, compactFacing = false): string {
  const facing = inferCallCameraFacing(device.label);
  if (compactFacing) {
    if (facing === 'user') return 'Cámara frontal';
    if (facing === 'environment') return 'Cámara trasera';
  }
  if (device.label.trim()) return device.label;
  if (facing === 'user') return 'Cámara frontal';
  if (facing === 'environment') return 'Cámara trasera';
  return `Cámara ${index + 1}`;
}

export function labelCallMicrophone(device: MediaDeviceInfo, index: number): string {
  return device.label.trim() || `Micrófono ${index + 1}`;
}

export function callMediaDeniedMessage(error: unknown, video: boolean): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return video
      ? 'LiveBoom necesita acceso a la cámara. Revisa los permisos del navegador.'
      : 'LiveBoom necesita acceso al micrófono. Revisa los permisos del navegador.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return video ? 'No se encontró esa cámara.' : 'No se encontró ese micrófono.';
  }
  return video ? 'No se pudo cambiar la cámara.' : 'No se pudo cambiar el micrófono.';
}
