import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Crosshair, RotateCcw, RotateCw, X } from 'lucide-react';
import './photoCropEditor.css';

export type CropAspectId = 'original' | '1:1' | '4:5' | '3:4' | '9:16' | '16:9' | 'free';

const ASPECTS: Array<{ id: CropAspectId; label: string; ratio: number | null }> = [
  { id: 'free', label: 'Libre', ratio: null },
  { id: 'original', label: 'Original', ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '3:4', label: '3:4', ratio: 3 / 4 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
];

const STAGE_PAD = 20;
const MIN_FRAME = 48;
const MAX_ZOOM = 6;
const EXPORT_MAX_SIDE = 2160;

type Size = { w: number; h: number };
type Point = { x: number; y: number };

type Props = {
  file: File;
  /** "Foto 2 de 5" cuando se recortan varias. */
  progressLabel?: string;
  onConfirm: (file: File) => void;
  /** Cancelar conserva la imagen original. */
  onCancel: () => void;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function rotate(p: Point, rad: number): Point {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Caja que ocupa el marco medida en los ejes de la imagen girada. */
function frameExtents(frame: Size, rad: number): Size {
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return { w: frame.w * c + frame.h * s, h: frame.w * s + frame.h * c };
}

function coverScale(frame: Size, img: Size, rad: number): number {
  const ext = frameExtents(frame, rad);
  return Math.max(ext.w / img.w, ext.h / img.h);
}

function clampCenter(center: Point, frame: Size, img: Size, rad: number, scale: number): Point {
  const ext = frameExtents(frame, rad);
  const mx = Math.max(0, (img.w - ext.w / scale) / 2);
  const my = Math.max(0, (img.h - ext.h / scale) / 2);
  return { x: clamp(center.x, -mx, mx), y: clamp(center.y, -my, my) };
}

function fitFrame(avail: Size, ratio: number): Size {
  const w = Math.min(avail.w, avail.h * ratio);
  return { w, h: w / ratio };
}

function outputName(name: string, type: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'foto';
  return `${base}-recorte.${type === 'image/png' ? 'png' : 'jpg'}`;
}

/**
 * Recorte a pantalla completa: mover, zoom (rueda/pellizco/slider), rotar 90° y enderezar,
 * centrar, restablecer y proporciones. La imagen final se genera una sola vez al confirmar.
 */
export function PhotoCropEditor({ file, progressLabel, onConfirm, onCancel }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [stage, setStage] = useState<Size>({ w: 0, h: 0 });
  const [aspect, setAspect] = useState<CropAspectId>('free');
  /** Marco libre como fracción del área disponible. */
  const [freeFrame, setFreeFrame] = useState<{ fw: number; fh: number } | null>(null);
  const [quarter, setQuarter] = useState(0);
  const [straighten, setStraighten] = useState(0);
  const [zoom, setZoom] = useState(1);
  /** Centro del marco respecto al centro de la imagen, en píxeles originales y ejes de la imagen. */
  const [center, setCenter] = useState<Point>({ x: 0, y: 0 });
  const [exporting, setExporting] = useState(false);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<{ dist: number; mid: Point } | null>(null);
  const cornerRef = useRef<{ pointerId: number } | null>(null);

  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    setImg(null);
    setLoadError(false);
    let cancelled = false;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (!cancelled) setImg(image);
    };
    image.onerror = () => {
      if (!cancelled) setLoadError(true);
    };
    image.src = next;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(next);
    };
  }, [file]);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, [file]);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const natural: Size = useMemo(
    () => (img ? { w: img.naturalWidth || 1, h: img.naturalHeight || 1 } : { w: 1, h: 1 }),
    [img],
  );
  const rad = ((quarter * 90 + straighten) * Math.PI) / 180;
  const swapped = quarter % 2 === 1;
  const originalRatio = swapped ? natural.h / natural.w : natural.w / natural.h;
  const avail: Size = { w: Math.max(MIN_FRAME, stage.w - STAGE_PAD * 2), h: Math.max(MIN_FRAME, stage.h - STAGE_PAD * 2) };

  const frame: Size = useMemo(() => {
    if (aspect === 'free' && freeFrame) {
      return { w: clamp(freeFrame.fw * avail.w, MIN_FRAME, avail.w), h: clamp(freeFrame.fh * avail.h, MIN_FRAME, avail.h) };
    }
    const ratio = ASPECTS.find((a) => a.id === aspect)?.ratio ?? originalRatio;
    return fitFrame(avail, ratio);
  }, [aspect, freeFrame, avail.w, avail.h, originalRatio]);

  const minScale = coverScale(frame, natural, rad);
  const scale = minScale * zoom;
  const safeCenter = clampCenter(center, frame, natural, rad, scale);
  const offset = rotate({ x: -safeCenter.x * scale, y: -safeCenter.y * scale }, rad);
  const fcx = stage.w / 2;
  const fcy = stage.h / 2;

  /** Valores vigentes entre eventos del mismo cuadro (antes de que React vuelva a renderizar). */
  const liveRef = useRef({ zoom, center: safeCenter });
  liveRef.current = { zoom, center: safeCenter };

  /** Zoom (factor) y desplazamiento en pantalla aplicados juntos en una sola actualización. */
  function applyView(zoomFactor: number, dx: number, dy: number) {
    const cur = liveRef.current;
    const z = clamp(cur.zoom * zoomFactor, 1, MAX_ZOOM);
    const s = minScale * z;
    const local = rotate({ x: dx, y: dy }, -rad);
    const next = clampCenter({ x: cur.center.x - local.x / s, y: cur.center.y - local.y / s }, frame, natural, rad, s);
    liveRef.current = { zoom: z, center: next };
    setZoom(z);
    setCenter(next);
  }

  function panBy(dx: number, dy: number) {
    applyView(1, dx, dy);
  }

  function setZoomClamped(next: number) {
    applyView(next / liveRef.current.zoom, 0, 0);
  }

  function chooseAspect(id: CropAspectId) {
    if (id === 'free') setFreeFrame({ fw: frame.w / avail.w, fh: frame.h / avail.h });
    setAspect(id);
  }

  function rotateQuarter(dir: 1 | -1) {
    setQuarter((q) => (q + dir + 4) % 4);
    setFreeFrame(null);
    setCenter({ x: 0, y: 0 });
  }

  function recenter() {
    setCenter({ x: 0, y: 0 });
  }

  function reset() {
    setQuarter(0);
    setStraighten(0);
    setZoom(1);
    setCenter({ x: 0, y: 0 });
    setFreeFrame(null);
    setAspect('free');
  }

  function onStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (cornerRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pair = pointerPair();
    if (pair) gestureRef.current = pair;
  }

  function pointerPair(): { dist: number; mid: Point } | null {
    const [a, b] = [...pointersRef.current.values()];
    if (!a || !b) return null;
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }

  function onStagePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const prev = pointersRef.current.get(event.pointerId);
    if (!prev || cornerRef.current) return;
    const next = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, next);
    const pair = pointersRef.current.size >= 2 ? pointerPair() : null;
    if (pair && gestureRef.current) {
      const g = gestureRef.current;
      applyView(g.dist > 0 ? pair.dist / g.dist : 1, pair.mid.x - g.mid.x, pair.mid.y - g.mid.y);
      gestureRef.current = pair;
      return;
    }
    panBy(next.x - prev.x, next.y - prev.y);
  }

  function onStagePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) gestureRef.current = null;
  }

  function onCornerPointerDown(event: ReactPointerEvent<HTMLSpanElement>) {
    event.stopPropagation();
    if (aspect !== 'free') chooseAspect('free');
    event.currentTarget.setPointerCapture(event.pointerId);
    cornerRef.current = { pointerId: event.pointerId };
  }

  function onCornerPointerMove(event: ReactPointerEvent<HTMLSpanElement>) {
    if (cornerRef.current?.pointerId !== event.pointerId) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const halfW = clamp(Math.abs(event.clientX - rect.left - fcx), MIN_FRAME / 2, avail.w / 2);
    const halfH = clamp(Math.abs(event.clientY - rect.top - fcy), MIN_FRAME / 2, avail.h / 2);
    const nextFrame = { w: halfW * 2, h: halfH * 2 };
    // La imagen conserva su tamaño en pantalla; solo crece si el marco ya no queda cubierto.
    const nextMin = coverScale(nextFrame, natural, rad);
    setZoom(clamp(scale / nextMin, 1, MAX_ZOOM));
    setFreeFrame({ fw: nextFrame.w / avail.w, fh: nextFrame.h / avail.h });
  }

  function onCornerPointerUp(event: ReactPointerEvent<HTMLSpanElement>) {
    if (cornerRef.current?.pointerId === event.pointerId) cornerRef.current = null;
  }

  function onWheel(event: ReactWheelEvent<HTMLDivElement>) {
    applyView(Math.exp(-event.deltaY * 0.0015), 0, 0);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT') return;
    const step = event.shiftKey ? 40 : 12;
    if (event.key === 'Escape') onCancel();
    else if (event.key === 'Enter') void confirm();
    else if (event.key === '+' || event.key === '=') applyView(1.12, 0, 0);
    else if (event.key === '-') applyView(1 / 1.12, 0, 0);
    else if (event.key === 'ArrowLeft') panBy(step, 0);
    else if (event.key === 'ArrowRight') panBy(-step, 0);
    else if (event.key === 'ArrowUp') panBy(0, step);
    else if (event.key === 'ArrowDown') panBy(0, -step);
    else return;
    event.preventDefault();
  }

  const unchanged =
    quarter === 0 &&
    straighten === 0 &&
    zoom === 1 &&
    Math.abs(safeCenter.x) < 0.5 &&
    Math.abs(safeCenter.y) < 0.5 &&
    Math.abs(frame.w / frame.h - natural.w / natural.h) < 0.005;

  async function confirm() {
    if (!img || exporting) return;
    if (unchanged) {
      onConfirm(file);
      return;
    }
    setExporting(true);
    try {
      const cropW = frame.w / scale;
      const cropH = frame.h / scale;
      const k = Math.min(1, EXPORT_MAX_SIDE / Math.max(cropW, cropH));
      const outW = Math.max(1, Math.round(cropW * k));
      const outH = Math.max(1, Math.round(cropH * k));
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      const type = file.type === 'image/png' || file.type === 'image/webp' ? 'image/png' : 'image/jpeg';
      if (type === 'image/jpeg') {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, outW, outH);
      }
      ctx.imageSmoothingQuality = 'high';
      ctx.translate(outW / 2, outH / 2);
      ctx.scale(outW / frame.w, outH / frame.h);
      ctx.translate(offset.x, offset.y);
      ctx.rotate(rad);
      ctx.scale(scale, scale);
      ctx.drawImage(img, -natural.w / 2, -natural.h / 2);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
      if (!blob) throw new Error('blob');
      onConfirm(new File([blob], outputName(file.name, type), { type, lastModified: Date.now() }));
    } catch {
      onConfirm(file);
    } finally {
      setExporting(false);
    }
  }

  const ready = Boolean(img) && stage.w > 0;
  const fx = fcx - frame.w / 2;
  const fy = fcy - frame.h / 2;

  const panel = (
    <div
      className="lb-crop fixed inset-0 z-[140]"
      role="dialog"
      aria-modal="true"
      aria-label="Recortar foto"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      ref={rootRef}
    >
      <header className="lb-crop__bar">
        <button type="button" className="lb-crop__btn" onClick={onCancel} aria-label="Cancelar y conservar la original">
          <X size={18} aria-hidden />
          <span>Cancelar</span>
        </button>
        <p className="lb-crop__title">
          Recortar
          {progressLabel ? <span className="lb-crop__count">{progressLabel}</span> : null}
        </p>
        <button
          type="button"
          className="lb-crop__btn lb-crop__btn--primary"
          onClick={() => void confirm()}
          disabled={!ready || exporting}
        >
          {exporting ? 'Guardando…' : 'Confirmar'}
        </button>
      </header>

      <div
        ref={stageRef}
        className="lb-crop__stage"
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerCancel={onStagePointerUp}
        onWheel={onWheel}
      >
        {loadError ? (
          <div className="lb-crop__error">
            <p>No se pudo abrir esta imagen para recortarla.</p>
            <button type="button" className="lb-crop__btn lb-crop__btn--primary" onClick={() => onConfirm(file)}>
              Usar la original
            </button>
          </div>
        ) : ready && url ? (
          <>
            <img
              src={url}
              alt=""
              draggable={false}
              className="lb-crop__img"
              style={{
                width: natural.w,
                height: natural.h,
                left: fcx - natural.w / 2,
                top: fcy - natural.h / 2,
                transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rad}rad) scale(${scale})`,
              }}
            />
            <div className="lb-crop__frame" style={{ left: fx, top: fy, width: frame.w, height: frame.h }}>
              <span className="lb-crop__grid" aria-hidden />
              {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                <span
                  key={corner}
                  className={`lb-crop__corner lb-crop__corner--${corner}`}
                  onPointerDown={onCornerPointerDown}
                  onPointerMove={onCornerPointerMove}
                  onPointerUp={onCornerPointerUp}
                  onPointerCancel={onCornerPointerUp}
                  aria-hidden
                />
              ))}
            </div>
          </>
        ) : (
          <p className="lb-crop__loading">Cargando foto…</p>
        )}
      </div>

      <footer className="lb-crop__tools">
        <div className="lb-crop__aspects" role="group" aria-label="Proporción">
          {ASPECTS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`lb-crop__chip${aspect === item.id ? ' is-on' : ''}`}
              aria-pressed={aspect === item.id}
              onClick={() => chooseAspect(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="lb-crop__sliders">
          <label className="lb-crop__slider">
            <span>Zoom</span>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoomClamped(Number(event.target.value))}
            />
          </label>
          <label className="lb-crop__slider">
            <span>Enderezar {Math.round(straighten)}°</span>
            <input
              type="range"
              min={-45}
              max={45}
              step={0.5}
              value={straighten}
              onChange={(event) => setStraighten(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="lb-crop__actions">
          <button type="button" className="lb-crop__btn" onClick={() => rotateQuarter(-1)} aria-label="Rotar a la izquierda">
            <RotateCcw size={17} aria-hidden />
          </button>
          <button type="button" className="lb-crop__btn" onClick={() => rotateQuarter(1)} aria-label="Rotar a la derecha">
            <RotateCw size={17} aria-hidden />
          </button>
          <button type="button" className="lb-crop__btn" onClick={recenter}>
            <Crosshair size={17} aria-hidden />
            <span>Centrar</span>
          </button>
          <button type="button" className="lb-crop__btn" onClick={reset}>
            Restablecer
          </button>
        </div>
      </footer>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(panel, document.body) : panel;
}
