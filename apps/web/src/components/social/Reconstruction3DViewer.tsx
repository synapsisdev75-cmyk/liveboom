import { Fullscreen, Maximize2, Minus, Plus, RotateCcw, Scan } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  DEFAULT_RECONSTRUCTION_EDIT,
  reconstructionEditCssFilter,
  type Reconstruction3DEdit,
  type Reconstruction3DPayload,
} from '../../lib/reconstruction3d/types';
import { Reconstruction3DBadge } from './Reconstruction3DBadge';

type Props = {
  payload: Reconstruction3DPayload;
  edit?: Reconstruction3DEdit;
  onEditChange?: (next: Reconstruction3DEdit) => void;
  interactive?: boolean;
  showBadge?: boolean;
  className?: string;
  compact?: boolean;
  shading?: 'mesh' | 'textured' | 'realistic';
};

function prefersLiteViewer() {
  if (typeof navigator === 'undefined') return false;
  const cores = Number(navigator.hardwareConcurrency || 8);
  const memory = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8);
  return cores <= 4 || memory <= 4;
}

export function Reconstruction3DViewer({
  payload,
  edit = DEFAULT_RECONSTRUCTION_EDIT,
  onEditChange,
  interactive = true,
  showBadge = true,
  className = '',
  compact = false,
  shading = 'textured',
}: Props) {
  const frames = payload.frameUrls.length ? payload.frameUrls : payload.previewUrl ? [payload.previewUrl] : [];
  const lite = prefersLiteViewer() && Boolean(payload.videoRenderUrl || payload.previewUrl);
  const [yaw, setYaw] = useState(edit.yaw);
  const [zoom, setZoom] = useState(edit.zoom);
  const [fullscreen, setFullscreen] = useState(false);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setYaw(edit.yaw);
    setZoom(edit.zoom);
  }, [edit.yaw, edit.zoom, payload.id]);

  const frameIndex = useMemo(() => {
    if (frames.length <= 1) return 0;
    const wrapped = ((yaw % 360) + 360) % 360;
    return Math.round((wrapped / 360) * frames.length) % frames.length;
  }, [frames.length, yaw]);

  const commit = useCallback(
    (nextYaw: number, nextZoom: number) => {
      const zoomClamped = Math.min(220, Math.max(70, nextZoom));
      const yawWrapped = ((nextYaw % 360) + 360) % 360;
      setYaw(yawWrapped);
      setZoom(zoomClamped);
      onEditChange?.({ ...edit, yaw: yawWrapped, zoom: zoomClamped });
    },
    [edit, onEditChange],
  );

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive) return;
    dragRef.current = { x: event.clientX, y: event.clientY, yaw, pitch: edit.pitch };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive) return;
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    commit(drag.yaw + dx * 0.45, zoom);
  }

  function onPointerUp() {
    dragRef.current = null;
    pinchRef.current = null;
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!interactive) return;
    event.preventDefault();
    commit(yaw, zoom + (event.deltaY > 0 ? -8 : 8));
  }

  function onTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (event.touches.length === 2) {
    const a = event.touches.item(0);
    const b = event.touches.item(1);
    if (!a || !b) return;
    pinchRef.current = {
      dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      zoom,
    };
    }
  }

  function onTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 2 || !pinchRef.current) return;
    const a = event.touches.item(0);
    const b = event.touches.item(1);
    if (!a || !b) return;
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const next = pinchRef.current.zoom * (dist / Math.max(1, pinchRef.current.dist));
    commit(yaw, next);
  }

  async function toggleFullscreen() {
    const node = rootRef.current;
    if (!node) return;
    if (!document.fullscreenElement) {
      await node.requestFullscreen?.();
      setFullscreen(true);
    } else {
      await document.exitFullscreen?.();
      setFullscreen(false);
    }
  }

  function resetView() {
    commit(0, 100);
    onEditChange?.({ ...edit, yaw: 0, pitch: 8, zoom: 100, panX: 0, panY: 0, scale: 100 });
  }

  const src = frames[frameIndex] || payload.previewUrl;
  if (!src && !payload.videoRenderUrl) return null;

  return (
    <div
      ref={rootRef}
      className={`lb-recon3d-viewer ${compact ? 'lb-recon3d-viewer--compact' : ''} ${fullscreen ? 'is-full' : ''} ${className}`.trim()}
    >
      {showBadge ? <Reconstruction3DBadge className="lb-recon3d-viewer__badge" compact /> : null}
      {lite && payload.videoRenderUrl ? (
        <video
          className="lb-recon3d-viewer__media"
          src={payload.videoRenderUrl}
          poster={payload.previewUrl || undefined}
          muted
          loop
          playsInline
          controls={false}
          autoPlay
        />
      ) : (
        <div
          className="lb-recon3d-viewer__stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          style={{
            filter: [
              reconstructionEditCssFilter({ ...edit, zoom }),
              shading === 'mesh' ? 'grayscale(0.35) contrast(1.55) brightness(0.92)' : '',
              shading === 'realistic' ? 'saturate(1.12) contrast(1.06)' : '',
            ]
              .filter(Boolean)
              .join(' '),
            transform: `scale(${(zoom / 100) * (edit.scale / 100)}) translate(${edit.panX}%, ${edit.panY}%)`,
          }}
        >
          <img src={src || ''} alt="Vista previa 3D" className="lb-recon3d-viewer__media" draggable={false} />
        </div>
      )}
      {interactive ? (
        <div className="lb-recon3d-viewer__controls">
          <button type="button" onClick={() => commit(yaw - 18, zoom)} aria-label="Rotar">
            Rotar
          </button>
          <button type="button" onClick={() => commit(yaw, zoom + 12)} aria-label="Zoom +">
            <Plus size={14} />
          </button>
          <button type="button" onClick={() => commit(yaw, zoom - 12)} aria-label="Zoom -">
            <Minus size={14} />
          </button>
          <button type="button" onClick={() => commit(0, zoom)} aria-label="Centrar">
            <Scan size={14} />
          </button>
          <button type="button" onClick={() => void toggleFullscreen()} aria-label="Pantalla completa">
            {fullscreen ? <Maximize2 size={14} /> : <Fullscreen size={14} />}
          </button>
          <button type="button" onClick={resetView} aria-label="Reiniciar vista">
            <RotateCcw size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
