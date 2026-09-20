import { useRef, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import {
  clampGiftLayoutScale,
  clampPct,
  giftLayoutMediaStyle,
  isGiftLayoutBleed,
  type GiftLayoutSlot,
} from '../../lib/giftLayout';

type Props = {
  src?: string;
  poster?: string;
  isVideo?: boolean;
  emoji?: string;
  slot: GiftLayoutSlot;
  interactive?: boolean;
  cropMode?: boolean;
  playToken?: number;
  loop?: boolean;
  className?: string;
  onEnded?: () => void;
  onSlotChange?: (patch: Partial<GiftLayoutSlot>) => void;
};

export function GiftLayoutMedia({
  src,
  poster,
  isVideo,
  emoji = '🎁',
  slot,
  interactive = false,
  cropMode = false,
  playToken = 0,
  loop = true,
  className = '',
  onEnded,
  onSlotChange,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const bleed = isGiftLayoutBleed(slot);
  const style = {
    ...giftLayoutMediaStyle(slot),
    willChange: interactive ? 'transform' : undefined,
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || !onSlotChange) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2) {
      const pts = [...pointersRef.current.values()];
      const a = pts[0];
      const b = pts[1];
      if (a && b) {
        pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: slot.scale };
        dragRef.current = null;
        return;
      }
    }
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      cx: cropMode ? slot.cropX : slot.x,
      cy: cropMode ? slot.cropY : slot.y,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onSlotChange) return;
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const pts = [...pointersRef.current.values()];
      const a = pts[0];
      const b = pts[1];
      if (a && b) {
        const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        onSlotChange({
          scale: clampGiftLayoutScale(pinchRef.current.scale * (distance / pinchRef.current.distance), slot.scale),
        });
        return;
      }
    }
    if (!dragRef.current) return;
    const box = stageRef.current?.getBoundingClientRect();
    if (!box || box.width < 8 || box.height < 8) return;
    const dx = ((event.clientX - dragRef.current.x) / box.width) * 100;
    const dy = ((event.clientY - dragRef.current.y) / box.height) * 100;
    if (cropMode) {
      onSlotChange({
        cropX: clampPct(dragRef.current.cx - dx),
        cropY: clampPct(dragRef.current.cy - dy),
      });
      return;
    }
    onSlotChange({
      x: clampPct(dragRef.current.cx + dx),
      y: clampPct(dragRef.current.cy + dy),
    });
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) dragRef.current = null;
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!interactive || !onSlotChange || !event.ctrlKey) return;
    event.preventDefault();
    const next = clampGiftLayoutScale(slot.scale - event.deltaY * 0.001, slot.scale);
    onSlotChange({ scale: next });
  };

  const mediaClass = `lb-gift-layout-media ${bleed ? 'lb-gift-layout-media--bleed' : ''}`;

  return (
    <div
      ref={stageRef}
      className={`lb-gift-layout-stage ${bleed ? 'lb-gift-layout-stage--bleed' : ''} ${
        interactive ? 'is-interactive' : ''
      } ${cropMode ? 'is-cropping' : ''} ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onWheel}
    >
      {src && isVideo ? (
        <video
          key={`${src}-${playToken}`}
          src={src}
          poster={poster}
          autoPlay
          loop={loop}
          muted
          playsInline
          className={mediaClass}
          style={style}
          draggable={false}
          onEnded={onEnded}
        />
      ) : src ? (
        <img src={src} alt="" className={mediaClass} style={style} draggable={false} />
      ) : (
        <span className="lb-gift-layout-emoji" style={style}>
          {emoji}
        </span>
      )}
      {cropMode ? <div className="lb-gift-layout-crop-frame" aria-hidden /> : null}
    </div>
  );
}
