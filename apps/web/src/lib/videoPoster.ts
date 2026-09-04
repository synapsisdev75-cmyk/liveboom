/** Lee dimensiones intrínsecas de display del video (tras metadata del navegador). */
export function readVideoIntrinsicSize(
  file: File | Blob,
  timeoutMs = 12_000,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    let done = false;

    const finish = (width: number, height: number) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
      resolve({ width, height });
    };

    const fail = (err: Error) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      reject(err);
    };

    const timer = window.setTimeout(() => fail(new Error('Tiempo de espera al leer el video')), timeoutMs);

    video.addEventListener('loadedmetadata', () => {
      window.clearTimeout(timer);
      const { videoWidth, videoHeight } = video;
      if (videoWidth > 0 && videoHeight > 0) {
        finish(videoWidth, videoHeight);
      } else {
        fail(new Error('No se pudieron leer las dimensiones del video'));
      }
    });
    video.addEventListener('error', () => {
      window.clearTimeout(timer);
      fail(new Error('No se pudo leer el video'));
    });
    video.src = url;
  });
}

function waitVideoEvent(
  video: HTMLVideoElement,
  event: 'loadeddata' | 'loadedmetadata' | 'seeked',
  timeoutMs = 8_000,
) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Tiempo de espera al leer el video'));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener(event, onOk);
      video.removeEventListener('error', onErr);
    };
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('No se pudo capturar el frame del video'));
    };
    video.addEventListener(event, onOk);
    video.addEventListener('error', onErr);
  });
}

async function drawPortraitPoster(video: HTMLVideoElement, frameWidth: number): Promise<Blob> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw <= 0 || vh <= 0) throw new Error('Dimensiones de video inválidas');

  const frameW = frameWidth;
  const frameH = Math.round((frameW * 16) / 9);
  const canvas = document.createElement('canvas');
  canvas.width = frameW;
  canvas.height = frameH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear la miniatura');

  ctx.fillStyle = '#0a0a0b';
  ctx.fillRect(0, 0, frameW, frameH);
  const scale = Math.min(frameW / vw, frameH / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(video, (frameW - dw) / 2, (frameH - dh) / 2, dw, dh);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error('No se pudo generar la miniatura'))),
      'image/jpeg',
      0.8,
    );
  });
}

/** Tamaño + miniatura en una sola lectura (Boom Clip). No descarga el video entero. */
export async function readVideoSizeAndPortraitPoster(
  file: File | Blob,
  frameWidth = 360,
): Promise<{ width: number; height: number; poster: Blob }> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  const url = URL.createObjectURL(file);
  const metadataReady = waitVideoEvent(video, 'loadedmetadata');
  video.src = url;

  try {
    await metadataReady;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width <= 0 || height <= 0) throw new Error('Dimensiones de video inválidas');

    const seekTo =
      video.duration > 0 && Number.isFinite(video.duration)
        ? Math.min(0.12, video.duration * 0.08)
        : 0;
    if (video.readyState < 2 || Math.abs(video.currentTime - seekTo) > 0.01) {
      const seeked = waitVideoEvent(video, 'seeked');
      video.currentTime = seekTo;
      await seeked;
    }
    const poster = await drawPortraitPoster(video, frameWidth);
    return { width, height, poster };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}

/** Miniatura vertical 9:16 con contain (orientación correcta, sin rotar el archivo). */
export async function captureVideoPosterPortrait(
  file: File | Blob,
  frameWidth = 360,
): Promise<Blob> {
  const { poster } = await readVideoSizeAndPortraitPoster(file, frameWidth);
  return poster;
}

/** Captura un frame JPEG del <video> ya montado (poster de Publicaciones en feed). */
export function captureHtmlVideoPoster(
  video: HTMLVideoElement,
  maxEdge = 720,
  quality = 0.82,
): string | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw <= 0 || vh <= 0) return null;
  try {
    const scale = Math.min(1, maxEdge / Math.max(vw, vh));
    const w = Math.max(1, Math.round(vw * scale));
    const h = Math.max(1, Math.round(vh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}
