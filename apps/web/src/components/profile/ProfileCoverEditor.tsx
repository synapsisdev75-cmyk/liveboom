import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  COVER_ASPECT,
  COVER_DURATION_MAX,
  COVER_DURATION_MIN,
  COVER_HEIGHT,
  COVER_WIDTH,
  DEFAULT_COVER_CROP,
  clampCoverCrop,
  coverDrawRect,
  exportCoverFile,
  probeCoverFile,
  type CoverCrop,
  type CoverMediaKind,
  type CoverProbe,
} from '../../lib/profileCover';
import { saveFirestoreCover } from '../../lib/profileFirestore';
import { uploadUserCover } from '../../lib/storage';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';

type Props = {
  uid: string;
  file: File | null;
  onClose: () => void;
  onSaved: (coverUrl: string, coverType: CoverMediaKind) => void;
};

export function ProfileCoverEditor({ uid, file, onClose, onSaved }: Props) {
  const [probe, setProbe] = useState<CoverProbe | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<CoverCrop>(DEFAULT_COVER_CROP);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  useBodyScrollLock(true);

  useEffect(() => {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;

    const locked: Array<{ el: HTMLElement; overflow: string; top: number }> = [];
    document.querySelectorAll('main').forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      locked.push({ el: node, overflow: node.style.overflow, top: node.scrollTop });
      node.style.overflow = 'hidden';
    });

    return () => {
      locked.forEach(({ el, overflow, top }) => {
        el.style.overflow = overflow;
        el.scrollTop = top;
      });
      openerRef.current?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (!file) return;
    let revoked = false;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setCrop(DEFAULT_COVER_CROP);
    setError(null);
    void probeCoverFile(file)
      .then((next) => {
        if (!revoked) setProbe(next);
      })
      .catch((err) => {
        if (!revoked) setError(err instanceof Error ? err.message : 'No se pudo leer el archivo');
      });
    return () => {
      revoked = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  if (!file) return null;

  const motion = probe?.kind === 'video' || probe?.kind === 'gif';
  const durationHint =
    motion && probe?.durationSec != null
      ? probe.durationSec < COVER_DURATION_MIN || probe.durationSec > COVER_DURATION_MAX
        ? `Recomendado: ${COVER_DURATION_MIN}–${COVER_DURATION_MAX} s (este archivo dura ${Math.round(probe.durationSec)} s).`
        : null
      : motion
        ? `Recomendado: ${COVER_DURATION_MIN}–${COVER_DURATION_MAX} s, en bucle.`
        : null;

  function patchCrop(next: Partial<CoverCrop>) {
    setCrop((current) => clampCoverCrop({ ...current, ...next }));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, panX: crop.panX, panY: crop.panY };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !stageRef.current || !probe) return;
    const box = stageRef.current.getBoundingClientRect();
    const dx = (event.clientX - dragRef.current.x) / Math.max(1, box.width);
    const dy = (event.clientY - dragRef.current.y) / Math.max(1, box.height);
    patchCrop({
      panX: dragRef.current.panX + dx * 2,
      panY: dragRef.current.panY + dy * 2,
    });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  async function save() {
    if (!probe || !file) return;
    setBusy(true);
    setError(null);
    try {
      const exported = await exportCoverFile(file, probe, crop);
      const url = await uploadUserCover(uid, exported.blob, exported.ext, exported.kind);
      await saveFirestoreCover(uid, url, exported.kind);
      onSaved(url, exported.kind);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la portada');
    } finally {
      setBusy(false);
    }
  }

  const mediaStyle = probe
    ? (() => {
        const rect = coverDrawRect(probe.width, probe.height, crop);
        const scale = 100 / COVER_WIDTH;
        return {
          width: `${rect.drawW * scale}%`,
          height: `${(rect.drawH / COVER_HEIGHT) * 100}%`,
          left: `${rect.x * scale}%`,
          top: `${(rect.y / COVER_HEIGHT) * 100}%`,
        };
      })()
    : undefined;

  const overlay = (
    <div
      className="lb-profile-cover-editor"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lb-cover-title"
    >
      <div className="lb-profile-cover-editor__panel">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 id="lb-cover-title" className="text-sm font-bold text-white">
              Editar portada
            </h2>
            <p className="text-[11px] text-zinc-500">
              Resultado {COVER_WIDTH} × {COVER_HEIGHT} px ({COVER_ASPECT.toFixed(2)}:1)
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center text-zinc-400" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div
          ref={stageRef}
          className="lb-profile-cover-editor__stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {previewUrl && probe ? (
            probe.kind === 'video' ? (
              <video
                src={previewUrl}
                className="lb-profile-cover-editor__media"
                style={mediaStyle}
                autoPlay
                muted
                loop
                playsInline
              />
            ) : (
              <img src={previewUrl} alt="" className="lb-profile-cover-editor__media" style={mediaStyle} />
            )
          ) : (
            <p className="p-6 text-xs text-zinc-500">Leyendo archivo…</p>
          )}
        </div>

        <label className="mt-3 block">
          <span className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
            Zoom
            <span className="tabular-nums text-zinc-300">{crop.zoom.toFixed(2)}×</span>
          </span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={crop.zoom}
            onChange={(event) => patchCrop({ zoom: Number(event.target.value) })}
            className="w-full"
          />
        </label>
        <p className="mt-1 text-[11px] text-zinc-500">Arrastra para mover y definir el punto focal.</p>
        {durationHint ? <p className="mt-1 text-[11px] text-amber-300">{durationHint}</p> : null}
        {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-full px-4 text-sm text-zinc-300">
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || !probe}
            onClick={() => void save()}
            className="lb-gradient-btn min-h-11 rounded-full px-5 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy ? 'Guardando…' : 'Guardar portada'}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
}

export { COVER_ACCEPT } from '../../lib/profileCover';
