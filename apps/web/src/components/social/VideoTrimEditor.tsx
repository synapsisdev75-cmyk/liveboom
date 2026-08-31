import { Scissors } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { readVideoDurationSec } from '../../lib/videoDuration';
import { BOOM_CLIP_MAX_DURATION_SEC } from '../../lib/videoTrim';

type Props = {
  file: File;
  previewUrl: string;
  durationSec: number;
  maxDurationSec?: number;
  title?: string;
  onCancel: () => void;
  onSave: (file: File) => void;
};

export function VideoTrimEditor({
  file,
  previewUrl,
  durationSec: durationHint,
  maxDurationSec = BOOM_CLIP_MAX_DURATION_SEC,
  title = 'Editar video',
  onCancel,
  onSave,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [durationSec, setDurationSec] = useState(() =>
    durationHint > 0 ? durationHint : maxDurationSec,
  );
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(() =>
    Math.min(durationHint > 0 ? durationHint : maxDurationSec, maxDurationSec),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(durationHint <= 0);

  const clipDuration = useMemo(() => Math.max(0, endSec - startSec), [startSec, endSec]);
  const maxEnd = useMemo(
    () => Math.min(durationSec, startSec + maxDurationSec),
    [durationSec, startSec, maxDurationSec],
  );

  useEffect(() => {
    if (durationHint > 0) return;
    let cancelled = false;
    setLoadingMeta(true);
    void readVideoDurationSec(file, maxDurationSec)
      .then((sec) => {
        if (cancelled) return;
        const safe = Math.max(1, sec);
        setDurationSec(safe);
        setEndSec(Math.min(safe, maxDurationSec));
        setLoadingMeta(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('No se pudo cargar el video. Prueba otro archivo o graba de nuevo.');
        setLoadingMeta(false);
      });
    return () => {
      cancelled = true;
    };
  }, [durationHint, file, maxDurationSec]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || loadingMeta) return;
    video.currentTime = startSec;
  }, [startSec, loadingMeta]);

  useEffect(() => {
    if (endSec > maxEnd) setEndSec(maxEnd);
    if (endSec <= startSec) setEndSec(Math.min(startSec + 1, maxEnd));
  }, [endSec, maxEnd, startSec]);

  async function handleSave() {
    if (clipDuration < 1) {
      setError('El clip debe durar al menos 1 segundo.');
      return;
    }
    if (clipDuration > maxDurationSec) {
      setError(`Máximo ${maxDurationSec} segundos.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { trimVideoFile } = await import('../../lib/videoTrim');
      const trimmed =
        clipDuration >= durationSec - 0.25 && startSec < 0.25
          ? file
          : await trimVideoFile(file, startSec, endSec);
      onSave(trimmed);
    } catch (err) {
      if (clipDuration >= durationSec - 0.25 && startSec < 0.25) {
        onSave(file);
        return;
      }
      setError(err instanceof Error ? err.message : 'No se pudo recortar el video');
    } finally {
      setBusy(false);
    }
  }

  const panel = (
    <div className="fixed inset-0 z-[130] grid place-items-end bg-black/80 p-0 backdrop-blur-sm sm:place-items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-4 sm:rounded-3xl sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <Scissors size={18} className="text-cyan-300" />
          <h3 className="text-lg font-bold text-white">{title}</h3>
        </div>
        <p className="text-xs text-zinc-400">
          Elige el tramo de 1 a {maxDurationSec} s que quieres publicar.
        </p>

        <video
          ref={videoRef}
          src={previewUrl}
          className="mt-4 max-h-[40dvh] w-full rounded-2xl bg-black object-contain"
          controls
          playsInline
          muted
        />

        {loadingMeta ? (
          <p className="mt-3 text-center text-xs text-zinc-500">Cargando video…</p>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-semibold text-zinc-400">
              Inicio: {startSec.toFixed(1)} s
              <input
                type="range"
                min={0}
                max={Math.max(0, durationSec - 1)}
                step={0.1}
                value={startSec}
                onChange={(event) => setStartSec(Number(event.target.value))}
                className="mt-1 w-full accent-cyan-400"
                disabled={loadingMeta}
              />
            </label>
            <label className="block text-xs font-semibold text-zinc-400">
              Fin: {endSec.toFixed(1)} s
              <input
                type="range"
                min={Math.min(durationSec, startSec + 1)}
                max={maxEnd}
                step={0.1}
                value={endSec}
                onChange={(event) => setEndSec(Number(event.target.value))}
                className="mt-1 w-full accent-fuchsia-400"
                disabled={loadingMeta}
              />
            </label>
            <p className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-center text-sm font-semibold text-cyan-200">
              Duración del clip: {clipDuration.toFixed(1)} s / {maxDurationSec} s
            </p>
          </div>
        )}

        {error ? <p className="mt-2 text-sm text-fuchsia-400">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-zinc-400">
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || loadingMeta}
            onClick={() => void handleSave()}
            className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-bold text-zinc-950 disabled:opacity-60"
          >
            {busy ? 'Procesando…' : 'Usar este tramo'}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return panel;
  return createPortal(panel, document.body);
}
