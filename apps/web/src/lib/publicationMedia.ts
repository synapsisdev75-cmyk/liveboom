import type { CSSProperties } from 'react';
import { FEED_MEDIA_MAX_HEIGHT, feedMediaFrameStyle } from './mediaFrame';
import { feedMediaMainStyle } from './mediaPresentation';
import {
  applyVideoDimensions,
  classifyVideoOrientation,
  type VideoOrientation,
} from './videoAspect';

export type PublicationMediaMeta = {
  width: number;
  height: number;
  aspectRatio: number;
  orientation: VideoOrientation;
};

/** Detecta metadata real de una imagen/video (proporción + orientación). */
export function resolvePublicationMediaMeta(
  width: number,
  height: number,
): PublicationMediaMeta | null {
  if (width <= 0 || height <= 0) return null;
  return {
    width,
    height,
    aspectRatio: width / height,
    orientation: classifyVideoOrientation(width, height),
  };
}

/** Marco del área multimedia en feed de Publicaciones (altura controlada). */
export function publicationFeedFrameStyle(
  width: number,
  height: number,
): CSSProperties {
  return feedMediaFrameStyle(width, height);
}

/** Estilo de la capa principal (contain + límites por resolución). */
export function publicationFeedMainStyle(
  width: number,
  height: number,
): CSSProperties {
  return feedMediaMainStyle(width, height);
}

/** Placeholder estable mientras llegan dimensiones (sin forzar 16:9 ni 1:1). */
export function publicationFeedPlaceholderStyle(): CSSProperties {
  return {
    width: '100%',
    maxHeight: FEED_MEDIA_MAX_HEIGHT,
    aspectRatio: '4 / 5',
    minHeight: '12rem',
  };
}

/** Classes / estilos de marco una vez conocidas las dimensiones. */
export function publicationFeedFrameProps(width: number, height: number): {
  className: string;
  style: CSSProperties;
  mainStyle: CSSProperties;
  orientation: VideoOrientation;
} {
  const dims = applyVideoDimensions(width, height);
  return {
    className: 'relative w-full min-w-0 lb-feed-media-frame',
    style: publicationFeedFrameStyle(width, height),
    mainStyle: publicationFeedMainStyle(width, height),
    orientation: dims.orientation,
  };
}
