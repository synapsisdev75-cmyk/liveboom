/** Lee la duración en segundos de un archivo de video local (incluye WebM de cámara). */
export function readVideoDurationSec(file: File, fallbackSec = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    let settled = false;
    const timeout = window.setTimeout(() => finish(fallbackSec > 0 ? fallbackSec : null), 12_000);

    function cleanup() {
      window.clearTimeout(timeout);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    }

    function finish(duration: number | null) {
      if (settled) return;
      settled = true;
      cleanup();
      if (duration != null && Number.isFinite(duration) && duration > 0 && duration !== Infinity) {
        resolve(duration);
        return;
      }
      if (fallbackSec > 0) {
        resolve(fallbackSec);
        return;
      }
      reject(new Error('No se pudo leer la duración del video'));
    }

    function tryRead() {
      const duration = Number(video.duration);
      if (Number.isFinite(duration) && duration > 0 && duration !== Infinity) {
        finish(duration);
      }
    }

    video.addEventListener('loadedmetadata', () => {
      tryRead();
      if (!settled) {
        // WebM grabado en navegador suele reportar duración solo tras seek.
        try {
          video.currentTime = 1e101;
        } catch {
          /* ignore */
        }
      }
    });
    video.addEventListener('durationchange', tryRead);
    video.addEventListener('seeked', tryRead);
    video.addEventListener('loadeddata', tryRead);
    video.addEventListener('error', () => finish(fallbackSec > 0 ? fallbackSec : null));
    video.src = url;
  });
}
