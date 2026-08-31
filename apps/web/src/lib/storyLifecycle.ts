import { FLASH_BOOM_LABEL, BOOM_CLIP_LABEL } from './brand';
import type { FsPost } from './socialFirestore';

/** Máxima duración de una historia (segundos). */
export const STORY_MAX_DURATION_SEC = 90;
/** Las historias desaparecen tras 24 horas. */
export const STORY_TTL_MS = 24 * 60 * 60 * 1000;

export function storyExpiresAtFromNow(now = Date.now()): number {
  return now + STORY_TTL_MS;
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
  const expires = post.storyExpiresAtMs ?? postCreatedAtMs(post) + STORY_TTL_MS;
  return now < expires;
}

function postCreatedAtMs(post: FsPost): number {
  const parsed = Date.parse(post.createdAt);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function storyLifecycleHint(): string {
  return `${FLASH_BOOM_LABEL}: foto o video (hasta ${STORY_MAX_DURATION_SEC} s), visible 24 h para amigos y seguidores.`;
}

export function videoPostLifecycleHint(): string {
  return `${BOOM_CLIP_LABEL}: 0–${STORY_MAX_DURATION_SEC} s · permanece en tu biblioteca.`;
}
