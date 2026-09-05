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
