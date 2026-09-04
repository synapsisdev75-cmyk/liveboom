import { isStoryPost } from './storyLifecycle';
import { BOOM_CLIP_MAX_DURATION_SEC } from './videoTrim';

/** Límite oficial Boom Clip (front). Unifica cualquier validación previa. */
export const MAX_CLIP_DURATION_SECONDS = BOOM_CLIP_MAX_DURATION_SEC;

/** Descripción Boom Clip (caracteres). */
export const BOOM_CLIP_CAPTION_MAX = 1700;

/** Descripción Flash Boom (caracteres). */
export const FLASH_BOOM_CAPTION_MAX = 500;

export type ContentType = 'flashboom' | 'boom_clip' | 'post';

export type ContentLike = {
  type: 'photo' | 'video' | 'text' | string;
  mediaUrl?: string | null;
  visibility?: string | null;
  postFormat?: 'story' | 'post' | null;
  durationSec?: number | null;
  storyExpiresAtMs?: number | null;
  reelFeedUntilMs?: number | null;
};

/**
 * Normaliza el tipo de contenido LiveBoom.
 * La elección del composer manda: postFormat 'story' | 'post' | ausente.
 * La duración NO reclasifica una Publicación en Boom Clip.
 */
export function resolveContentType(item: ContentLike): ContentType {
  if (isStoryPost(item as never)) return 'flashboom';

  // Boom Clip = usuario eligió pestaña Boom Clip (postFormat === 'post') + video
  if (item.type === 'video' && item.mediaUrl && item.postFormat === 'post') {
    const duration = Number(item.durationSec);
    if (Number.isFinite(duration) && duration > MAX_CLIP_DURATION_SECONDS) {
      // Clip inválido / legacy demasiado largo → tratar como publicación
      return 'post';
    }
    return 'boom_clip';
  }

  // Legacy: videos con lifecycle de reel y sin postFormat (clips antiguos)
  if (
    item.type === 'video' &&
    item.mediaUrl &&
    (item.postFormat == null || item.postFormat === undefined) &&
    Number(item.reelFeedUntilMs) > 0
  ) {
    return 'boom_clip';
  }

  // Publicación: foto, texto, video (cualquier duración) sin postFormat de clip
  return 'post';
}

export function isBoomClipPost(item: ContentLike): boolean {
  return resolveContentType(item) === 'boom_clip';
}

export function isPublicationPost(item: ContentLike): boolean {
  return resolveContentType(item) === 'post';
}

export function isFlashBoomContent(item: ContentLike): boolean {
  return resolveContentType(item) === 'flashboom';
}

export function formatClipDuration(sec: number | null | undefined): string {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function contentTypeLabel(type: ContentType): string {
  if (type === 'flashboom') return 'Flash Boom';
  if (type === 'boom_clip') return 'Boom Clip';
  return 'Publicación';
}
