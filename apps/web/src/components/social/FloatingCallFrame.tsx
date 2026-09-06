import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';

type Pos = { x: number; y: number };

let sessionPos: Pos | null = null;

export function clearFloatingCallPosition() {
  sessionPos = null;
}

function viewBox() {
  const vv = window.visualViewport;
  const left = vv?.offsetLeft ?? 0;
  const top = vv?.offsetTop ?? 0;
  const width = vv?.width ?? window.innerWidth;
  const height = vv?.height ?? window.innerHeight;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function margins() {
  const root = getComputedStyle(document.documentElement);
  const safeTop = Number.parseFloat(root.getPropertyValue('--lb-safe-top')) || 0;
  const safeRight = Number.parseFloat(root.getPropertyValue('--lb-safe-right')) || 0;
  const safeBottom = Number.parseFloat(root.getPropertyValue('--lb-safe-bottom')) || 0;
  const safeLeft = Number.parseFloat(root.getPropertyValue('--lb-safe-left')) || 0;
  return {
    top: Math.max(10, safeTop + 8),
    right: Math.max(10, safeRight + 8),
    bottom: Math.max(10, safeBottom + 8),
    left: Math.max(10, safeLeft + 8),
  };
}

function clampPos(pos: Pos, width: number, height: number): Pos {
  const box = viewBox();
  const m = margins();
  const minX = box.left + m.left;
  const minY = box.top + m.top;
  const maxX = box.right - m.right - width;
  const maxY = box.bottom - m.bottom - height;
  return {
    x: Math.min(Math.max(pos.x, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(pos.y, minY), Math.max(minY, maxY)),
  };
}

function defaultPos(width: number, height: number, compact: boolean): Pos {
  const box = viewBox();
  const m = margins();
  if (compact) {
    return clampPos(
      {
        x: box.right - m.right - width,
        y: box.top + m.top,
      },
      width,
      height,
    );
  }
  return clampPos(
    {
      x: box.left + Math.round((box.width - width) / 2),
      y: box.top + Math.round((box.height - height) / 2),
    },
    width,
    height,
  );
}

function snapIfNearEdge(pos: Pos, width: number, height: number): Pos {
  const box = viewBox();
  const m = margins();
  const threshold = 28;
  const minX = box.left + m.left;
  const minY = box.top + m.top;
  const maxX = box.right - m.right - width;
  const maxY = box.bottom - m.bottom - height;
  let { x, y } = pos;
  if (x - minX <= threshold) x = minX;
  else if (maxX - x <= threshold) x = Math.max(minX, maxX);
  if (y - minY <= threshold) y = minY;
  else if (maxY - y <= threshold) y = Math.max(minY, maxY);
  return { x, y };
}

function isDragFrom(target: EventTarget | null) {
  const el = target instanceof Element ? target : null;
  if (!el) return false;
  if (el.closest('[data-no-drag]')) return false;
  if (el.closest('a, input, textarea, select, option')) return false;
  if (el.closest('.lb-call-video-local, .lb-call-more, .lb-call-device-bar, .lb-call-controls, .lb-video-controls, .lb-voice-card__controls, .lb-voice-follow, .lb-voice-mini__gift, .lb-voice-mini__dots, .lb-voice-mini__menu, .lb-video-sheet, .lb-video-sheet-backdrop')) {
    return false;
  }
  const handle = el.closest('[data-call-drag]');
  const control = el.closest('button, [role="button"]');
  if (control && handle !== control) return false;
  if (handle) return true;
  return !control;
}

export function FloatingCallFrame({
  children,
  compact = false,
  video = false,
}: {
  children: ReactNode;
  compact?: boolean;
  video?: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(sessionPos);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const lastMode = useRef({ compact, video });

  const applySize = useCallback(() => {
    const node = frameRef.current;
    if (!node) return;
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    if (!width || !height) return;
    setPos((prev) => {
      const modeChanged =
        lastMode.current.compact !== compact || lastMode.current.video !== video;
      lastMode.current = { compact, video };
      const base = modeChanged
        ? defaultPos(width, height, compact)
        : prev ?? sessionPos ?? defaultPos(width, height, compact);
      const next = clampPos(base, width, height);
      sessionPos = next;
      return next;
    });
  }, [compact, video]);

  useLayoutEffect(() => {
    applySize();
    const node = frameRef.current;
    const onClickCapture = (event: MouseEvent) => {
      if (!suppressClickRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
    };
    node?.addEventListener('click', onClickCapture, true);
    window.addEventListener('resize', applySize);
    window.addEventListener('orientationchange', applySize);
    window.visualViewport?.addEventListener('resize', applySize);
    window.visualViewport?.addEventListener('scroll', applySize);
    return () => {
      node?.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('resize', applySize);
      window.removeEventListener('orientationchange', applySize);
      window.visualViewport?.removeEventListener('resize', applySize);
      window.visualViewport?.removeEventListener('scroll', applySize);
    };
  }, [applySize, compact, video]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button != null && event.button !== 0) return;
    if (!isDragFrom(event.target)) return;
    const node = frameRef.current;
    if (!node) return;
    const current = pos ?? { x: node.offsetLeft, y: node.offsetTop };
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origX: current.x,
      origY: current.y,
      moved: false,
    };
    node.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const node = frameRef.current;
    if (!node) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) drag.moved = true;
    const next = clampPos(
      { x: drag.origX + dx, y: drag.origY + dy },
      node.offsetWidth,
      node.offsetHeight,
    );
    sessionPos = next;
    setPos(next);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const node = frameRef.current;
    dragRef.current = null;
    try {
      node?.releasePointerCapture(event.pointerId);
    } catch {
      /* ya soltado */
    }
    if (drag.moved) {
      suppressClickRef.current = true;
      if (node) {
        const snapped = snapIfNearEdge(
          pos ?? { x: drag.origX, y: drag.origY },
          node.offsetWidth,
          node.offsetHeight,
        );
        sessionPos = snapped;
        setPos(snapped);
      }
    }
  }

  return (
    <div className="lb-call-float-root">
      <div
        ref={frameRef}
        className={`lb-call-float${compact ? ' is-compact' : ''}${video ? ' is-video' : ''}${
          pos ? '' : ' is-measure'
        }`}
        style={pos ? { left: pos.x, top: pos.y } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {children}
      </div>
    </div>
  );
}
