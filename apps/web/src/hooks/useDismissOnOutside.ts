import { useEffect, type RefObject } from 'react';

let activeCloser: (() => void) | null = null;

/**
 * Cierra un menú/popover con pointerdown fuera del nodo o tecla Escape.
 * Un solo menú de este tipo a la vez: al abrir otro, se cierra el anterior.
 */
export function useDismissOnOutside(
  open: boolean,
  rootRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;

    if (activeCloser && activeCloser !== onClose) activeCloser();
    activeCloser = onClose;

    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (root?.contains(target)) return;
      onClose();
    }

    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      if (activeCloser === onClose) activeCloser = null;
    };
  }, [open, rootRef, onClose]);
}
