import type { CSSProperties, ReactNode } from 'react';
import {
  publicationFeedFrameProps,
  publicationFeedPlaceholderStyle,
} from '../../lib/publicationMedia';
import { MediaStage } from './MediaStage';

type Props = {
  src: string;
  mediaKind: 'image' | 'video';
  width?: number;
  height?: number;
  /** Poster/thumbnail (videos): ambient blur + atributo poster del player. */
  posterUrl?: string | null;
  className?: string;
  style?: CSSProperties;
  mainClassName?: string;
  mainStyle?: CSSProperties;
  overlay?: ReactNode;
  children: ReactNode;
};

/**
 * Wrapper único del área multimedia de Publicaciones (feed Inicio).
 * Contenedor a ancho completo + media centrada (PC/tablet/móvil).
 * No usar en Boom Clip / Flash Boom / Explorar.
 */
export function PublicationMedia({
  src,
  mediaKind,
  width = 0,
  height = 0,
  posterUrl = null,
  className = '',
  style,
  mainClassName = '',
  mainStyle,
  overlay,
  children,
}: Props) {
  const ready = width > 0 && height > 0;
  const frame = ready ? publicationFeedFrameProps(width, height) : null;

  return (
    <MediaStage
      mode="publication"
      mediaUrl={src}
      mediaKind={mediaKind}
      posterUrl={posterUrl}
      className={`${frame?.className ?? 'relative w-full min-w-0 lb-feed-media-frame'} ${className}`}
      style={{
        ...(frame?.style ?? publicationFeedPlaceholderStyle()),
        ...style,
      }}
      /* Main a 100%: el tamaño lo limita el hijo, así la foto queda centrada. */
      mainClassName={`lb-publication-media__main ${mainClassName}`}
      mainStyle={{ width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%' }}
      overlay={overlay}
    >
      <div
        className="lb-publication-media__fit relative flex h-full max-h-full w-full max-w-full items-center justify-center"
        style={{
          ...(frame?.mainStyle ?? { maxWidth: '100%', maxHeight: '100%' }),
          ...mainStyle,
        }}
      >
        {children}
      </div>
    </MediaStage>
  );
}
