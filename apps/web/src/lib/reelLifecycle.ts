import { BOOM_CLIP_LABEL } from './brand';
import { BOOM_CLIP_MAX_DURATION_SEC } from './videoTrim';
import type { FsPost } from './socialFirestore';

/** Tiempo en el feed público de reels (Inicio / Explorar). */
export const REEL_FEED_TTL_MS = 3 * 24 * 60 * 60 * 1000;
/** Después pasa de público → solo amigos. */
export const REEL_FRIENDS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Después pasa de amigos → privado (solo biblioteca del autor; no se borran). */
export const REEL_PRIVATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ReelLifecycleTimestamps = {
  reelFeedUntilMs: number;
  reelFriendsAtMs: number;
  reelPrivateAtMs: number;
};

export function reelLifecycleFromCreatedAt(createdAtMs: number): ReelLifecycleTimestamps {
  return {
    reelFeedUntilMs: createdAtMs + REEL_FEED_TTL_MS,
    reelFriendsAtMs: createdAtMs + REEL_FRIENDS_TTL_MS,
    reelPrivateAtMs: createdAtMs + REEL_PRIVATE_TTL_MS,
  };
}

export function postCreatedAtMs(post: FsPost): number {
  const parsed = Date.parse(post.createdAt);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function postReelLifecycle(post: FsPost): ReelLifecycleTimestamps {
  const created = postCreatedAtMs(post);
  const ext = post as FsPost & Partial<ReelLifecycleTimestamps>;
  return {
    reelFeedUntilMs: ext.reelFeedUntilMs ?? created + REEL_FEED_TTL_MS,
    reelFriendsAtMs: ext.reelFriendsAtMs ?? created + REEL_FRIENDS_TTL_MS,
    reelPrivateAtMs: ext.reelPrivateAtMs ?? created + REEL_PRIVATE_TTL_MS,
  };
}

/** ¿Sigue visible en fila de reels / feed público? */
export function isReelInPublicFeed(post: FsPost, now = Date.now()): boolean {
  if ((post.type !== 'video' && post.type !== 'photo') || !post.mediaUrl) return false;
  if (post.postFormat === 'story') return false;
  if (post.visibility !== 'public') return false;
  const { reelFeedUntilMs } = postReelLifecycle(post);
  return now < reelFeedUntilMs;
}

/** Visibilidad objetivo según antigüedad del reel (solo baja, nunca sube). */
export function targetReelVisibility(
  post: FsPost,
  now = Date.now(),
): 'public' | 'friends' | 'private' | 'circle' {
  if ((post.type !== 'video' && post.type !== 'photo') || post.postFormat === 'story') {
    return post.visibility;
  }
  const { reelFriendsAtMs, reelPrivateAtMs } = postReelLifecycle(post);
  if (now >= reelPrivateAtMs) return 'private';
  if (now >= reelFriendsAtMs && post.visibility === 'public') return 'friends';
  return post.visibility;
}

/** Evita que pocos autores monopolicen el carrusel cuando hay muchos reels. */
export function diversifyReelFeed(posts: FsPost[], maxPerAuthor = 2, limit = 16): FsPost[] {
  const counts = new Map<string, number>();
  const picked: FsPost[] = [];
  for (const post of posts) {
    const n = counts.get(post.authorUid) || 0;
    if (n >= maxPerAuthor) continue;
    counts.set(post.authorUid, n + 1);
    picked.push(post);
    if (picked.length >= limit) break;
  }
  return picked;
}

export function reelLifecycleHint(): string {
  return `${BOOM_CLIP_LABEL}: foto o video (0–${BOOM_CLIP_MAX_DURATION_SEC} s) en tu feed y explorar. No se eliminan; quedan en tu biblioteca.`;
}
