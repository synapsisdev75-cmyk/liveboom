import type { ExploreHistory } from './exploreHistory';
import { extractHashtags } from './trendsFirestore';

export type ExploreTabId = 'para_ti' | 'virales' | 'recientes';

export type ExploreRankPost = {
  id: string;
  authorUid: string;
  caption?: string | null;
  createdAt: string;
  likes?: number;
  durationSec?: number | null;
};

export type ExploreViewer = {
  uid: string;
  followingUids: Set<string>;
};

/** Ventanas de viralidad: se amplían si no hay suficientes resultados. */
export const EXPLORE_VIRAL_WINDOWS_MS = [
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  72 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
] as const;

const MIN_VIRAL_COUNT = 12;
const MAX_CONSECUTIVE_AUTHOR = 2;
const DISCOVERY_SHARE = 0.28;

function createdMs(post: { createdAt: string }) {
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

function unitNoise(uid: string, postId: string, salt: number) {
  return hash32(`${uid}:${postId}:${Math.floor(salt)}`) / 0xffffffff;
}

function authorId(post: { authorUid?: string }) {
  return post.authorUid || '';
}

function dedupePosts<T extends { id: string }>(posts: T[]): T[] {
  const map = new Map<string, T>();
  for (const post of posts) {
    if (post?.id) map.set(post.id, post);
  }
  return [...map.values()];
}

export function diversifyExploreAuthors<T extends { authorUid?: string }>(
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

function ensureDiscoveryShare<T extends ExploreRankPost>(
  posts: T[],
  viewer: ExploreViewer,
  minShare = DISCOVERY_SHARE,
): T[] {
  if (posts.length < 4) return posts;
  const isDiscovery = (post: T) => {
    const uid = authorId(post);
    return uid !== viewer.uid && !viewer.followingUids.has(uid);
  };
  const discovery = posts.filter(isDiscovery);
  const known = posts.filter((post) => !isDiscovery(post));
  if (discovery.length === 0 || known.length === 0) return posts;

  const target = Math.max(1, Math.round(posts.length * minShare));
  const mixed: T[] = [];
  let d = 0;
  let k = 0;
  const every = Math.max(2, Math.round(posts.length / Math.min(target, discovery.length)));
  while (d < discovery.length || k < known.length) {
    const knownPost = known[k];
    if (knownPost) {
      mixed.push(knownPost);
      k += 1;
    }
    const discoveryPost = discovery[d];
    if (discoveryPost && (mixed.length % every === 0 || k >= known.length)) {
      mixed.push(discoveryPost);
      d += 1;
    } else if (!knownPost && discoveryPost) {
      mixed.push(discoveryPost);
      d += 1;
    }
  }
  return mixed;
}

/**
 * Viralidad por crecimiento AHORA, no por total histórico.
 * Señales disponibles en el cliente: Booms (likes) / hora, recencia de la ventana,
 * y un factor anti-fama para que cuentas grandes no ganen siempre.
 */
export function viralScore(post: ExploreRankPost, now = Date.now()): number {
  const ageMs = Math.max(0, now - createdMs(post));
  const ageHours = Math.max(ageMs / 3_600_000, 0.25);
  const likes = Math.max(0, Number(post.likes) || 0);
  const boomVelocity = likes / ageHours;
  const uniqueProxy = Math.log1p(likes) / Math.log1p(90);
  const recencyWindow =
    ageHours <= 6 ? 1.4 : ageHours <= 24 ? 1.15 : ageHours <= 72 ? 0.9 : ageHours <= 168 ? 0.62 : 0.28;
  const antiFame = 1 / (1 + Math.log1p(likes) * 0.18);
  const growthNow = clamp01(Math.log1p(boomVelocity * 14) / Math.log1p(55));
  return growthNow * 0.58 * recencyWindow + uniqueProxy * 0.12 + recencyWindow * 0.18 + antiFame * 0.12;
}

export function rankExploreRecent<T extends ExploreRankPost>(posts: T[]): T[] {
  const unique = dedupePosts(posts);
  const sorted = [...unique].sort((a, b) => createdMs(b) - createdMs(a));
  return diversifyExploreAuthors(sorted);
}

export function rankExploreViral<T extends ExploreRankPost>(posts: T[], now = Date.now()): T[] {
  const unique = dedupePosts(posts);
  let pool: T[] = [];
  for (const window of [...EXPLORE_VIRAL_WINDOWS_MS, Number.POSITIVE_INFINITY]) {
    pool = unique.filter((post) => now - createdMs(post) <= window);
    if (pool.length >= MIN_VIRAL_COUNT) break;
  }
  if (pool.length === 0) pool = unique;
  const scored = [...pool].sort((a, b) => {
    const diff = viralScore(b, now) - viralScore(a, now);
    if (Math.abs(diff) > 1e-9) return diff;
    return createdMs(b) - createdMs(a);
  });
  return diversifyExploreAuthors(scored);
}

function recencyScore(ageMs: number) {
  const day = 24 * 60 * 60 * 1000;
  if (ageMs <= 6 * 60 * 60 * 1000) return 1;
  if (ageMs <= day) return 0.86;
  if (ageMs <= 3 * day) return 0.68;
  if (ageMs <= 14 * day) return 0.42;
  return 0.2;
}

type ViewerTaste = {
  tagWeights: Map<string, number>;
  authorAffinity: Map<string, number>;
  skipAuthors: Set<string>;
  hasSignals: boolean;
};

function buildTaste(history: ExploreHistory): ViewerTaste {
  const tagWeights = new Map<string, number>();
  const authorAffinity = new Map<string, number>();
  const skipAuthors = new Set<string>();
  let signal = 0;

  for (const rec of Object.values(history)) {
    if (rec.skipped && rec.watchPct < 0.2 && !rec.completed) {
      if (rec.authorUid) skipAuthors.add(rec.authorUid);
      continue;
    }
    const weight =
      (rec.completed ? 1.6 : 0) +
      rec.watchPct * 1.2 +
      Math.min(rec.dwellMs / 20_000, 1) * 0.8 +
      Math.min(rec.repeats, 3) * 0.35 +
      Math.min(rec.watchCount, 4) * 0.15;
    if (weight <= 0.15) continue;
    signal += 1;
    if (rec.authorUid) {
      authorAffinity.set(rec.authorUid, (authorAffinity.get(rec.authorUid) || 0) + weight);
    }
    for (const tag of rec.tags || []) {
      tagWeights.set(tag, (tagWeights.get(tag) || 0) + weight);
    }
  }

  return { tagWeights, authorAffinity, skipAuthors, hasSignals: signal >= 2 };
}

function forYouScore(
  post: ExploreRankPost,
  viewer: ExploreViewer,
  history: ExploreHistory,
  taste: ViewerTaste,
  salt: number,
  now: number,
): number {
  const ageMs = Math.max(0, now - createdMs(post));
  const likes = Math.max(0, Number(post.likes) || 0);
  const uid = authorId(post);
  const hist = history[post.id];
  const following = viewer.followingUids.has(uid);
  const isOwn = uid === viewer.uid;
  const tags = extractHashtags(post.caption || '');

  let tagScore = 0;
  for (const tag of tags) tagScore += taste.tagWeights.get(tag) || 0;
  tagScore = clamp01(tagScore / 4);

  const authorScore = clamp01((taste.authorAffinity.get(uid) || 0) / 4);
  const similar = tagScore * 0.55 + authorScore * 0.45;
  const recency = recencyScore(ageMs);
  const discovery = !following && !isOwn ? 0.92 : 0.22;
  const isSmallCreator = likes < 10 && !following && !isOwn;
  const newCreatorBoost = isSmallCreator && (tagScore > 0.12 || unitNoise(viewer.uid, post.id, salt) < 0.34) ? 0.7 : 0.12;
  const finishAffinity = similar * 0.65 + recency * 0.35;
  const growth = viralScore(post, now);
  const noise = unitNoise(viewer.uid, `${post.id}:fy`, salt);

  let score: number;
  if (!taste.hasSignals) {
    score = recency * 0.38 + growth * 0.32 + discovery * 0.18 + noise * 0.12;
  } else {
    score =
      finishAffinity * 0.3 +
      similar * 0.22 +
      discovery * 0.16 +
      newCreatorBoost * 0.12 +
      recency * 0.1 +
      growth * 0.05 +
      noise * 0.05;
  }

  if (taste.skipAuthors.has(uid) && !following) score *= 0.35;
  if (hist?.skipped) score *= 0.22;
  if (hist?.completed) score *= 0.4;
  if (hist && hist.watchCount >= 2 && hist.watchPct < 0.4) score *= 0.3;

  return score;
}

export function rankExploreForYou<T extends ExploreRankPost>(
  posts: T[],
  viewer: ExploreViewer,
  history: ExploreHistory,
  salt: number,
  now = Date.now(),
): T[] {
  const unique = dedupePosts(posts);
  if (unique.length === 0) return [];
  const taste = buildTaste(history);
  const scored = [...unique].sort((a, b) => {
    const diff =
      forYouScore(b, viewer, history, taste, salt, now) - forYouScore(a, viewer, history, taste, salt, now);
    if (Math.abs(diff) > 1e-9) return diff;
    return createdMs(b) - createdMs(a);
  });
  return diversifyExploreAuthors(ensureDiscoveryShare(scored, viewer));
}

export function preferUnseenFirst<T extends { id: string }>(posts: T[], sessionSeen: Set<string>): T[] {
  if (sessionSeen.size === 0) return posts;
  const unseen = posts.filter((post) => !sessionSeen.has(post.id));
  const seen = posts.filter((post) => sessionSeen.has(post.id));
  if (unseen.length === 0) return posts;
  return [...unseen, ...seen];
}

export function skipSameAsCurrent(ids: string[], index: number, avoidId: string | null | undefined): number {
  if (ids.length === 0) return 0;
  let i = Math.max(0, Math.min(index, ids.length - 1));
  if (!avoidId || ids[i] !== avoidId || ids.length === 1) return i;
  for (let step = 1; step < ids.length; step += 1) {
    const next = (i + step) % ids.length;
    if (ids[next] !== avoidId) return next;
  }
  return i;
}

export function mergeExploreQueue(
  prevIds: string[],
  rankedIds: string[],
  currentId: string | null,
  mode: 'append' | 'recientes',
): { ids: string[]; index: number } {
  if (rankedIds.length === 0) {
    const index = currentId ? Math.max(0, prevIds.indexOf(currentId)) : 0;
    return { ids: prevIds, index };
  }

  if (prevIds.length === 0) {
    const index = currentId && rankedIds.includes(currentId) ? rankedIds.indexOf(currentId) : 0;
    return { ids: rankedIds, index };
  }

  const eligible = new Set(rankedIds);
  const cut = currentId && prevIds.includes(currentId) ? prevIds.indexOf(currentId) : -1;
  const prefix =
    cut >= 0
      ? prevIds.slice(0, cut + 1).filter((id) => eligible.has(id) || id === currentId)
      : [];
  const prefixSet = new Set(prefix);

  if (mode === 'recientes') {
    const currentRank = currentId ? rankedIds.indexOf(currentId) : -1;
    const newer =
      currentRank >= 0
        ? rankedIds.slice(0, currentRank).filter((id) => !prefixSet.has(id))
        : rankedIds.filter((id) => !prefixSet.has(id) && !prevIds.includes(id));
    const older = rankedIds.filter((id) => !prefixSet.has(id) && !newer.includes(id));
    const ids = [...newer, ...prefix, ...older];
    const index = currentId && ids.includes(currentId) ? ids.indexOf(currentId) : newer.length;
    return { ids, index: Math.max(0, index) };
  }

  const rest = rankedIds.filter((id) => !prefixSet.has(id));
  const ids = prefix.length ? [...prefix, ...rest] : rankedIds;
  const index = currentId && ids.includes(currentId) ? ids.indexOf(currentId) : 0;
  return { ids, index: Math.max(0, index) };
}

export function exploreWatchTags(caption?: string | null): string[] {
  return extractHashtags(caption || '');
}
