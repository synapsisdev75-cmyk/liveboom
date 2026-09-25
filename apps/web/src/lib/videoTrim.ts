/** Duración máxima de un Boom Clip (segundos). Alias canónico: MAX_CLIP_DURATION_SECONDS. */
export const BOOM_CLIP_MAX_DURATION_SEC = 90;
/** Nombre oficial de la regla de negocio (front). */
export const MAX_CLIP_DURATION_SECONDS = BOOM_CLIP_MAX_DURATION_SEC;

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

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}

/** Recorta un video local entre startSec y endSec. Copia el tramo sin regrabarlo en tiempo real. */
export async function trimVideoFile(
  file: File,
  startSec: number,
  endSec: number,
  signal?: AbortSignal,
  onProgress?: (progress: number) => void,
): Promise<File> {
  throwIfAborted(signal);
  const start = Math.max(0, startSec);
  const end = Math.max(start + 0.3, endSec);
  const durationMs = Math.round((end - start) * 1000);
  if (!Number.isFinite(durationMs) || durationMs < 300) {
    throw new Error('El recorte debe durar al menos 1 segundo.');
  }

  try {
    return await trimWithMediabunny(file, start, end, signal, onProgress);
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw error;
    }
    return trimWithRecorder(file, start, end, durationMs, signal, onProgress);
  }
}

async function trimWithMediabunny(
  file: File,
  start: number,
  end: number,
  signal: AbortSignal | undefined,
  onProgress?: (progress: number) => void,
) {
  const { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } =
    await import('mediabunny');
  throwIfAborted(signal);
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });
  try {
    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target,
    });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      trim: { start, end },
      showWarnings: false,
    });
    throwIfAborted(signal);
    if (!conversion.isValid) {
      throw new Error('No se pudo copiar el tramo');
    }
    conversion.onProgress = (progress) => {
      onProgress?.(Math.max(0, Math.min(1, progress)));
    };
    const onAbort = () => {
      void conversion.cancel();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      await conversion.execute();
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      throw error;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
    throwIfAborted(signal);
    const buffer = target.buffer;
    if (!buffer || buffer.byteLength < 32) {
      throw new Error('El recorte salió vacío');
    }
    onProgress?.(1);
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
    return new File([buffer], `${baseName}-trim.mp4`, { type: 'video/mp4' });
  } finally {
    input.dispose();
  }
}

async function trimWithRecorder(
  file: File,
  start: number,
  end: number,
  durationMs: number,
  signal?: AbortSignal,
  onProgress?: (progress: number) => void,
): Promise<File> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.src = url;
  let recorder: MediaRecorder | null = null;
  let stopTimer = 0;

  const abort = () => {
    window.clearTimeout(stopTimer);
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    } catch {
      /* ignore */
    }
  };

  signal?.addEventListener('abort', abort, { once: true });

  try {
    await waitForEvent(video, 'loadedmetadata');
    throwIfAborted(signal);
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration === Infinity) {
      try {
        video.currentTime = 1e101;
        await waitForEvent(video, 'seeked');
      } catch {
        /* ignore */
      }
    }
    throwIfAborted(signal);

    const capture = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream;
    if (!capture) {
      if (start < 0.25 && end >= video.duration - 0.25) return file;
      throw new Error('Tu navegador no permite editar video aquí. Prueba con un clip más corto.');
    }

    video.currentTime = Math.min(start, Math.max(0, video.duration - 0.1));
    await waitForEvent(video, 'seeked');
    throwIfAborted(signal);

    const stream = capture.call(video);
    const mimeType = pickRecorderMimeType();
    const chunks: BlobPart[] = [];
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
    } catch {
      recorder = new MediaRecorder(stream, { mimeType });
    }

    const activeRecorder = recorder;
    const recorded = new Promise<Blob>((resolve, reject) => {
      activeRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      activeRecorder.onerror = () => reject(new Error('No se pudo exportar el recorte'));
      activeRecorder.onstop = () => {
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        resolve(new Blob(chunks, { type: mimeType }));
      };
    });

    await video.play();
    throwIfAborted(signal);
    activeRecorder.start(250);
    const startedAt = performance.now();
    const progressTimer = window.setInterval(() => {
      onProgress?.(Math.min(0.92, (performance.now() - startedAt) / Math.max(1, durationMs)));
    }, 400);
    try {
      await new Promise<void>((resolve, reject) => {
      stopTimer = window.setTimeout(() => {
        video.pause();
        if (activeRecorder.state !== 'inactive') activeRecorder.stop();
        resolve();
      }, durationMs);
      if (signal) {
        const onAbortWait = () => {
          abort();
          reject(new DOMException('Aborted', 'AbortError'));
        };
        if (signal.aborted) onAbortWait();
        else signal.addEventListener('abort', onAbortWait, { once: true });
      }
    });
    } finally {
      window.clearInterval(progressTimer);
    }

    const blob = await recorded;
    throwIfAborted(signal);
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'boom-clip';
    return new File([blob], `${baseName}-trim.${ext}`, { type: blob.type || mimeType });
  } finally {
    signal?.removeEventListener('abort', abort);
    abort();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
