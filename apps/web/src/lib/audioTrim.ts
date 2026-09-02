import { buildLoopedMusicBuffer, renderMusicPreset } from './musicSynthesizer';
import { findMusicTrack, MUSIC_CLIP_SEC } from './musicLibrary';
import { readVideoDurationSec } from './videoDuration';

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
      reject(new Error('No se pudo procesar el media'));
    };
    const cleanup = () => {
      target.removeEventListener(event, onOk);
      target.removeEventListener('error', onErr);
    };
    target.addEventListener(event, onOk, { once: true });
    target.addEventListener('error', onErr, { once: true });
  });
}

/** Mezcla un video con un clip musical de la biblioteca (8 s elegidos, repetidos al largo del video). */
export async function mergeVideoWithMusicClip(
  videoFile: File,
  trackId: string,
  musicStartSec: number,
  clipSec: number = MUSIC_CLIP_SEC,
): Promise<File> {
  const track = findMusicTrack(trackId);
  if (!track) throw new Error('Pista no encontrada');

  const videoUrl = URL.createObjectURL(videoFile);
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.src = videoUrl;

  try {
    await waitForEvent(video, 'loadedmetadata');
    let videoDuration = video.duration;
    if (!Number.isFinite(videoDuration) || videoDuration <= 0) {
      videoDuration = await readVideoDurationSec(videoFile);
    }
    videoDuration = Math.max(1, videoDuration);

    const capture = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream;
    if (!capture) {
      throw new Error('Tu navegador no permite mezclar música con el video aquí.');
    }

    const musicBuffer = await renderMusicPreset(track.preset, track.durationSec);
    const audioCtx = new AudioContext();
    const looped = buildLoopedMusicBuffer(
      audioCtx,
      musicBuffer,
      musicStartSec,
      clipSec,
      videoDuration,
    );

    const dest = audioCtx.createMediaStreamDestination();
    const source = audioCtx.createBufferSource();
    source.buffer = looped;
    source.connect(dest);

    const videoStream = capture.call(video);
    const combined = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);

    const mimeType = pickRecorderMimeType();
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(combined, { mimeType });

    const recorded = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error('No se pudo exportar el video con música'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });

    video.currentTime = 0;
    await waitForEvent(video, 'seeked').catch(() => undefined);
    await video.play();
    source.start(0);
    recorder.start(250);

    await new Promise<void>((resolve) => {
      const onEnd = () => {
        video.removeEventListener('ended', onEnd);
        resolve();
      };
      video.addEventListener('ended', onEnd);
      window.setTimeout(() => {
        video.pause();
        resolve();
      }, Math.ceil(videoDuration * 1000) + 400);
    });

    if (recorder.state !== 'inactive') recorder.stop();
    source.stop();
    await audioCtx.close();

    const blob = await recorded;
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const baseName = videoFile.name.replace(/\.[^.]+$/, '') || 'video';
    return new File([blob], `${baseName}-music.${ext}`, { type: blob.type || mimeType });
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(videoUrl);
  }
}
