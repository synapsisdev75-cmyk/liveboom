import { useLayoutEffect, useRef, useState } from 'react';
import { POST_EMOJI_SIZE } from '../../lib/liveboomEmojis';
import {
  textStyleProps,
  useTextStyleFonts,
  type PostTextStyle,
  type TextStyleRange,
} from '../../lib/postTextStyle';
import { StyledText } from './StyledText';

/**
 * Descripción con Ver más / Ver menos (Inicio, perfil, Expandir, Boom Clip y Flash Boom).
 * No usar en LIVE.
 */
export function PublicationCaption({
  caption,
  variant = 'feed',
  textStyle = null,
  textStyleRanges = null,
}: {
  caption: string;
  variant?: 'feed' | 'overlay';
  /** Tipo de letra y color elegidos al publicar. */
  textStyle?: PostTextStyle | null;
  /** Fragmentos con estilo propio (relativos al caption guardado, ya recortado). */
  textStyleRanges?: TextStyleRange[] | null;
}) {
  const text = String(caption || '').trim();
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const overlay = variant === 'overlay';
  const ranges = text === caption ? textStyleRanges : null;
  useTextStyleFonts(textStyle, ranges);
  const styled = textStyleProps(textStyle, ranges);

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

  return (
    <div
      className={
        overlay
          ? 'publication-caption publication-caption--overlay w-full min-w-0'
          : 'publication-caption min-w-0 px-[clamp(0.75rem,3vw,1rem)] pb-[clamp(0.75rem,2.5vw,1rem)] pt-2'
      }
    >
      <div
        className={
          overlay && expanded
            ? 'publication-caption--overlay-scroll min-w-0 overflow-y-auto overscroll-contain pr-1'
            : 'min-w-0'
        }
      >
        <p
          ref={bodyRef}
          className={`publication-caption__body${overlay ? ' is-overlay' : ''}${
            expanded ? ' is-open' : ' is-clamped'
          } ${styled.className}`}
          style={styled.style}
        >
          <StyledText text={text} textStyle={textStyle} textStyleRanges={ranges} size={POST_EMOJI_SIZE} />
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
                className="publication-caption__more"
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
            className="publication-caption__more"
          >
            Ver más
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Capa inferior del visor Expandir (foto/carrusel): scrim + 3 líneas. */
export function PublicationCaptionOverlay({
  caption,
  textStyle = null,
  textStyleRanges = null,
}: {
  caption: string;
  textStyle?: PostTextStyle | null;
  textStyleRanges?: TextStyleRange[] | null;
}) {
  const text = String(caption || '').trim();
  if (!text) return null;
  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 min-w-0 max-w-full"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="publication-caption-overlay bg-gradient-to-t from-black from-[20%] via-black/75 to-transparent">
        <PublicationCaption
          caption={text}
          variant="overlay"
          textStyle={textStyle}
          textStyleRanges={text === caption ? textStyleRanges : null}
        />
      </div>
    </div>
  );
}
