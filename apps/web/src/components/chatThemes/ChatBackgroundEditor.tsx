import { Crosshair, Minus, Plus, RotateCcw, RotateCw, Smartphone, Monitor, X } from 'lucide-react';
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { clamp } from '../../chatThemes/contrast';
import { useResolveChatTheme } from '../../chatThemes/useChatTheme';
import type { ChatAppearance, ChatCustomBackground } from '../../chatThemes/types';
import { useBackLayer } from '../../lib/backLayer';
import { coverGeometry } from './ChatBackgroundRenderer';
import { ChatThemePreview } from './ChatThemePreview';

type Props = {
  appearance: ChatAppearance;
  initial: ChatCustomBackground;
  onCancel: () => void;
  onConfirm: (background: ChatCustomBackground) => void;
};

type Pointer = { x: number; y: number };

/** Mover, zoom, girar, centrar, oscurecer, desenfocar. Vista previa en vivo con burbujas del tema. */
export function ChatBackgroundEditor({ appearance, initial, onCancel, onConfirm }: Props) {
  useBackLayer(true, onCancel);
  const [bg, setBg] = useState<ChatCustomBackground>(initial);
  const [landscape, setLandscape] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, Pointer>());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  const draft = useMemo(() => ({ ...appearance, customBackground: bg }), [appearance, bg]);
  const resolved = useResolveChatTheme(draft);

  function patch(next: Partial<ChatCustomBackground>) {
    setBg((prev) => ({ ...prev, ...next }));
  }

  function moveBy(dx: number, dy: number) {
    const node = stageRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setBg((prev) => {
      const geo = coverGeometry({ w: rect.width, h: rect.height }, prev);
      return {
        ...prev,
        backgroundPositionX: geo.overflowX > 0.5 ? clamp(prev.backgroundPositionX - (dx / geo.overflowX) * 100, 0, 100) : 50,
        backgroundPositionY: geo.overflowY > 0.5 ? clamp(prev.backgroundPositionY - (dy / geo.overflowY) * 100, 0, 100) : 50,
      };
    });
  }

  function pinchDistance() {
    const [a, b] = Array.from(pointers.current.values());
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      pinchRef.current = { dist: pinchDistance(), zoom: bg.zoom };
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const prev = pointers.current.get(event.pointerId);
    if (!prev) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    if (pointers.current.size >= 2 && pinchRef.current) {
      const dist = pinchDistance();
      const start = pinchRef.current;
      patch({ zoom: clamp((start.zoom * dist) / Math.max(1, start.dist), 1, 4) });
      return;
    }
    moveBy(next.x - prev.x, next.y - prev.y);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    const delta = event.deltaY > 0 ? -0.08 : 0.08;
    setBg((prev) => ({ ...prev, zoom: clamp(prev.zoom + delta, 1, 4) }));
  }

  const rotate = (dir: 1 | -1) =>
    setBg((prev) => ({ ...prev, rotation: (((prev.rotation + dir * 90) % 360) + 360) % 360 as ChatCustomBackground['rotation'] }));

  const panel = (
    <div className="lb-cbe" role="dialog" aria-modal="true" aria-label="Editar mi fondo">
      <div className="lb-cbe__head">
        <button type="button" className="lb-cbe__btn" onClick={onCancel} aria-label="Cancelar">
          <X size={16} />
        </button>
        <p className="lb-cbe__title">Ajustar mi fondo</p>
        <button
          type="button"
          className={`lb-cbe__btn ${!landscape ? 'is-on' : ''}`}
          onClick={() => setLandscape(false)}
          aria-label="Vista vertical"
          aria-pressed={!landscape}
        >
          <Smartphone size={16} />
        </button>
        <button
          type="button"
          className={`lb-cbe__btn ${landscape ? 'is-on' : ''}`}
          onClick={() => setLandscape(true)}
          aria-label="Vista horizontal"
          aria-pressed={landscape}
        >
          <Monitor size={16} />
        </button>
      </div>
      <div className="lb-cbe__main">
        <div className="lb-cbe__stage-wrap">
          <div
            ref={stageRef}
            className={`lb-cbe__stage ${landscape ? 'is-landscape' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            aria-label="Arrastra para mover, pellizca o usa la rueda para acercar"
          >
            <ChatThemePreview resolved={resolved} compact />
          </div>
        </div>
        <div className="lb-cbe__controls">
          <div className="lb-cbe__row">
            <span className="lb-cbe__label">Zoom</span>
            <button type="button" className="lb-cbe__btn" onClick={() => patch({ zoom: clamp(bg.zoom - 0.1, 1, 4) })} aria-label="Alejar">
              <Minus size={14} />
            </button>
            <input
              type="range"
              className="lb-cbe__range"
              min={1}
              max={4}
              step={0.01}
              value={bg.zoom}
              onChange={(event) => patch({ zoom: Number(event.target.value) })}
              aria-label="Zoom"
            />
            <button type="button" className="lb-cbe__btn" onClick={() => patch({ zoom: clamp(bg.zoom + 0.1, 1, 4) })} aria-label="Acercar">
              <Plus size={14} />
            </button>
          </div>
          <div className="lb-cbe__row">
            <span className="lb-cbe__label">Encuadre</span>
            <button type="button" className="lb-cbe__btn" onClick={() => rotate(-1)} aria-label="Girar a la izquierda">
              <RotateCcw size={14} />
            </button>
            <button type="button" className="lb-cbe__btn" onClick={() => rotate(1)} aria-label="Girar a la derecha">
              <RotateCw size={14} />
            </button>
            <button
              type="button"
              className="lb-cbe__btn"
              onClick={() => patch({ backgroundPositionX: 50, backgroundPositionY: 50, zoom: 1 })}
            >
              <Crosshair size={14} />
              Centrar
            </button>
          </div>
          <div className="lb-cbe__row">
            <span className="lb-cbe__label">Oscurecer</span>
            <input
              type="range"
              className="lb-cbe__range"
              min={0}
              max={0.8}
              step={0.01}
              value={bg.overlayOpacity}
              onChange={(event) => patch({ overlayOpacity: Number(event.target.value) })}
              aria-label="Oscurecer"
            />
            <span className="lb-cbe__value">{Math.round(bg.overlayOpacity * 100)}%</span>
          </div>
          <div className="lb-cbe__row">
            <span className="lb-cbe__label">Desenfoque</span>
            <input
              type="range"
              className="lb-cbe__range"
              min={0}
              max={12}
              step={0.5}
              value={bg.blur}
              onChange={(event) => patch({ blur: Number(event.target.value) })}
              aria-label="Desenfoque"
            />
            <span className="lb-cbe__value">{bg.blur}px</span>
          </div>
          <div className="lb-cbe__row">
            <button
              type="button"
              className={`lb-cbe__btn ${bg.autoReadability ? 'is-on' : ''}`}
              aria-pressed={bg.autoReadability}
              onClick={() => patch({ autoReadability: !bg.autoReadability })}
            >
              Mejorar lectura automáticamente
            </button>
          </div>
        </div>
      </div>
      <div className="lb-cbe__foot">
        <button type="button" className="lb-cbe__btn" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="lb-cbe__btn lb-cbe__primary" onClick={() => onConfirm(bg)}>
          Usar este fondo
        </button>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return panel;
  return createPortal(panel, document.body);
}
