/** Pide permiso de micrófono (y cámara si es video) antes de conectar la llamada. */

export async function ensureCallMediaPermission(video: boolean): Promise<string | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'Este dispositivo no puede iniciar llamadas desde el navegador.';
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: video ? { facingMode: 'user' } : false,
    });
    stream.getTracks().forEach((track) => track.stop());
    return null;
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return video
        ? 'LiveBoom necesita acceso a la cámara y al micrófono para realizar la videollamada.'
        : 'LiveBoom necesita acceso al micrófono para realizar la llamada.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return video
        ? 'No se encontró cámara o micrófono en este dispositivo.'
        : 'No se encontró micrófono en este dispositivo.';
    }
    return video
      ? 'No se pudo acceder a la cámara o al micrófono.'
      : 'No se pudo acceder al micrófono.';
  }
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
