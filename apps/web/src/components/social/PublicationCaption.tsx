import { useLayoutEffect, useRef, useState } from 'react';
import { POST_EMOJI_SIZE } from '../../lib/liveboomEmojis';
import { EmojiText } from './EmojiText';

/**
 * Descripción de Publicación (Inicio, Perfil y Expandir).
 * No usar en Boom Clip, Flash Boom ni LIVE.
 */
export function PublicationCaption({
  caption,
  variant = 'feed',
}: {
  caption: string;
  variant?: 'feed' | 'overlay';
}) {
  const text = String(caption || '').trim();
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const overlay = variant === 'overlay';

  useLayoutEffect(() => {
    setExpanded(false);
  }, [text]);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || expanded) return;

    const measure = () => {
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [text, expanded]);

  if (!text) return null;

  const moreBg = overlay
    ? 'bg-gradient-to-l from-black from-[18%] to-transparent'
    : 'bg-gradient-to-l from-[#09090b] from-[12%] to-transparent';

  return (
    <div
      className={
        overlay
          ? 'publication-caption publication-caption--overlay w-full min-w-0'
          : 'publication-caption min-w-0 px-[clamp(0.75rem,3vw,1rem)] pb-[clamp(0.75rem,2.5vw,1rem)] pt-2'
      }
    >
      <div
        className={`relative min-w-0 ${
          overlay && expanded ? 'publication-caption--overlay-scroll overflow-y-auto overscroll-contain pr-1' : ''
        }`}
      >
        <p
          ref={bodyRef}
          className={`text-[clamp(0.8125rem,2.4vw,0.875rem)] leading-relaxed ${
            overlay ? 'text-white/95 drop-shadow' : 'text-zinc-200'
          } ${expanded ? '' : 'line-clamp-3'}`}
        >
          <EmojiText text={text} size={POST_EMOJI_SIZE} />
          {expanded && overflows ? (
            <>
              {' '}
              <button
                type="button"
                aria-expanded="true"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setExpanded(false);
                }}
                className="publication-caption__more inline items-center font-bold text-white hover:underline"
              >
                Ver menos
              </button>
            </>
          ) : null}
        </p>
        {!expanded && overflows ? (
          <button
            type="button"
            aria-expanded="false"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setExpanded(true);
            }}
            className={`publication-caption__more absolute bottom-0 right-0 inline-flex max-w-[min(100%,12rem)] items-end justify-end py-0.5 pl-[clamp(1.5rem,8vw,2.5rem)] text-right font-bold text-white hover:underline ${moreBg}`}
          >
            Ver más
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Capa inferior del visor Expandir (foto/carrusel): scrim + 3 líneas. */
export function PublicationCaptionOverlay({ caption }: { caption: string }) {
  const text = String(caption || '').trim();
  if (!text) return null;
  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 min-w-0 max-w-full"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="publication-caption-overlay bg-gradient-to-t from-black from-[20%] via-black/75 to-transparent">
        <PublicationCaption caption={text} variant="overlay" />
      </div>
    </div>
  );
}
