/** Duración máxima de un Boom Clip / Flash Boom (segundos). */
export const BOOM_CLIP_MAX_DURATION_SEC = 90;

function pickRecorderMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return 'video/webm';
}

function waitForEvent(target: EventTarget, event: string) {
  return new Promise<void>((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('No se pudo procesar el video'));
    };
    const cleanup = () => {
      target.removeEventListener(event, onOk);
      target.removeEventListener('error', onErr);
    };
    target.addEventListener(event, onOk, { once: true });
    target.addEventListener('error', onErr, { once: true });
  });
}

/** Recorta un video local entre startSec y endSec (re-encode en el navegador). */
export async function trimVideoFile(
  file: File,
  startSec: number,
  endSec: number,
): Promise<File> {
  const start = Math.max(0, startSec);
  const end = Math.max(start + 0.3, endSec);
  const durationMs = Math.round((end - start) * 1000);
  if (!Number.isFinite(durationMs) || durationMs < 300) {
    throw new Error('El recorte debe durar al menos 1 segundo.');
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.src = url;

  try {
    await waitForEvent(video, 'loadedmetadata');
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration === Infinity) {
      try {
        video.currentTime = 1e101;
        await waitForEvent(video, 'seeked');
      } catch {
        /* ignore */
      }
    }

    const capture = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream;
    if (!capture) {
      if (start < 0.25 && end >= video.duration - 0.25) return file;
      throw new Error('Tu navegador no permite editar video aquí. Prueba con un clip más corto.');
    }

    video.currentTime = Math.min(start, Math.max(0, video.duration - 0.1));
    await waitForEvent(video, 'seeked');

    const stream = capture.call(video);
    const mimeType = pickRecorderMimeType();
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, { mimeType });

    const recorded = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error('No se pudo exportar el recorte'));
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mimeType }));
      };
    });

    await video.play();
    recorder.start(250);
    await new Promise<void>((resolve) => {
      window.setTimeout(() => {
        video.pause();
        if (recorder.state !== 'inactive') recorder.stop();
        resolve();
      }, durationMs);
    });

    const blob = await recorded;
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'boom-clip';
    return new File([blob], `${baseName}-trim.${ext}`, { type: blob.type || mimeType });
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
