import { Camera, Pause, Play, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

function formatClock(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const MAX_VIDEO_NOTE_SEC = 60;

export function VideoNoteBubble({ src, mine }: { src: string; mine?: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTime = () => setProgress(el.currentTime || 0);
    const onMeta = () => setDuration(el.duration && Number.isFinite(el.duration) ? el.duration : 0);
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      el.currentTime = 0;
    };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnded);
    };
  }, [src]);

  async function toggle() {
    const el = videoRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    try {
      await el.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      className={`relative block h-[11rem] w-[11rem] shrink-0 sm:h-48 sm:w-48 ${
        mine ? 'ml-auto' : 'mr-auto'
      }`}
      aria-label={playing ? 'Pausar nota de video' : 'Reproducir nota de video'}
    >
      <div
        className={`h-full w-full overflow-hidden rounded-full ring-2 ${
          mine ? 'ring-violet-300/40' : 'ring-white/15'
        }`}
      >
        <video ref={videoRef} src={src} playsInline preload="metadata" className="h-full w-full object-cover" />
      </div>
      {!playing ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-full bg-black/30">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-black/45 text-white">
            <Play size={22} fill="currentColor" className="ml-0.5" />
          </span>
        </span>
      ) : (
        <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-full bg-black/10">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-black/35 text-white">
            <Pause size={18} fill="currentColor" />
          </span>
        </span>
      )}
      <span className="pointer-events-none absolute bottom-2 right-3 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
        {formatClock(playing ? progress : duration || progress)}
      </span>
    </button>
  );
}

type CaptureProps = {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
};

export function VideoNoteCapture({ open, onClose, onCapture }: CaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError(null);
    setStarting(true);
    setPreviewUrl(null);
    setPreviewFile(null);
    setRecording(false);
    setSeconds(0);

    navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: {
          facingMode: 'user',
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'No se pudo abrir la cámara');
      })
      .finally(() => setStarting(false));

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function cleanupPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewFile(null);
  }

  function closeAll() {
    cleanupPreview();
    onClose();
  }

  function pickMime() {
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) return 'video/webm;codecs=vp9,opus';
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) return 'video/webm;codecs=vp8,opus';
    if (MediaRecorder.isTypeSupported('video/webm')) return 'video/webm';
    if (MediaRecorder.isTypeSupported('video/mp4')) return 'video/mp4';
    return '';
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream || recording) return;
    setError(null);
    cleanupPreview();

    const mimeType = pickMime();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const usedType = recorder.mimeType || mimeType || 'video/webm';
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecording(false);
      setSeconds(0);
      const blob = new Blob(chunksRef.current, { type: usedType });
      if (blob.size < 800) {
        setError('Video demasiado corto');
        return;
      }
      const ext = usedType.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `nota-video-${Date.now()}.${ext}`, { type: usedType });
      setPreviewFile(file);
      setPreviewUrl(URL.createObjectURL(blob));
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    recorderRef.current = recorder;
    recorder.start(250);
    setRecording(true);
    setSeconds(0);
    timerRef.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_VIDEO_NOTE_SEC) {
          recorderRef.current?.stop();
          return MAX_VIDEO_NOTE_SEC;
        }
        return s + 1;
      });
    }, 1000);
  }

  function stopRecording() {
    if (!recording) return;
    recorderRef.current?.stop();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black/95">
      <div
        className="flex shrink-0 items-center justify-between px-4 py-3"
        style={{ paddingTop: 'max(0.75rem, var(--lb-safe-top))' }}
      >
        <p className="text-sm font-semibold text-white">Nota de video</p>
        <button
          type="button"
          onClick={closeAll}
          className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white"
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
        {error ? <p className="text-center text-xs text-rose-300">{error}</p> : null}

        <div className="relative h-[min(72vw,18rem)] w-[min(72vw,18rem)] overflow-hidden rounded-full ring-4 ring-violet-500/35">
          {previewUrl ? (
            <video src={previewUrl} playsInline className="h-full w-full object-cover" controls />
          ) : (
            <video ref={videoRef} playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
          )}
          {recording ? (
            <span className="absolute left-3 top-3 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold text-white">
              ● {formatClock(seconds)}
            </span>
          ) : null}
        </div>

        <p className="max-w-xs text-center text-[11px] text-zinc-400">
          {previewUrl
            ? 'Revisa tu nota antes de enviar.'
            : recording
              ? 'Grabando… Toca de nuevo para terminar.'
              : starting
                ? 'Abriendo cámara…'
                : 'Toca el botón para grabar (máx. 1 min).'}
        </p>
      </div>

      <div
        className="flex shrink-0 items-center justify-center gap-4 px-4 py-4"
        style={{ paddingBottom: 'max(1rem, var(--lb-safe-bottom))' }}
      >
        {previewFile ? (
          <>
            <button
              type="button"
              onClick={() => {
                cleanupPreview();
                void navigator.mediaDevices
                  .getUserMedia({ audio: true, video: { facingMode: 'user' } })
                  .then((stream) => {
                    streamRef.current = stream;
                    if (videoRef.current) {
                      videoRef.current.srcObject = stream;
                      void videoRef.current.play().catch(() => undefined);
                    }
                  });
              }}
              className="rounded-full border border-white/20 px-4 py-2.5 text-sm text-zinc-300"
            >
              Repetir
            </button>
            <button
              type="button"
              onClick={() => {
                onCapture(previewFile);
                closeAll();
              }}
              className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-bold text-white"
            >
              Enviar
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={starting || Boolean(error)}
            onClick={() => (recording ? stopRecording() : startRecording())}
            className={`grid h-16 w-16 place-items-center rounded-full border-4 transition ${
              recording
                ? 'border-red-400 bg-red-500/25 text-red-200'
                : 'border-white/30 bg-white/10 text-white hover:bg-white/15'
            }`}
            aria-label={recording ? 'Detener grabación' : 'Grabar nota de video'}
          >
            <Camera size={26} />
          </button>
        )}
      </div>
    </div>
  );
}
