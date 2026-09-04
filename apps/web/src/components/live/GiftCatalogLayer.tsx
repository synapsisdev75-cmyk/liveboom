import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';

const PAD = 8;
const Z = 118;
const PREFERRED_W = 360;

function cssPx(value: string) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function readViewportBox() {
  const vv = window.visualViewport;
  const width = vv?.width ?? window.innerWidth;
  const height = vv?.height ?? window.innerHeight;
  const offsetLeft = vv?.offsetLeft ?? 0;
  const offsetTop = vv?.offsetTop ?? 0;
  const root = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const safeL = root ? cssPx(root.getPropertyValue('--lb-safe-left')) : 0;
  const safeR = root ? cssPx(root.getPropertyValue('--lb-safe-right')) : 0;
  const safeT = root ? cssPx(root.getPropertyValue('--lb-safe-top')) : 0;
  const safeB = root ? cssPx(root.getPropertyValue('--lb-safe-bottom')) : 0;
  return {
    left: offsetLeft + Math.max(PAD, safeL),
    top: offsetTop + Math.max(PAD, safeT),
    right: offsetLeft + width - Math.max(PAD, safeR),
    bottom: offsetTop + height - Math.max(PAD, safeB),
  };
}

/** Centra el panel en la zona visible del viewport (no lo ancla a un recorte del feed). */
function fitGiftPanelCentered() {
  const view = readViewportBox();
  const availW = Math.max(220, view.right - view.left);
  const availH = Math.max(240, view.bottom - view.top);
  const width = Math.min(PREFERRED_W, availW);
  const height = Math.min(availH, Math.max(220, Math.min(Math.round(availH * 0.86), 520)));
  const left = view.left + (availW - width) / 2;
  const top = view.top + (availH - height) / 2;
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
  };
}

type Props = {
  open: boolean;
  triggerRef: { current: HTMLElement | null };
  onClose: () => void;
  children: ReactNode;
};

/** Catálogo de regalos en portal: mismo panel en feed y visores, siempre dentro del viewport. */
export function GiftCatalogLayer({ open, onClose, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  useBodyScrollLock(open);

  const updatePosition = useCallback(() => {
    const next = fitGiftPanelCentered();
    setCoords((prev) => {
      if (
        prev &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.width === next.width &&
        prev.height === next.height
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [open, updatePosition]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0" style={{ zIndex: Z }}>
      <button
        type="button"
        className="pointer-events-auto absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        aria-label="Cerrar regalos"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="pointer-events-auto overflow-hidden rounded-2xl border border-white/12 bg-zinc-950/95 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        style={{
          position: 'absolute',
          top: coords?.top ?? 0,
          left: coords?.left ?? 0,
          width: coords?.width ?? PREFERRED_W,
          height: coords?.height ?? 320,
          maxHeight: coords?.height,
          visibility: coords ? 'visible' : 'hidden',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Catálogo de regalos"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="flex h-full min-h-0 flex-col">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
