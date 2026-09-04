import { Camera, RefreshCcw, SwitchCamera, Video, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';

const PERMISSION_ERROR = 'No se pudo acceder a la cámara. Activa el permiso de cámara para LiveBoom.';

function formatClock(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

type CaptureMode = 'photo' | 'video';

type CameraOption = {
  deviceId: string;
  label: string;
  facing: 'user' | 'environment' | 'unknown';
};

let sessionDeviceId: string | null = null;

function facingFromLabel(label: string): CameraOption['facing'] {
  const text = label.toLowerCase();
  if (/front|user|face|frontal/.test(text)) return 'user';
  if (/back|rear|environment|trasera|back camera/.test(text)) return 'environment';
  return 'unknown';
}

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) return 'video/webm;codecs=vp9,opus';
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) return 'video/webm;codecs=vp8,opus';
  if (MediaRecorder.isTypeSupported('video/webm')) return 'video/webm';
  if (MediaRecorder.isTypeSupported('video/mp4')) return 'video/mp4';
  return '';
}

type Props = {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File, durationSec?: number) => void;
  title?: string;
  maxDurationSec?: number;
  allowPhoto?: boolean;
  defaultMode?: CaptureMode;
};

/** Captura in-app con getUserMedia: foto o video, sin abrir galería. */
export function FlashBoomCameraCapture({
  open,
  onClose,
  onCapture,
  title = 'Cámara',
  maxDurationSec = 90,
  allowPhoto = true,
  defaultMode = 'photo',
}: Props) {
  useBodyScrollLock(open);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const recordedSecRef = useRef(0);
  const deviceIdRef = useRef<string | null>(sessionDeviceId);

  const [mode, setMode] = useState<CaptureMode>(allowPhoto ? defaultMode : 'video');
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(sessionDeviceId);
  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewKind, setPreviewKind] = useState<CaptureMode>('video');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const selected = cameras.find((item) => item.deviceId === deviceId) ?? cameras[0];
  const isFront = selected?.facing === 'user';

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const listCameras = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const all = await navigator.mediaDevices.enumerateDevices();
    const next = all
      .filter((item) => item.kind === 'videoinput' && item.deviceId)
      .map((item, index) => ({
        deviceId: item.deviceId,
        label: item.label || `Cámara ${index + 1}`,
        facing: facingFromLabel(item.label || ''),
      }));
    setCameras(next);
    if (!deviceIdRef.current && next[0]) {
      deviceIdRef.current = next[0].deviceId;
      setDeviceId(next[0].deviceId);
      sessionDeviceId = next[0].deviceId;
    }
  }, []);

  const startStream = useCallback(
    async (nextMode: CaptureMode, nextDeviceId?: string | null) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(PERMISSION_ERROR);
        setStarting(false);
        return;
      }
      setStarting(true);
      setError(null);
      stopStream();

      const constraintFor = (id: string | null): MediaTrackConstraints =>
        id
          ? { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } };

      const attach = async (stream: MediaStream) => {
        streamRef.current = stream;
        const trackId = stream.getVideoTracks()[0]?.getSettings().deviceId;
        if (trackId) {
          deviceIdRef.current = trackId;
          setDeviceId(trackId);
          sessionDeviceId = trackId;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        await listCameras();
      };

      let chosenId = nextDeviceId ?? deviceIdRef.current;
      try {
        try {
          await attach(
            await navigator.mediaDevices.getUserMedia({
              audio: nextMode === 'video',
              video: constraintFor(chosenId),
            }),
          );
        } catch (err) {
          const name = err instanceof DOMException ? err.name : '';
          if (name === 'OverconstrainedError' && chosenId) {
            chosenId = null;
            deviceIdRef.current = null;
            await attach(
              await navigator.mediaDevices.getUserMedia({
                audio: nextMode === 'video',
                video: constraintFor(null),
              }),
            );
          } else if (
            nextMode === 'video' &&
            name !== 'NotAllowedError' &&
            name !== 'PermissionDeniedError'
          ) {
            await attach(
              await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: constraintFor(chosenId),
              }),
            );
          } else {
            throw err;
          }
        }
      } catch {
        setError(PERMISSION_ERROR);
      } finally {
        setStarting(false);
      }
    },
    [listCameras, stopStream],
  );

  useEffect(() => {
    if (!open) return;
    const initialMode = allowPhoto ? defaultMode : 'video';
    setMode(initialMode);
    setError(null);
    setPreviewUrl(null);
    setPreviewFile(null);
    setRecording(false);
    setSeconds(0);
    void startStream(initialMode, sessionDeviceId);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recorderRef.current?.stop();
      stopStream();
    };
  }, [open, allowPhoto, defaultMode, startStream, stopStream]);

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

  function switchMode(next: CaptureMode) {
    if (!allowPhoto && next === 'photo') return;
    if (recording || previewFile) return;
    setMode(next);
    void startStream(next, deviceIdRef.current);
  }

  function cycleCamera() {
    if (cameras.length < 2 || recording || previewFile) return;
    const current = deviceIdRef.current;
    const index = Math.max(
      0,
      cameras.findIndex((item) => item.deviceId === current),
    );
    const next = cameras[(index + 1) % cameras.length];
    if (!next) return;
    deviceIdRef.current = next.deviceId;
    setDeviceId(next.deviceId);
    sessionDeviceId = next.deviceId;
    void startStream(mode, next.deviceId);
  }

  function selectCamera(nextId: string) {
    if (!nextId || recording || previewFile) return;
    deviceIdRef.current = nextId;
    setDeviceId(nextId);
    sessionDeviceId = nextId;
    void startStream(mode, nextId);
  }

  function takePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth < 2) {
      setError('La cámara aún no está lista. Espera un segundo e inténtalo de nuevo.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('No se pudo guardar la foto.');
          return;
        }
        const file = new File([blob], `liveboom-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setPreviewKind('photo');
        setPreviewFile(file);
        setPreviewUrl(URL.createObjectURL(blob));
        stopStream();
      },
      'image/jpeg',
      0.92,
    );
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream || recording) return;
    if (typeof MediaRecorder === 'undefined') {
      setError('No se pudo grabar video en este navegador.');
      return;
    }
    setError(null);
    cleanupPreview();
    const mimeType = pickMime();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      setError('No se pudo grabar video en este navegador.');
      return;
    }
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
        void startStream('video', deviceIdRef.current);
        return;
      }
      const ext = usedType.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `liveboom-${Date.now()}.${ext}`, { type: usedType });
      setPreviewKind('video');
      setPreviewFile(file);
      setPreviewUrl(URL.createObjectURL(blob));
      stopStream();
    };
    recorderRef.current = recorder;
    recorder.start(250);
    setRecording(true);
    setSeconds(0);
    recordedSecRef.current = 0;
    timerRef.current = window.setInterval(() => {
      setSeconds((value) => {
        const next = value + 1;
        recordedSecRef.current = next;
        if (next >= maxDurationSec) {
          recorderRef.current?.stop();
          return maxDurationSec;
        }
        return next;
      });
    }, 1000);
  }

  function stopRecording() {
    if (!recording) return;
    recorderRef.current?.stop();
  }

  function retake() {
    cleanupPreview();
    setSeconds(0);
    void startStream(mode, deviceIdRef.current);
  }

  if (!open) return null;

  const reviewing = Boolean(previewFile && previewUrl);

  const panel = (
    <div className="fixed inset-0 z-[120] flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden overscroll-none bg-black">
      <div
        className="flex shrink-0 items-center justify-between gap-2 px-3 py-2"
        style={{ paddingTop: 'max(0.6rem, var(--lb-safe-top))' }}
      >
        <p className="min-w-0 truncate text-sm font-semibold text-white">{title}</p>
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          {cameras.length > 1 && !reviewing && !recording ? (
            <>
              <label className="sr-only" htmlFor="lb-camera-select">
                Elegir cámara
              </label>
              <select
                id="lb-camera-select"
                value={deviceId || ''}
                onChange={(event) => selectCamera(event.target.value)}
                className="hidden max-w-[min(12rem,42vw)] rounded-full border border-white/15 bg-black/55 px-2 py-1 text-[10px] text-white md:block"
              >
                {cameras.map((item) => (
                  <option key={item.deviceId} value={item.deviceId}>
                    {item.label}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          {cameras.length > 1 && !reviewing && !recording ? (
            <button
              type="button"
              onClick={cycleCamera}
              className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white"
              aria-label="Cambiar cámara"
            >
              <SwitchCamera size={18} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={closeAll}
            className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {!reviewing && !recording ? (
        <div className="mx-auto mb-2 flex w-[min(100%-1.5rem,18rem)] rounded-full border border-white/15 bg-black/50 p-0.5">
          {allowPhoto ? (
            <button
              type="button"
              onClick={() => switchMode('photo')}
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full text-xs font-semibold ${
                mode === 'photo' ? 'bg-fuchsia-500 text-white' : 'text-zinc-300'
              }`}
            >
              <Camera size={14} />
              Foto
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => switchMode('video')}
            className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full text-xs font-semibold ${
              mode === 'video' ? 'bg-cyan-500 text-zinc-950' : 'text-zinc-300'
            }`}
          >
            <Video size={14} />
            Video
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-3">
        {error ? <p className="max-w-sm shrink-0 text-center text-sm text-rose-300">{error}</p> : null}

        <div className="relative min-h-0 w-full max-w-[min(100%,36rem)] flex-1 overflow-hidden rounded-3xl bg-zinc-950 ring-2 ring-white/10">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-contain ${reviewing ? 'invisible' : ''} ${isFront ? 'scale-x-[-1]' : ''}`}
          />
          {reviewing && previewKind === 'photo' && previewUrl ? (
            <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
          ) : null}
          {reviewing && previewKind === 'video' && previewUrl ? (
            <video src={previewUrl} playsInline controls className="absolute inset-0 h-full w-full object-contain" />
          ) : null}
          {recording ? (
            <span className="absolute left-3 top-3 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold text-white">
              ● {formatClock(seconds)}
            </span>
          ) : null}
        </div>

        <p className="max-w-xs shrink-0 text-center text-[11px] text-zinc-400">
          {error
            ? 'Activa el permiso e inténtalo de nuevo.'
            : reviewing
              ? previewKind === 'photo'
                ? 'Revisa tu foto antes de usarla.'
                : 'Revisa tu video antes de usarlo.'
              : recording
                ? 'Grabando… Toca detener para terminar.'
                : starting
                  ? 'Abriendo cámara…'
                  : mode === 'video'
                    ? `Máximo ${maxDurationSec} s`
                    : 'Toca el botón para tomar la foto'}
        </p>
      </div>

      <div
        className="flex shrink-0 items-center justify-center gap-3 px-4 py-3"
        style={{ paddingBottom: 'max(0.85rem, var(--lb-safe-bottom))' }}
      >
        {reviewing && previewFile ? (
          <>
            <button
              type="button"
              onClick={retake}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/20 px-4 text-sm text-zinc-200"
            >
              <RefreshCcw size={14} />
              Repetir
            </button>
            <button
              type="button"
              onClick={() => {
                onCapture(
                  previewFile,
                  previewKind === 'video' ? Math.max(1, recordedSecRef.current || seconds || 1) : undefined,
                );
                closeAll();
              }}
              className="inline-flex min-h-11 items-center rounded-full bg-cyan-500 px-5 text-sm font-bold text-zinc-950"
            >
              {previewKind === 'photo' ? 'Usar foto' : 'Usar video'}
            </button>
          </>
        ) : error ? (
          <button
            type="button"
            onClick={() => void startStream(mode, deviceIdRef.current)}
            className="inline-flex min-h-11 items-center rounded-full bg-cyan-500 px-5 text-sm font-bold text-zinc-950"
          >
            Reintentar
          </button>
        ) : mode === 'video' ? (
          <button
            type="button"
            disabled={starting}
            onClick={() => (recording ? stopRecording() : startRecording())}
            className={`grid h-16 w-16 place-items-center rounded-full border-4 transition ${
              recording
                ? 'border-red-400 bg-red-500/25 text-red-200'
                : 'border-white/30 bg-white/10 text-white'
            }`}
            aria-label={recording ? 'Detener grabación' : 'Iniciar grabación'}
          >
            {recording ? <span className="h-5 w-5 rounded-sm bg-red-400" /> : <Video size={26} />}
          </button>
        ) : (
          <button
            type="button"
            disabled={starting}
            onClick={takePhoto}
            className="grid h-16 w-16 place-items-center rounded-full border-4 border-white/30 bg-white/10 text-white"
            aria-label="Tomar foto"
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
