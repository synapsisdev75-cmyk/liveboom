import { FLASH_BOOM_LABEL, BOOM_CLIP_LABEL } from './brand';
import type { FsPost } from './socialFirestore';

/** Máxima duración de una historia (segundos). */
export const STORY_MAX_DURATION_SEC = 90;
/** Foto en Flash Boom / Boom Clip: tiempo fijo de visión. */
export const STORY_PHOTO_DURATION_SEC = 5;
/** Las historias desaparecen tras 24 horas desde su propio createdAt. */
export const STORY_TTL_MS = 24 * 60 * 60 * 1000;

export const STORY_STATUS_ACTIVE = 'active';
export const STORY_STATUS_EXPIRED = 'expired';

export type StoryStatus = typeof STORY_STATUS_ACTIVE | typeof STORY_STATUS_EXPIRED;

export function storyExpiresAtFromNow(now = Date.now()): number {
  return now + STORY_TTL_MS;
}

export function storyCreatedAtMs(post: {
  createdAt?: string | null;
  createdAtMs?: number | null;
}): number {
  const parsed = Date.parse(String(post.createdAt || ''));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const stored = Number(post.createdAtMs);
  if (Number.isFinite(stored) && stored > 0) return stored;
  return 0;
}

/** 24 h exactas desde createdAt del servidor; storyExpiresAtMs solo si falta createdAt. */
export function storyExpiryMs(post: {
  createdAt?: string | null;
  createdAtMs?: number | null;
  storyExpiresAtMs?: number | null;
}): number {
  const created = storyCreatedAtMs(post);
  if (created > 0) return created + STORY_TTL_MS;
  const stored = Number(post.storyExpiresAtMs);
  if (Number.isFinite(stored) && stored > 0) return stored;
  return 0;
}

export function isStoryPost(post: FsPost): boolean {
  if (post.postFormat === 'story') return true;
  if (post.storyExpiresAtMs && post.storyExpiresAtMs > 0) return true;
  // Legacy / circle-only Flash Boom
  return (post.type === 'video' || post.type === 'photo') && post.visibility === 'circle';
}

export function isStoryActive(post: FsPost, now = Date.now()): boolean {
  if (!post.mediaUrl) return false;
  if (post.type !== 'video' && post.type !== 'photo') return false;
  if (!isStoryPost(post)) return false;
  if (post.storyStatus === STORY_STATUS_EXPIRED) return false;
  const expires = storyExpiryMs(post);
  return expires > 0 && now < expires;
}

export function storyLifecycleHint(): string {
  return `${FLASH_BOOM_LABEL}: foto o video (hasta ${STORY_MAX_DURATION_SEC} s), visible 24 h para amigos y seguidores.`;
}

export function videoPostLifecycleHint(): string {
  return `${BOOM_CLIP_LABEL}: 0–${STORY_MAX_DURATION_SEC} s · permanece en tu biblioteca.`;
}
