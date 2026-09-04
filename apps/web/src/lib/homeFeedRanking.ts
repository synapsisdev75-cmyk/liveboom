import { isPublicationPost } from './contentType';
import type { HomeFeedHistory } from './homeFeedHistory';

/** Tamaño de página del feed de Publicaciones en Inicio. */
export const HOME_FEED_PAGE_SIZE = 8;

const W_RECENCY = 0.35;
const W_GROWTH = 0.25;
const W_INTEREST = 0.15;
const W_DISCOVERY = 0.15;
const W_ROTATION = 0.1;

/** Ventana de prueba para publicaciones públicas nuevas. */
export const HOME_FEED_TRIAL_MS = 18 * 60 * 60 * 1000;
/** Recién vista: baja prioridad, no se borra. */
const SEEN_RECENT_MS = 4 * 60 * 60 * 1000;
/** Puede volver al feed si creció o pasó este tiempo. */
const COMEBACK_MS = 20 * 60 * 60 * 1000;
const MAX_CONSECUTIVE_AUTHOR = 2;

export type HomeFeedPost = {
  id: string;
  authorUid?: string;
  createdAt: string;
  likes?: number;
  visibility?: string | null;
  type?: string | null;
  mediaUrl?: string | null;
  postFormat?: 'story' | 'post' | null;
  durationSec?: number | null;
  reelFeedUntilMs?: number | null;
  storyExpiresAtMs?: number | null;
};

export type HomeFeedViewer = {
  uid: string;
  friendUids: Set<string>;
  followingUids: Set<string>;
};

