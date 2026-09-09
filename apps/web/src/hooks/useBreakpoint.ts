import { useEffect, useState } from 'react';
import { VP_LG, VP_MD, classifyLayoutSurface } from '../responsive/viewport';

/** Breakpoints alineados con Tailwind: md=768, lg=1024 */
export type Breakpoint = 'phone' | 'tablet' | 'desktop';

function readBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'desktop';
  return classifyLayoutSurface(window.innerWidth);
}

/** Hook compartido para layout responsive (sidebar lg, rails lg, touch lg). */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(readBreakpoint);

  useEffect(() => {
    const tabletMq = window.matchMedia(`(min-width: ${VP_MD}px)`);
    const desktopMq = window.matchMedia(`(min-width: ${VP_LG}px)`);
    const onChange = () => setBreakpoint(readBreakpoint());
    tabletMq.addEventListener('change', onChange);
    desktopMq.addEventListener('change', onChange);
    return () => {
      tabletMq.removeEventListener('change', onChange);
      desktopMq.removeEventListener('change', onChange);
    };
  }, []);

  return breakpoint;
}

export function useIsMobile(): boolean {
  const bp = useBreakpoint();
  return bp === 'phone';
}

export function useIsDesktop(): boolean {
  const bp = useBreakpoint();
  return bp === 'desktop';
}
