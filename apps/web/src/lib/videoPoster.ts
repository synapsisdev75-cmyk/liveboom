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

function waitVideoEvent(video: HTMLVideoElement, event: 'loadeddata' | 'seeked') {
  return new Promise<void>((resolve, reject) => {
    const onOk = () => {
      video.removeEventListener(event, onOk);
      video.removeEventListener('error', onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener(event, onOk);
      video.removeEventListener('error', onErr);
      reject(new Error('No se pudo capturar el frame del video'));
    };
    video.addEventListener(event, onOk);
    video.addEventListener('error', onErr);
  });
}

/** Miniatura vertical 9:16 con contain (orientación correcta, sin rotar el archivo). */
export async function captureVideoPosterPortrait(
  file: File | Blob,
  frameWidth = 360,
): Promise<Blob> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const url = URL.createObjectURL(file);
  video.src = url;

  try {
    await waitVideoEvent(video, 'loadeddata');
    const seekTo =
      video.duration > 0 && Number.isFinite(video.duration)
        ? Math.min(0.12, video.duration * 0.08)
        : 0;
    video.currentTime = seekTo;
    await waitVideoEvent(video, 'seeked');

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

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (out) => (out ? resolve(out) : reject(new Error('No se pudo generar la miniatura'))),
        'image/jpeg',
        0.88,
      );
    });
    return blob;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
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