function createdMs(post: HomeFeedPost) {
  const parsed = Date.parse(post.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function hash32(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Random controlado y estable (no Math.random puro). `salt` fijo durante la sesión del feed. */
export function unitNoise(uid: string, postId: string, salt: number) {
  return hash32(`${uid}:${postId}:${Math.floor(salt)}`) / 0xffffffff;
}

function recencyScore(ageMs: number) {
  const day = 24 * 60 * 60 * 1000;
  if (ageMs <= HOME_FEED_TRIAL_MS) return 1;
  if (ageMs <= 3 * day) return 0.82;
  if (ageMs <= 14 * day) return 0.55;
  if (ageMs <= 45 * day) return 0.32;
  return 0.16;
}

function growthScore(likes: number, ageMs: number) {
  const hours = Math.max(ageMs / (60 * 60 * 1000), 0.5);
  const velocity = likes / hours;
  return clamp01(Math.log1p(velocity * 8) / Math.log1p(40));
}

function authorId(post: { authorUid?: string }) {
  return post.authorUid || '';
}

export function isHomePublicationCandidate(post: HomeFeedPost): boolean {
  if (post.postFormat === 'story') return false;
  if (Number(post.storyExpiresAtMs) > 0) return false;
  if (post.visibility === 'circle') return false;
  return isPublicationPost({
    type: post.type || 'text',
    mediaUrl: post.mediaUrl,
    visibility: post.visibility,
    postFormat: post.postFormat,
    durationSec: post.durationSec,
    reelFeedUntilMs: post.reelFeedUntilMs,
  });
}

/** Prueba inicial: audiencia pequeña que crece con señales. No borra el post. */
function trialAudienceEligible(
  post: HomeFeedPost,
  viewer: HomeFeedViewer,
  likes: number,
  ageMs: number,
  salt: number,
) {
  if (ageMs > HOME_FEED_TRIAL_MS) return true;
  const uid = authorId(post);
  if (!uid || uid === viewer.uid || viewer.friendUids.has(uid) || viewer.followingUids.has(uid)) {
    return true;
  }
  const noise = unitNoise(viewer.uid, post.id, salt);
  if (likes >= 12) return true;
  if (likes >= 5) return noise < 0.7;
  if (likes >= 1) return noise < 0.4;
  return noise < 0.22;
}

export function scoreHomePublication(
  post: HomeFeedPost,
  viewer: HomeFeedViewer,
  history: HomeFeedHistory,
  salt: number,
  now = Date.now(),
  favoredAuthors?: Set<string>,
): number {
  const ageMs = Math.max(0, now - createdMs(post));
  const likes = Math.max(0, Number(post.likes) || 0);
  const seen = history[post.id];
  const uid = authorId(post);
  const isOwn = uid === viewer.uid;
  const isFriend = viewer.friendUids.has(uid);
  const isFollowing = viewer.followingUids.has(uid);
  const isNetwork = isOwn || isFriend || isFollowing;

  let recency = recencyScore(ageMs);
  let growth = growthScore(likes, ageMs);
  const interest =
    isOwn ? 0.55 : isNetwork || seen?.interacted || (uid && favoredAuthors?.has(uid)) ? 0.9 : 0.2;
  let discovery = isNetwork ? 0.12 : 0.95;
  let rotation = unitNoise(viewer.uid, post.id, salt);

  if (ageMs <= HOME_FEED_TRIAL_MS) {
    recency = 1;
    if (likes === 0 && !isNetwork) discovery = 1;
  }

  if (seen) {
    const sinceSeen = now - seen.seenAt;
    if (seen.ignored || (seen.count >= 2 && !seen.interacted && sinceSeen < COMEBACK_MS)) {
      recency *= 0.35;
      rotation *= 0.4;
    } else if (sinceSeen < SEEN_RECENT_MS) {
      recency *= 0.45;
    } else if (sinceSeen >= COMEBACK_MS && (likes > 0 || ageMs <= HOME_FEED_TRIAL_MS)) {
      growth = Math.max(growth, 0.4);
    }
  }

  return (
    recency * W_RECENCY +
    growth * W_GROWTH +
    interest * W_INTEREST +
    discovery * W_DISCOVERY +
    rotation * W_ROTATION
  );
}

export function diversifyHomeAuthors<T extends { authorUid?: string }>(
  posts: T[],
  maxConsecutive = MAX_CONSECUTIVE_AUTHOR,
): T[] {
  if (posts.length < 2) return posts;
  const pending = [...posts];
  const out: T[] = [];
  let streakUid = '';
  let streak = 0;

  while (pending.length > 0) {
    const idx = pending.findIndex((post) => {
      const uid = authorId(post);
      if (!streakUid || uid !== streakUid) return true;
      return streak < maxConsecutive;
    });
    const pickAt = idx >= 0 ? idx : 0;
    const next = pending.splice(pickAt, 1)[0];
    if (!next) break;
    const nextUid = authorId(next);
    if (nextUid === streakUid) streak += 1;
    else {
      streakUid = nextUid;
      streak = 1;
    }
    out.push(next);
  }
  return out;
}

function ensureDiscoveryShare<T extends HomeFeedPost>(
  posts: T[],
  viewer: HomeFeedViewer,
  minShare = 0.15,
): T[] {
  if (posts.length < 4) return posts;
  const isDiscovery = (post: T) => {
    const uid = authorId(post);
    return uid !== viewer.uid && !viewer.friendUids.has(uid) && !viewer.followingUids.has(uid);
  };
  const target = Math.max(1, Math.round(posts.length * minShare));
  const discovery = posts.filter(isDiscovery);
  const rest = posts.filter((post) => !isDiscovery(post));
  if (discovery.length === 0 || rest.length === 0) return posts;

  const mixed: T[] = [];
  let d = 0;
  let r = 0;
  const every = Math.max(2, Math.round(posts.length / Math.min(target, discovery.length)));
  while (d < discovery.length || r < rest.length) {
    const fromRest = r < rest.length ? rest[r] : undefined;
    if (fromRest) {
      mixed.push(fromRest);
      r += 1;
    }
    const fromDiscovery = d < discovery.length ? discovery[d] : undefined;
    if (fromDiscovery && mixed.length % every === 0) {
      mixed.push(fromDiscovery);
      d += 1;
    } else if (!fromRest && fromDiscovery) {
      mixed.push(fromDiscovery);
      d += 1;
    }
  }
  return mixed;
}

export function rankHomePublications<T extends HomeFeedPost>(
  posts: T[],
  viewer: HomeFeedViewer,
  history: HomeFeedHistory,
  salt: number,
  now = Date.now(),
): T[] {
  const unique = new Map<string, T>();
  for (const post of posts) {
    if (!post?.id || !isHomePublicationCandidate(post)) continue;
    const likes = Math.max(0, Number(post.likes) || 0);
    const ageMs = Math.max(0, now - createdMs(post));
    if (!trialAudienceEligible(post, viewer, likes, ageMs, salt)) continue;
    unique.set(post.id, post);
  }
  const favoredAuthors = new Set<string>();
  for (const post of posts) {
    if (history[post.id]?.interacted && post.authorUid) favoredAuthors.add(post.authorUid);
  }
  const scored = [...unique.values()].sort((a, b) => {
    const diff =
      scoreHomePublication(b, viewer, history, salt, now, favoredAuthors) -
      scoreHomePublication(a, viewer, history, salt, now, favoredAuthors);
    if (Math.abs(diff) > 1e-6) return diff;
    return createdMs(b) - createdMs(a);
  });
  const diversified = diversifyHomeAuthors(scored);
  return ensureDiscoveryShare(diversified, viewer);
}

export function nextHomeFeedPage<T extends { id: string }>(
  ranked: T[],
  alreadyShown: Iterable<string>,
  pageSize = HOME_FEED_PAGE_SIZE,
): T[] {
  const seen = new Set(alreadyShown);
  const extra: T[] = [];
  for (const post of ranked) {
    if (seen.has(post.id)) continue;
    extra.push(post);
    if (extra.length >= pageSize) break;
  }
  return extra;
}
