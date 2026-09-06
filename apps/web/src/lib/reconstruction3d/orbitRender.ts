import type { Reconstruction3DEdit, Reconstruction3DMotion } from './types';
import { reconstructionEditCssFilter } from './types';

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar un fotograma 3D.'));
    img.src = src;
  });
}

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) return 'video/webm;codecs=vp9';
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) return 'video/webm;codecs=vp8';
  if (MediaRecorder.isTypeSupported('video/webm')) return 'video/webm';
  if (MediaRecorder.isTypeSupported('video/mp4')) return 'video/mp4';
  return '';
}

function canvasSize(aspect: '9:16' | '16:9' | '1:1') {
  if (aspect === '16:9') return { width: 1280, height: 720 };
  if (aspect === '1:1') return { width: 720, height: 720 };
  return { width: 720, height: 1280 };
}

function motionAt(t: number, motion: Reconstruction3DMotion) {
  const loop = ((t % 1) + 1) % 1;
  if (motion === 'zoom_in') return { yaw: loop * 360, zoom: 1 + loop * 0.35, lift: 0 };
  if (motion === 'zoom_out') return { yaw: loop * 360, zoom: 1.35 - loop * 0.35, lift: 0 };
  if (motion === 'auto') {
    return {
      yaw: loop * 360,
      zoom: 1.08 + Math.sin(loop * Math.PI * 2) * 0.12,
      lift: Math.sin(loop * Math.PI * 2) * 0.04,
    };
  }
  return { yaw: loop * 360, zoom: 1.05, lift: 0 };
}

export async function renderOrbitVideo(input: {
  frameUrls: string[];
  durationSec: number;
  aspect: '9:16' | '16:9' | '1:1';
  motion: Reconstruction3DMotion;
  edit?: Reconstruction3DEdit;
}): Promise<File> {
  const frames = input.frameUrls.filter(Boolean);
  if (frames.length < 2) throw new Error('Necesitamos más ángulos para generar el video 3D.');
  const mime = pickMime();
  if (!mime || typeof MediaRecorder === 'undefined') {
    throw new Error('Este dispositivo no puede exportar el video 3D. Publícalo como Publicación interactiva.');
  }
  const durationSec = Math.min(90, Math.max(2, Math.round(input.durationSec)));
  const { width, height } = canvasSize(input.aspect);
  const images = await Promise.all(frames.map((src) => loadImage(src)));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo iniciar el render 3D.');
  const stream = canvas.captureStream(24);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3_500_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    recorder.onerror = () => reject(new Error('Falló la grabación del render 3D.'));
  });
  recorder.start(120);
  const fps = 24;
  const total = durationSec * fps;
  for (let i = 0; i < total; i += 1) {
    const t = i / total;
    const pose = motionAt(t, input.motion);
    const index = Math.floor((pose.yaw / 360) * images.length) % images.length;
    const img = images[index];
    if (!img) continue;
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.filter = input.edit ? reconstructionEditCssFilter(input.edit) : 'none';
    ctx.translate(width / 2 + (input.edit?.panX || 0) * 2, height / 2 + (input.edit?.panY || 0) * 2 + pose.lift * height);
    const scale = pose.zoom * ((input.edit?.scale || 100) / 100) * ((input.edit?.zoom || 100) / 100);
    const contain = Math.min(width / img.width, height / img.height) * scale;
    ctx.drawImage(img, (-img.width * contain) / 2, (-img.height * contain) / 2, img.width * contain, img.height * contain);
    ctx.restore();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  }
  recorder.stop();
  stream.getTracks().forEach((track) => track.stop());
  const blob = await done;
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  return new File([blob], `reconstruccion-3d.${ext}`, { type: mime });
}

export async function reconstructionPreviewFile(src: string): Promise<File> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  const max = 1080;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear la vista previa 3D.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('No se pudo exportar la vista previa 3D.'))), 'image/jpeg', 0.86);
  });
  return new File([blob], 'reconstruccion-3d.jpg', { type: 'image/jpeg' });
}
