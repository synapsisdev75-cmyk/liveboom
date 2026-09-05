import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { X } from 'lucide-react';
import type { MediaOverlayItem } from '../../lib/mediaOverlays';

type Props = {
  overlays: MediaOverlayItem[];
  editable?: boolean;
  onChange?: (next: MediaOverlayItem[]) => void;
};

type DragState = {
  id: string;
  mode: 'move' | 'scale' | 'rotate';
  pointerId: number;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origScale: number;
  origRotation: number;
  pinch?: { dist: number; scale: number };
};

export function MediaOverlayLayer({ overlays, editable = false, onChange }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const updateItem = useCallback(
    (id: string, patch: Partial<MediaOverlayItem>) => {
      onChange?.(overlays.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    },
    [onChange, overlays],
  );

  function removeItem(id: string) {
    onChange?.(overlays.filter((item) => item.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function onPointerDown(event: ReactPointerEvent, item: MediaOverlayItem, mode: 'move' | 'scale' | 'rotate') {
    if (!editable) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setSelectedId(item.id);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragRef.current = {
      id: item.id,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origX: item.x,
      origY: item.y,
      origScale: item.scale,
      origRotation: item.rotation,
    };
  }

  function onPointerMove(event: ReactPointerEvent) {
    if (!editable || !dragRef.current) return;
    event.stopPropagation();
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const drag = dragRef.current;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size >= 2 && drag.mode === 'move') {
      const pts = [...pointersRef.current.values()];
      const a = pts[0];
      const b = pts[1];
      if (a && b) {
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (!drag.pinch) drag.pinch = { dist: Math.max(8, dist), scale: drag.origScale };
        const nextScale = drag.pinch.scale * (dist / drag.pinch.dist);
        updateItem(drag.id, { scale: Math.max(0.35, Math.min(2.8, nextScale)) });
      }
      return;
    }

    if (event.pointerId !== drag.pointerId) return;
    const dx = (event.clientX - drag.startX) / Math.max(1, rect.width);
    const dy = (event.clientY - drag.startY) / Math.max(1, rect.height);
    if (drag.mode === 'scale') {
      const delta = dx + dy;
      updateItem(drag.id, { scale: Math.max(0.35, Math.min(2.8, drag.origScale + delta * 2.2)) });
      return;
    }
    if (drag.mode === 'rotate') {
      const cx = rect.left + drag.origX * rect.width;
      const cy = rect.top + drag.origY * rect.height;
      const start = Math.atan2(drag.startY - cy, drag.startX - cx);
      const next = Math.atan2(event.clientY - cy, event.clientX - cx);
      updateItem(drag.id, { rotation: drag.origRotation + ((next - start) * 180) / Math.PI });
      return;
    }
    updateItem(drag.id, {
      x: Math.max(0.06, Math.min(0.94, drag.origX + dx)),
      y: Math.max(0.06, Math.min(0.94, drag.origY + dy)),
    });
  }

  function onPointerUp(event: ReactPointerEvent) {
    pointersRef.current.delete(event.pointerId);
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  if (overlays.length === 0) return null;

  return (
    <div
      ref={boxRef}
      className="pointer-events-none absolute inset-0 z-[5] overflow-hidden"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {overlays.map((item) => {
        const selected = editable && selectedId === item.id;
        return (
          <div
            key={item.id}
            data-overlay-item="true"
            className={`absolute left-0 top-0 ${editable ? 'pointer-events-auto cursor-grab touch-none active:cursor-grabbing' : 'pointer-events-none'}`}
            style={{
              width: `${18 * item.scale}%`,
              transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
              left: `${item.x * 100}%`,
              top: `${item.y * 100}%`,
            }}
            onPointerDown={(event) => onPointerDown(event, item, 'move')}
          >
            {item.kind === 'text' || item.text ? (
              <p className="select-none text-center text-[clamp(0.7rem,4.2vw,1.15rem)] font-black italic leading-none text-fuchsia-300 drop-shadow-[0_0_10px_rgba(236,72,153,0.85)]">
                {item.text || 'STICKER'}
              </p>
            ) : (
              <img
                src={item.src}
                alt=""
                draggable={false}
                className="pointer-events-none h-auto w-full select-none object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]"
              />
            )}
            {selected ? (
              <>
                <button
                  type="button"
                  className="absolute -right-2 -top-2 grid h-11 w-11 place-items-center rounded-full bg-black/80 text-white"
                  aria-label="Quitar"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    removeItem(item.id);
                  }}
                >
                  <X size={14} />
                </button>
                <button
                  type="button"
                  className="absolute -bottom-1.5 -left-1.5 h-5 w-5 rounded-full border-2 border-white bg-violet-400 shadow sm:h-4 sm:w-4"
                  aria-label="Rotar"
                  onPointerDown={(event) => onPointerDown(event, item, 'rotate')}
                />
                <button
                  type="button"
                  className="absolute -bottom-1.5 -right-1.5 h-5 w-5 rounded-sm border-2 border-white bg-fuchsia-400 shadow sm:h-4 sm:w-4"
                  aria-label="Cambiar tamaño"
                  onPointerDown={(event) => onPointerDown(event, item, 'scale')}
                />
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
