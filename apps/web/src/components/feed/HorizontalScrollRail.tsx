import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
  ariaLabel: string;
};

/** Carrusel horizontal con snap, swipe y flechas en desktop. */
export function HorizontalScrollRail({ children, className = '', ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(maxScroll > 8 && el.scrollLeft < maxScroll - 8);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = ref.current;
    if (!el) return;

    el.addEventListener('scroll', updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      observer.disconnect();
    };
  }, [children, updateScrollState]);

  function scrollByPage(direction: -1 | 1) {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.82, behavior: 'smooth' });
  }

  return (
    <div className="relative min-w-0">
      {canScrollLeft ? (
        <button
          type="button"
          onClick={() => scrollByPage(-1)}
          aria-label="Anterior"
          className="absolute left-0 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-zinc-950/90 text-white shadow-lg backdrop-blur-sm transition hover:border-cyan-400/40 hover:text-cyan-200 md:grid"
        >
          <ChevronLeft size={18} />
        </button>
      ) : null}
      {canScrollRight ? (
        <button
          type="button"
          onClick={() => scrollByPage(1)}
          aria-label="Siguiente"
          className="absolute right-0 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-zinc-950/90 text-white shadow-lg backdrop-blur-sm transition hover:border-cyan-400/40 hover:text-cyan-200 md:grid"
        >
          <ChevronRight size={18} />
        </button>
      ) : null}
      <div
        ref={ref}
        role="list"
        aria-label={ariaLabel}
        className={`gift-row -mx-0.5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-0.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
