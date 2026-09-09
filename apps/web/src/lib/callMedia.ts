/** Pide permiso de micrófono (y cámara si es video) antes de conectar la llamada. */

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

let pendingCallMic: MediaStreamTrack | null = null;

function stopPendingCallMic() {
  const track = pendingCallMic;
  pendingCallMic = null;
  try {
    track?.stop();
  } catch {
    /* ignore */
  }
}

/** Entrega el mic abierto en el gesto del usuario para publicarlo en LiveKit (no volver a abrirlo). */
export function takePendingCallMicrophone(): MediaStreamTrack | null {
  const track = pendingCallMic;
  pendingCallMic = null;
  return track;
}

export function releasePendingCallMicrophone() {
  stopPendingCallMic();
}

/**
 * Abre el micrófono en el clic (gesto) y lo deja vivo.
 * No se detiene aquí: en Windows/Chrome stop()+reopen deja el dispositivo ocupado y LiveKit publica silencio.
 * La cámara no se toca.
 */
export async function ensureCallMediaPermission(video: boolean): Promise<string | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'Este dispositivo no puede iniciar llamadas desde el navegador.';
  }
  try {
    const status = await navigator.permissions?.query?.({ name: 'microphone' as PermissionName });
    if (status?.state === 'denied') {
      return video
        ? 'LiveBoom necesita acceso al micrófono. Revisa los permisos del navegador.'
        : micDeniedMessage(new DOMException('', 'NotAllowedError'));
    }
  } catch {
    /* Safari / Firefox no siempre exponen permissions.query. */
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const track = stream.getAudioTracks()[0] || null;
    stream.getTracks().forEach((item) => {
      if (item !== track) item.stop();
    });
    if (!track || track.readyState !== 'live') {
      stream.getTracks().forEach((item) => item.stop());
      return micDeniedMessage(new DOMException('', 'NotFoundError'));
    }
    stopPendingCallMic();
    pendingCallMic = track;
    track.addEventListener(
      'ended',
      () => {
        if (pendingCallMic === track) pendingCallMic = null;
      },
      { once: true },
    );
    return null;
  } catch (error) {
    return micDeniedMessage(error);
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
      video: list.filter((item) => item.kind === 'videoinput'),
      audio: list.filter((item) => item.kind === 'audioinput'),
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
  if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError') {
    return video
      ? 'La cámara está ocupada. Ciérrala en otra app y vuelve a intentar.'
      : 'El micrófono está ocupado. Ciérralo en otra app y vuelve a intentar.';
  }
  return video ? 'No se pudo usar la cámara.' : 'No se pudo usar el micrófono.';
}
