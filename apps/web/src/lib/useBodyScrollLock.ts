import { useEffect } from 'react';

/** Evita scroll del fondo mientras un overlay/modal está abierto. */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
    };
  }, [active]);
}
