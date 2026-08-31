import { Camera, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FLASH_BOOM_LABEL } from '../../lib/brand';
import { STORY_MAX_DURATION_SEC } from '../../lib/storyLifecycle';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';

function formatClock(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File, durationSec?: number) => void;
};

/** Grabación con getUserMedia — funciona en desktop y móvil cuando el input capture falla. */
export function FlashBoomCameraCapture({ open, onClose, onCapture }: Props) {
  useBodyScrollLock(open);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const recordedSecRef = useRef(0);

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

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Tu navegador no permite acceder a la cámara. Prueba subir un video desde galería.');
      setStarting(false);
      return;
    }

    navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: {
          facingMode: 'user',
          width: { ideal: 720 },
          height: { ideal: 1280 },
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
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setError('Permiso de cámara denegado. Actívalo en ajustes del navegador o usa galería.');
        } else if (name === 'NotFoundError') {
          setError('No encontramos cámara en este dispositivo. Usa galería para elegir un video.');
        } else {
          setError(err instanceof Error ? err.message : 'No se pudo abrir la cámara');
        }
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

  function restartPreviewStream() {
    void navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
      })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      })
      .catch(() => setError('No se pudo reabrir la cámara'));
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
      const recordedSec = Math.max(1, recordedSecRef.current || seconds);
      setSeconds(recordedSec);
      const blob = new Blob(chunksRef.current, { type: usedType });
      if (blob.size < 800) {
        setError('Video demasiado corto. Graba al menos 1 segundo.');
        restartPreviewStream();
        return;
      }
      const ext = usedType.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `flash-boom-${Date.now()}.${ext}`, { type: usedType });
      setPreviewFile(file);
      setPreviewUrl(URL.createObjectURL(blob));
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    recorderRef.current = recorder;
    recorder.start(250);
    setRecording(true);
    setSeconds(0);
    recordedSecRef.current = 0;
    timerRef.current = window.setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        recordedSecRef.current = next;
        if (next >= STORY_MAX_DURATION_SEC) {
          recorderRef.current?.stop();
          return STORY_MAX_DURATION_SEC;
        }
        return next;
      });
    }, 1000);
  }

  function stopRecording() {
    if (!recording) return;
    recorderRef.current?.stop();
  }

  if (!open) return null;

  const panel = (
    <div className="fixed inset-0 z-[120] flex flex-col overflow-hidden overscroll-none bg-black/95">
      <div
        className="flex shrink-0 items-center justify-between px-4 py-3"
        style={{ paddingTop: 'max(0.75rem, var(--lb-safe-top))' }}
      >
        <p className="text-sm font-semibold text-white">Grabar {FLASH_BOOM_LABEL}</p>
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
        {error ? <p className="max-w-sm text-center text-xs text-rose-300">{error}</p> : null}

        <div className="relative aspect-[9/16] w-[min(72vw,16rem)] overflow-hidden rounded-3xl ring-4 ring-fuchsia-500/35">
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
            ? 'Revisa tu video antes de usarlo.'
            : recording
              ? 'Grabando… Toca de nuevo para terminar.'
              : starting
                ? 'Abriendo cámara…'
                : `Máximo ${STORY_MAX_DURATION_SEC} s · visible 24 h solo para amigos.`}
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
                restartPreviewStream();
              }}
              className="rounded-full border border-white/20 px-4 py-2.5 text-sm text-zinc-300"
            >
              Repetir
            </button>
            <button
              type="button"
              onClick={() => {
                onCapture(previewFile, Math.max(1, recordedSecRef.current || seconds || 1));
                closeAll();
              }}
              className="rounded-full bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-2.5 text-sm font-bold text-white"
            >
              Usar video
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
            aria-label={recording ? 'Detener grabación' : 'Grabar Flash Boom'}
          >
            <Camera size={26} />
          </button>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return panel;
  return createPortal(panel, document.body);
}
