import type { ExploreHistory } from './exploreHistory';
import { extractHashtags } from './trendsFirestore';
import {
  ALGORITHM_CONFIG,
  calculateCreatorMomentum,
  calculateDiscoveryScore,
  calculateForYouScore,
  calculateViralScore,
  type RankingContentType,
  type RankingSignals,
} from './liveboomAlgorithm';

export type ExploreTabId = 'para_ti' | 'virales' | 'recientes';

export type ExploreRankPost = {
  id: string;
  authorUid: string;
  caption?: string | null;
  createdAt: string;
  likes?: number;
  views?: number;
  dislikes?: number;
  commentCount?: number;
  giftCoins?: number;
  uniqueGiftSenders?: number;
  durationSec?: number | null;
  type?: string | null;
  postFormat?: 'story' | 'post' | null;
  storyExpiresAtMs?: number | null;
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
const MAX_CONSECUTIVE_AUTHOR = ALGORITHM_CONFIG.maxConsecutiveAuthor;
const DISCOVERY_SHARE = ALGORITHM_CONFIG.forYouMix.discovery;

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

function contentTypeOf(post: ExploreRankPost): RankingContentType {
  if (post.postFormat === 'story' || (Number(post.storyExpiresAtMs) || 0) > 0) return 'flashboom';
  if (post.postFormat === 'post' && post.type === 'video') return 'boom_clip';
  return 'post';
}

export function exploreSignalsFromPost(post: ExploreRankPost): RankingSignals {
  const likes = Math.max(0, Number(post.likes) || 0);
  const views = Math.max(0, Number(post.views) || 0);
  const uniqueViews = Math.max(views, likes > 0 ? likes : 0);
  return {
    id: post.id,
    creatorId: authorId(post),
    contentType: contentTypeOf(post),
    createdAtMs: createdMs(post),
    expiresAtMs: Number(post.storyExpiresAtMs) || null,
    qualifiedViews: uniqueViews,
    uniqueQualifiedViews: uniqueViews,
    uniqueLikes: likes,
    uniqueDislikes: Math.max(0, Number(post.dislikes) || 0),
    uniqueCommenters: Math.max(0, Number(post.commentCount) || 0),
    validCommentWeight: Math.max(0, Number(post.commentCount) || 0),
    giftCoins: Math.max(0, Number(post.giftCoins) || 0),
    uniqueGiftSenders: Math.max(0, Number(post.uniqueGiftSenders) || 0),
    durationSec: post.durationSec,
  };
}

/**
 * Viralidad 0-100: tasas + velocidad + frescura, no totales brutos.
 */
export function viralScore(post: ExploreRankPost, now = Date.now()): number {
  return calculateViralScore(exploreSignalsFromPost(post), now).viralScore;
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
    const va = calculateViralScore(exploreSignalsFromPost(a), now);
    const vb = calculateViralScore(exploreSignalsFromPost(b), now);
    const rankA = va.viralScore * 0.7 + va.velocityScore * 0.2 + va.freshnessScore * 0.1;
    const rankB = vb.viralScore * 0.7 + vb.velocityScore * 0.2 + vb.freshnessScore * 0.1;
    const diff = rankB - rankA;
    if (Math.abs(diff) > 1e-9) return diff;
    return createdMs(b) - createdMs(a);
  });
  return diversifyExploreAuthors(scored);
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
  momentumByCreator: Map<string, number>,
): number {
  const likes = Math.max(0, Number(post.likes) || 0);
  const uid = authorId(post);
  const hist = history[post.id];
  const following = viewer.followingUids.has(uid);
  const isOwn = uid === viewer.uid;
  const tags = extractHashtags(post.caption || '');

  let tagScore = 0;
  for (const tag of tags) tagScore += taste.tagWeights.get(tag) || 0;
  const interestAffinity = clamp01(tagScore / 4) * 100;
  const creatorAffinity = clamp01((taste.authorAffinity.get(uid) || 0) / 4) * 100;
  const watchAffinity = hist
    ? clamp01((hist.completed ? 0.55 : 0) + hist.watchPct * 0.45) * 100
    : 28;
  const related = interestAffinity > 12;
  const smallCreator = likes < 12 && (Number(post.views) || 0) < 80 && !following && !isOwn;
  const discoveryScore = calculateDiscoveryScore({
    following,
    isOwn,
    smallCreator,
    relatedInterest: related,
  });
  const viral = calculateViralScore(exploreSignalsFromPost(post), now);
  const momentum = momentumByCreator.get(uid) || 0;
  const score = calculateForYouScore(
    viral,
    {
      interestAffinity,
      watchAffinity,
      creatorAffinity: clamp01((creatorAffinity + momentum * 0.25) / 100) * 100,
      discoveryScore: clamp01((discoveryScore + (smallCreator ? momentum * 0.2 : 0)) / 100) * 100,
      skipped: Boolean(hist?.skipped),
      completedRecently: Boolean(hist?.completed && now - hist.seenAt < 6 * 60 * 60 * 1000),
      ignoredCreator: taste.skipAuthors.has(uid) && !following,
    },
    !taste.hasSignals,
  );
  const noise = unitNoise(viewer.uid, `${post.id}:fy`, salt) * 4;
  if (hist && hist.watchCount >= 2 && hist.watchPct < 0.4) return score * 0.3 + noise;
  return score + noise;
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
  const byCreator = new Map<string, RankingSignals[]>();
  for (const post of unique) {
    const uid = authorId(post);
    if (!uid) continue;
    const list = byCreator.get(uid) || [];
    list.push(exploreSignalsFromPost(post));
    byCreator.set(uid, list);
  }
  const momentumByCreator = new Map<string, number>();
  for (const [uid, list] of byCreator) {
    momentumByCreator.set(uid, calculateCreatorMomentum(list, now));
  }
  const scored = [...unique].sort((a, b) => {
    const diff =
      forYouScore(b, viewer, history, taste, salt, now, momentumByCreator) -
      forYouScore(a, viewer, history, taste, salt, now, momentumByCreator);
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
