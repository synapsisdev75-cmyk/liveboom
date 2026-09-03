import type { CSSProperties } from 'react';
import { applyVideoDimensions } from './videoAspect';

/** Límite vertical del multimedia en feed (publicaciones, clips inline). */
export const FEED_MEDIA_MAX_HEIGHT = 'min(720px, 72dvh)';

export type MediaPresentationContext = 'thumbnail' | 'feed' | 'fullscreen' | 'story' | 'live';

/** object-fit según contexto: miniatura llena el marco; feed/fullscreen muestran el archivo completo. */
export function mediaObjectFit(context: MediaPresentationContext): 'cover' | 'contain' {
  return context === 'thumbnail' ? 'cover' : 'contain';
}

/** Estilos de marco en feed: ancho completo para ambient blur en PC/tablet; el media se limita en la capa main. */
export function feedMediaFrameStyle(width: number, height: number): CSSProperties {
  if (width <= 0 || height <= 0) {
    return { aspectRatio: '1 / 1', maxHeight: FEED_MEDIA_MAX_HEIGHT, width: '100%' };
  }
  const dims = applyVideoDimensions(width, height);
  return {
    aspectRatio: dims.aspectStyle.aspectRatio,
    maxHeight: FEED_MEDIA_MAX_HEIGHT,
    width: '100%',
  };
}

/** Marco fijo 9:16 para miniaturas de clip/story (sin rotar el archivo). */
export const THUMB_PORTRAIT_FRAME_CLASS = 'aspect-[9/16] w-[7.25rem] shrink-0 sm:w-[8rem]';

/** URLs de fotos de una publicación (multi-imagen o legacy mediaUrl). */
export function postPhotoUrls(post: {
  mediaUrl?: string | null;
  mediaUrls?: string[] | null;
}): string[] {
  if (post.mediaUrls?.length) return post.mediaUrls.filter(Boolean);
  if (post.mediaUrl) return [post.mediaUrl];
  return [];
}
