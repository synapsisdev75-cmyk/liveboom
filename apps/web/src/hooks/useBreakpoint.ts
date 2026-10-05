import { useEffect, useState } from 'react';
import { TOUCH_PORTRAIT_QUERY, VP_LG, VP_MD, readLayoutSurface } from '../responsive/viewport';

/** Breakpoints alineados con Tailwind: md=768, lg=1024 (táctil vertical = phone) */
export type Breakpoint = 'phone' | 'tablet' | 'desktop';

function readBreakpoint(): Breakpoint {
  return readLayoutSurface();
}

/** Hook compartido para layout responsive (sidebar lg, rails lg, touch lg). */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(readBreakpoint);

  useEffect(() => {
    const queries = [`(min-width: ${VP_MD}px)`, `(min-width: ${VP_LG}px)`, TOUCH_PORTRAIT_QUERY].map((q) =>
      window.matchMedia(q),
    );
    const onChange = () => setBreakpoint(readBreakpoint());
    queries.forEach((mq) => mq.addEventListener('change', onChange));
    return () => {
      queries.forEach((mq) => mq.removeEventListener('change', onChange));
    };
  }, []);

  return breakpoint;
}

export function useIsMobile(): boolean {
  const bp = useBreakpoint();
  // Producto: tablet = móvil (misma lógica que teléfono). Solo desktop queda fuera.
  return bp === 'phone' || bp === 'tablet';
}

export function useIsDesktop(): boolean {
  const bp = useBreakpoint();
  return bp === 'desktop';
}
