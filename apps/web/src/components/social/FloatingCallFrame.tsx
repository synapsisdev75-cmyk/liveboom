import { Maximize2, Minimize2, X } from 'lucide-react';
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { BRAND_LOGO_SRC } from '../../lib/brand';

type Pos = { x: number; y: number };
type Size = { w: number; h: number };

let sessionPos: Pos | null = null;
let sessionSize: Size | null = null;
let expandedPos: Pos | null = null;

export type CallChrome = 'normal' | 'minimized' | 'maximized' | 'hidden';

const CHROME_KEY = 'lb.floatCall.chrome';

export function readCallChrome(): CallChrome {
  try {
    const value = sessionStorage.getItem(CHROME_KEY);
    if (value === 'minimized' || value === 'maximized' || value === 'normal') return value;
    if (value === 'floating') return 'normal';
  } catch {
    /* ignore */
  }
  return 'normal';
}

export function writeCallChrome(value: CallChrome) {
  try {
    sessionStorage.setItem(CHROME_KEY, value === 'hidden' ? 'normal' : value);
  } catch {
    /* ignore */
  }
}

export function clearCallChrome() {
  try {
    sessionStorage.removeItem(CHROME_KEY);
  } catch {
    /* ignore */
  }
}

export function clearFloatingCallPosition() {
  sessionPos = null;
  sessionSize = null;
  expandedPos = null;
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
  const keyboard = Math.max(0, window.innerHeight - (window.visualViewport?.height ?? window.innerHeight));
  return {
    top: Math.max(10, safeTop + 8),
    right: Math.max(10, safeRight + 8),
    bottom: Math.max(10, safeBottom + 8 + Math.min(keyboard, 280)),
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

function chatBox() {
  const host = document.getElementById('lb-chat-call-host');
  if (!host) return null;
  const rect = host.getBoundingClientRect();
  if (rect.width < 96 || rect.height < 96) return null;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom,
  };
}

function composerReserve(hasChat: boolean) {
  if (!hasChat) return window.matchMedia('(max-width: 767px)').matches ? 72 : 24;
  return window.matchMedia('(max-width: 767px)').matches ? 92 : 80;
}

function defaultPos(width: number, height: number, compact: boolean): Pos {
  const view = viewBox();
  const chat = chatBox();
  const box = chat ?? view;
  const m = margins();
  const bottomGap = Math.max(m.bottom, composerReserve(Boolean(chat)));
  if (compact) {
    return clampPos(
      {
        x: box.right - m.right - width,
        y: box.bottom - bottomGap - height,
      },
      width,
      height,
    );
  }
  const usableTop = box.top + m.top;
  const usableBottom = box.bottom - bottomGap;
  const y = usableTop + Math.round((usableBottom - usableTop - height) / 2);
  return clampPos(
    {
      x: box.left + Math.round((box.width - width) / 2),
      y,
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
  if (
    el.closest(
      '.lb-call-video-local, .lb-call-more, .lb-call-device-bar, .lb-call-controls, .lb-video-controls, .lb-voice-card__controls, .lb-voice-follow, .lb-voice-mini__gift, .lb-voice-mini__dots, .lb-voice-mini__menu, .lb-video-mini__end, .lb-video-chip, .lb-video-sheet, .lb-video-sheet-backdrop, .lb-call-resize',
    )
  ) {
    return false;
  }
  const handle = el.closest('[data-call-drag]');
  const control = el.closest('button, [role="button"]');
  if (control && handle !== control) return false;
  if (handle) return true;
  return !control;
}

export function CallWinBar({
  onMinimize,
  onMaximize,
  onClose,
  maximized,
  showMaximize = true,
}: {
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  maximized?: boolean;
  showMaximize?: boolean;
}) {
  return (
    <div className="lb-call-winbar" data-call-drag>
      <img src={BRAND_LOGO_SRC} alt="LiveBoom" className="lb-call-winbar__logo" draggable={false} />
      <div className="lb-call-winbar__btns">
        {onMinimize ? (
          <button type="button" className="lb-call-winbtn" data-no-drag onClick={onMinimize} aria-label="Minimizar">
            <Minimize2 size={14} />
          </button>
        ) : null}
        {showMaximize && onMaximize ? (
          <button
            type="button"
            className="lb-call-winbtn"
            data-no-drag
            onClick={onMaximize}
            aria-label={maximized ? 'Restaurar' : 'Maximizar'}
          >
            <Maximize2 size={14} />
          </button>
        ) : null}
        {onClose ? (
          <button type="button" className="lb-call-winbtn lb-call-winbtn--close" data-no-drag onClick={onClose} aria-label="Cerrar">
            <X size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function FloatingCallFrame({
  children,
  compact = false,
  video = false,
  maximized = false,
  incoming = false,
  parked = false,
  onReady,
}: {
  children: ReactNode;
  compact?: boolean;
  video?: boolean;
  maximized?: boolean;
  incoming?: boolean;
  parked?: boolean;
  onReady?: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [pos, setPos] = useState<Pos | null>(sessionPos);
  const [size, setSize] = useState<Size | null>(compact ? null : sessionSize);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origW: number;
    origH: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const lastMode = useRef({ compact, video, maximized, incoming });

  const applySize = useCallback(() => {
    const node = frameRef.current;
    if (!node) return;
    onReadyRef.current?.();
    if (parked) return;
    const chat = chatBox();
    if (maximized) {
      const box = chat ?? (() => {
        const view = viewBox();
        const m = margins();
        const bottom = Math.max(m.bottom, composerReserve(false));
        return {
          left: view.left + m.left,
          top: view.top + m.top,
          width: Math.max(280, view.width - m.left - m.right),
          height: Math.max(240, view.height - m.top - m.bottom - bottom + m.bottom),
        };
      })();
      const next = { x: box.left, y: box.top };
      const dim = { w: Math.max(96, box.width), h: Math.max(96, box.height) };
      sessionPos = next;
      sessionSize = dim;
      setPos(next);
      setSize(dim);
      return;
    }
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    if (!width || !height) return;
    setPos((prev) => {
      const modeChanged =
        lastMode.current.compact !== compact ||
        lastMode.current.video !== video ||
        lastMode.current.maximized !== maximized ||
        lastMode.current.incoming !== incoming;
      const wasCompact = lastMode.current.compact;
      lastMode.current = { compact, video, maximized, incoming };
      let base: Pos;
      if (modeChanged && compact && !wasCompact) {
        expandedPos = prev ?? sessionPos;
        base = defaultPos(width, height, true);
      } else if (modeChanged && !compact && wasCompact) {
        base = expandedPos ?? defaultPos(width, height, false);
      } else if (modeChanged) {
        base = prev ?? sessionPos ?? defaultPos(width, height, compact);
      } else {
        base = prev ?? sessionPos ?? defaultPos(width, height, compact);
      }
      const next = clampPos(base, width, height);
      sessionPos = next;
      return next;
    });
  }, [compact, video, maximized, incoming, parked]);

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
    const host = document.getElementById('lb-chat-call-host');
    const ro = host && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(applySize) : null;
    if (host && ro) ro.observe(host);
    return () => {
      node?.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('resize', applySize);
      window.removeEventListener('orientationchange', applySize);
      window.visualViewport?.removeEventListener('resize', applySize);
      window.visualViewport?.removeEventListener('scroll', applySize);
      ro?.disconnect();
    };
  }, [applySize, compact, video, maximized, incoming, parked]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (maximized || parked) return;
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
    const resize = resizeRef.current;
    if (resize && resize.pointerId === event.pointerId) {
      const node = frameRef.current;
      if (!node) return;
      const box = viewBox();
      const m = margins();
      const minW = video ? 280 : 240;
      const minH = video ? 240 : 120;
      const maxW = Math.max(minW, box.width - m.left - m.right);
      const maxH = Math.max(minH, box.height - m.top - m.bottom);
      const next = {
        w: Math.min(maxW, Math.max(minW, resize.origW + event.clientX - resize.startX)),
        h: Math.min(maxH, Math.max(minH, resize.origH + event.clientY - resize.startY)),
      };
      sessionSize = next;
      setSize(next);
      setPos((prev) => {
        const base = prev ?? sessionPos ?? { x: node.offsetLeft, y: node.offsetTop };
        const clamped = clampPos(base, next.w, next.h);
        sessionPos = clamped;
        return clamped;
      });
      return;
    }
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
    if (resizeRef.current && resizeRef.current.pointerId === event.pointerId) {
      resizeRef.current = null;
      try {
        frameRef.current?.releasePointerCapture(event.pointerId);
      } catch {
        /* ya soltado */
      }
      return;
    }
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

  function onResizeDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (event.button != null && event.button !== 0) return;
    const node = frameRef.current;
    if (!node) return;
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origW: node.offsetWidth,
      origH: node.offsetHeight,
    };
    node.setPointerCapture(event.pointerId);
  }

  const canResize = video && !compact && !maximized && !parked;

  return (
    <div className="lb-call-float-root" data-call-overlay-root>
      <div
        ref={frameRef}
        className={`lb-call-float${compact ? ' is-compact' : ' is-normal'}${video ? ' is-video' : ''}${
          maximized ? ' is-maximized' : ''
        }${incoming ? ' is-incoming' : ''}${parked ? ' is-parked' : ''}${pos ? '' : ' is-measure'}`}
        style={{
          ...(pos ? { left: pos.x, top: pos.y } : null),
          ...((maximized || canResize) && size ? { width: size.w, height: size.h } : null),
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {children}
        {canResize ? (
          <button
            type="button"
            className="lb-call-resize"
            data-no-drag
            aria-label="Redimensionar"
            onPointerDown={onResizeDown}
          />
        ) : null}
      </div>
    </div>
  );
}
