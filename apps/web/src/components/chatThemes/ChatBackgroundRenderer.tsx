import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { ChatCustomBackground, ChatImageVariants, ResolvedChatBackground } from '../../chatThemes/types';

type Size = { w: number; h: number };

/**
 * Encuadre "cubrir" con zoom, giro (múltiplos de 90°) y posición 0..100.
 * Nunca deforma: la imagen se escala uniforme y se recorta lo que sobra.
 */
export function coverGeometry(size: Size, image: Pick<ChatCustomBackground, 'width' | 'height' | 'rotation' | 'zoom' | 'backgroundPositionX' | 'backgroundPositionY' | 'blur'>) {
  const pad = image.blur * 2;
  const cw = size.w + pad * 2;
  const ch = size.h + pad * 2;
  const swap = image.rotation % 180 !== 0;
  const rw = swap ? image.height : image.width;
  const rh = swap ? image.width : image.height;
  const scale = Math.max(cw / rw, ch / rh) * image.zoom;
  const boxW = rw * scale;
  const boxH = rh * scale;
  const iw = image.width * scale;
  const ih = image.height * scale;
  return {
    scale,
    overflowX: boxW - cw,
    overflowY: boxH - ch,
    box: {
      left: -pad - (boxW - cw) * (image.backgroundPositionX / 100),
      top: -pad - (boxH - ch) * (image.backgroundPositionY / 100),
      width: boxW,
      height: boxH,
    } satisfies CSSProperties,
    img: {
      width: iw,
      height: ih,
      left: (boxW - iw) / 2,
      top: (boxH - ih) / 2,
      transform: image.rotation ? `rotate(${image.rotation}deg)` : undefined,
    } satisfies CSSProperties,
  };
}

function pickVariant(variants: ChatImageVariants, size: Size, mediumLongSide: number) {
  const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const need = Math.max(size.w, size.h) * dpr;
  return need <= mediumLongSide ? variants.medium : variants.full;
}

function ProgressiveImage({
  thumb,
  src,
  className,
  style,
}: {
  thumb: string;
  src: string;
  className: string;
  style?: CSSProperties;
}) {
  const [readySrc, setReadySrc] = useState<string | null>(null);
  const ready = readySrc === src;
  return (
    <>
      {!ready ? (
        <img src={thumb} alt="" draggable={false} decoding="async" className={`${className} lb-chat-bg__img--thumb`} style={style} />
      ) : null}
      <img
        key={src}
        src={src}
        alt=""
        draggable={false}
        decoding="async"
        onLoad={() => setReadySrc(src)}
        className={`${className}${ready ? ' is-ready' : ''}`}
        style={style}
      />
    </>
  );
}

type Props = {
  background: ResolvedChatBackground;
  className?: string;
  /** Fuerza el fondo vertical u horizontal del tema; por defecto según la forma del contenedor. */
  orientation?: 'portrait' | 'landscape';
};

/** Capa de fondo del chat: no captura toques, no afecta altura, scroll ni safe-areas. */
export function ChatBackgroundRenderer({ background, className = '', orientation }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return undefined;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      setSize((prev) => (Math.abs(prev.w - w) < 2 && Math.abs(prev.h - h) < 2 ? prev : { w, h }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const measured = size.w > 0 && size.h > 0;
  let content = null;
  if (measured && background.kind === 'theme') {
    const portrait = orientation ? orientation === 'portrait' : size.h >= size.w;
    const variants = portrait
      ? background.portrait ?? background.landscape
      : background.landscape ?? background.portrait;
    if (variants) {
      content = (
        <ProgressiveImage
          thumb={variants.thumb}
          src={pickVariant(variants, size, 740)}
          className="lb-chat-bg__img"
        />
      );
    }
  } else if (measured && background.kind === 'custom') {
    const image = background.image;
    const geo = coverGeometry(size, image);
    content = (
      <div
        className="lb-chat-bg__box"
        style={{ ...geo.box, filter: image.blur ? `blur(${image.blur}px)` : undefined }}
      >
        <ProgressiveImage
          thumb={image.thumb}
          src={pickVariant({ thumb: image.thumb, medium: image.medium, full: image.full }, { w: size.w * image.zoom, h: size.h * image.zoom }, 1280)}
          className="lb-chat-bg__custom"
          style={geo.img}
        />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={`lb-chat-bg ${className}`}
      style={{
        backgroundColor: background.baseColor,
        backgroundImage: background.kind === 'theme' ? background.gradient : undefined,
      }}
    >
      {content}
      <div
        className="lb-chat-bg__overlay"
        style={{ backgroundColor: background.overlayColor, opacity: background.overlayOpacity }}
      />
    </div>
  );
}
