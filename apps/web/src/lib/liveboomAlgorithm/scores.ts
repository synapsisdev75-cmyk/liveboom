import { ALGORITHM_CONFIG, ALGORITHM_VERSION } from './config';
import type {
  ForYouSignals,
  LiveRankingSignals,
  RankingContentType,
  RankingSignals,
  ViralBreakdown,
} from './types';

export function clampScore(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function smoothedRate(success: number, trials: number, priorSuccess: number, priorTrials: number): number {
  const s = Math.max(0, success);
  const t = Math.max(0, trials);
  return (s + priorSuccess) / (t + priorTrials);
}

function logNorm100(value: number, k: number): number {
  const safeK = Math.max(1e-6, k);
  return clampScore((Math.log1p(Math.max(0, value)) / Math.log1p(safeK)) * 100);
}

function ageMsOf(signals: RankingSignals, now: number): number {
  return Math.max(0, now - (signals.createdAtMs || now));
}

function typeWeights(type: RankingContentType) {
  if (type === 'flashboom') {
    return { freshness: 1.35, velocity: 1.2, views: 0.9, likes: 1, comments: 0.9, gifts: 1 };
  }
  if (type === 'boom_clip') {
    return { freshness: 1, velocity: 1.1, views: 1.15, likes: 1.1, comments: 0.85, gifts: 1 };
  }
  if (type === 'live') {
    return { freshness: 1.2, velocity: 1.25, views: 1.2, likes: 0.9, comments: 1.1, gifts: 1.15 };
  }
  return { freshness: 1, velocity: 1, views: 1, likes: 1, comments: 1.05, gifts: 1 };
}

export function trustWeightFromSignals(signals: RankingSignals): number {
  if (typeof signals.trustWeight === 'number') return clampScore(signals.trustWeight, 0, 1);
  const views = Math.max(0, signals.uniqueQualifiedViews);
  const likes = Math.max(0, signals.uniqueLikes);
  if (views < 8 && likes > views * 4) return 0.35;
  if (views < 20 && likes > views * 2.5) return 0.55;
  if (signals.uniqueDislikes >= 8 && signals.uniqueDislikes > likes * 3 && views < 30) return 0.7;
  return 1;
}

export function normalizeViewScore(signals: RankingSignals, now = Date.now()): number {
  const hours = Math.max(ageMsOf(signals, now) / 3_600_000, 0.25);
  const unique = Math.max(0, signals.uniqueQualifiedViews || signals.qualifiedViews || 0);
  const perHour = unique / hours;
  const rate = logNorm100(perHour, 70);
  const antiFame = 100 / (1 + Math.log1p(unique) * 0.12);
  return clampScore(rate * 0.78 + antiFame * 0.22);
}

export function normalizeLikeScore(signals: RankingSignals): number {
  const { priors } = ALGORITHM_CONFIG;
  const views = Math.max(0, signals.uniqueQualifiedViews);
  const likes = Math.max(0, signals.uniqueLikes);
  const rate = smoothedRate(likes, views, priors.likes, priors.views);
  return clampScore((rate / 0.28) * 100);
}

export function normalizeCommentScore(signals: RankingSignals): number {
  const { priors } = ALGORITHM_CONFIG;
  const views = Math.max(0, signals.uniqueQualifiedViews);
  const comments = Math.max(0, signals.validCommentWeight || signals.uniqueCommenters);
  const rate = smoothedRate(comments, views, priors.comments, priors.views);
  return clampScore((rate / 0.09) * 100);
}

export function normalizeGiftScore(signals: RankingSignals): number {
  const unique = Math.max(0, signals.uniqueGiftSenders);
  const coins = Math.max(0, signals.giftCoins);
  const uniquePart = logNorm100(unique, 14);
  const valuePart = logNorm100(coins, 800);
  return clampScore(uniquePart * 0.62 + valuePart * 0.38);
}

export function calculateVelocityScore(signals: RankingSignals, now = Date.now()): number {
  const minutes = Math.max(ageMsOf(signals, now) / 60_000, 5);
  const hours = minutes / 60;
  const pulse =
    signals.uniqueLikes +
    signals.uniqueCommenters * 1.4 +
    signals.uniqueGiftSenders * 3 +
    signals.uniqueQualifiedViews * 0.08;
  let score = logNorm100(pulse / minutes, 6);
  if (hours <= 1) score *= 1.18;
  else if (hours <= 6) score *= 1.05;
  else if (hours <= 24) score *= 0.82;
  else if (hours <= 168) score *= 0.45;
  else score *= 0.22;
  return clampScore(score);
}

export function calculateFreshnessScore(signals: RankingSignals, now = Date.now()): number {
  const age = ageMsOf(signals, now);
  const hour = 3_600_000;
  if (signals.contentType === 'flashboom') {
    const ttl = Math.max(1, (signals.expiresAtMs || signals.createdAtMs + 24 * hour) - signals.createdAtMs);
    const remaining = Math.max(0, (signals.expiresAtMs || signals.createdAtMs + ttl) - now);
    if (remaining <= 0) return 0;
    return clampScore((remaining / ttl) * 100);
  }
  if (signals.contentType === 'live') {
    if (age <= 10 * 60_000) return 100;
    if (age <= hour) return 88;
    if (age <= 3 * hour) return 70;
    return 42;
  }
  if (age <= hour) return 100;
  if (age <= 6 * hour) return 86;
  if (age <= 24 * hour) return 64;
  if (age <= 7 * 24 * hour) return 32;
  return 10;
}

export function calculateDislikePenalty(signals: RankingSignals): number {
  const { priors, dislikePenaltyMax } = ALGORITHM_CONFIG;
  const views = Math.max(0, signals.uniqueQualifiedViews);
  const dislikes = Math.max(0, signals.uniqueDislikes);
  const rate = smoothedRate(dislikes, views, priors.dislikes, priors.views);
  let penalty = (rate / 0.12) * dislikePenaltyMax;
  if (dislikes < 8) penalty = Math.min(penalty, 6);
  return clampScore(penalty, 0, dislikePenaltyMax);
}

export function distributionStage(viralScore: number): 1 | 2 | 3 | 4 | 5 {
  const t = ALGORITHM_CONFIG.viralThresholds;
  if (viralScore >= t.explosive) return 5;
  if (viralScore >= t.viral) return 5;
  if (viralScore >= t.expand) return 4;
  if (viralScore >= t.interest) return 3;
  if (viralScore >= t.low) return 2;
  return 1;
}

function rankingReasons(breakdown: Omit<ViralBreakdown, 'rankingReasons' | 'rankingVersion'>): string[] {
  const reasons: string[] = [];
  if (breakdown.likeScore >= 70) reasons.push('high_like_rate');
  if (breakdown.viewScore >= 70) reasons.push('strong_view_rate');
  if (breakdown.commentScore >= 55) reasons.push('conversation');
  if (breakdown.giftScore >= 50) reasons.push('strong_gift_rate');
  if (breakdown.velocityScore >= 70) reasons.push('fast_growth');
  if (breakdown.freshnessScore >= 80) reasons.push('fresh');
  if (breakdown.dislikePenalty >= 10) reasons.push('dislike_pressure');
  if (breakdown.viralScore >= ALGORITHM_CONFIG.viralThresholds.expand) reasons.push('viral_candidate');
  return reasons;
}

export function calculateViralScore(signals: RankingSignals, now = Date.now()): ViralBreakdown {
  const weights = ALGORITHM_CONFIG.viral;
  const type = typeWeights(signals.contentType);
  const trust = trustWeightFromSignals(signals);
  const viewScore = normalizeViewScore(signals, now) * type.views;
  const likeScore = normalizeLikeScore(signals) * type.likes;
  const commentScore = normalizeCommentScore(signals) * type.comments;
  const giftScore = normalizeGiftScore(signals) * type.gifts;
  const velocityScore = calculateVelocityScore(signals, now) * type.velocity;
  const freshnessScore = calculateFreshnessScore(signals, now) * type.freshness;
  const dislikePenalty = calculateDislikePenalty(signals);
  const raw =
    clampScore(viewScore) * weights.views +
    clampScore(likeScore) * weights.likes +
    clampScore(commentScore) * weights.comments +
    clampScore(giftScore) * weights.gifts +
    clampScore(velocityScore) * weights.velocity;
  const viralScore = clampScore(raw * trust - dislikePenalty);
  const stage = distributionStage(viralScore);
  const body = {
    viewScore: clampScore(viewScore),
    likeScore: clampScore(likeScore),
    commentScore: clampScore(commentScore),
    giftScore: clampScore(giftScore),
    velocityScore: clampScore(velocityScore),
    freshnessScore: clampScore(freshnessScore),
    dislikePenalty,
    viralScore,
    distributionStage: stage,
  };
  return {
    ...body,
    rankingReasons: rankingReasons(body),
    rankingVersion: ALGORITHM_VERSION,
  };
}

export function calculateForYouScore(
  viral: ViralBreakdown,
  affinity: ForYouSignals,
  coldStart: boolean,
): number {
  const w = ALGORITHM_CONFIG.forYou;
  if (coldStart) {
    return clampScore(
      viral.viralScore * 0.34 +
        viral.freshnessScore * 0.28 +
        affinity.discoveryScore * 0.22 +
        viral.velocityScore * 0.16,
    );
  }
  let score =
    affinity.interestAffinity * w.interestAffinity +
    affinity.watchAffinity * w.watchAffinity +
    viral.viralScore * w.viralScore +
    affinity.creatorAffinity * w.creatorAffinity +
    viral.freshnessScore * w.freshnessScore +
    affinity.discoveryScore * w.discoveryScore;
  if (affinity.ignoredCreator) score *= 0.35;
  if (affinity.skipped) score *= 0.22;
  if (affinity.completedRecently) score *= 0.42;
  return clampScore(score);
}

export function calculateDiscoveryScore(input: {
  following: boolean;
  isOwn: boolean;
  smallCreator: boolean;
  relatedInterest: boolean;
}): number {
  if (input.isOwn) return 8;
  if (input.following) return 18;
  if (input.smallCreator && input.relatedInterest) return 86;
  if (input.smallCreator) return 72;
  if (input.relatedInterest) return 48;
  return 64;
}

export function calculateCreatorMomentum(posts: RankingSignals[], now = Date.now()): number {
  const week = posts.filter((item) => now - item.createdAtMs <= 7 * 24 * 60 * 60 * 1000);
  const sample = week.length ? week : posts;
  if (sample.length === 0) return 0;
  const virals = sample.map((item) => calculateViralScore(item, now).viralScore);
  const avgViral = virals.reduce((sum, value) => sum + value, 0) / virals.length;
  const viewGrowth =
    sample.reduce((sum, item) => sum + normalizeViewScore(item, now), 0) / sample.length;
  const engagement =
    sample.reduce((sum, item) => sum + (normalizeLikeScore(item) + normalizeCommentScore(item)) / 2, 0) /
    sample.length;
  const gifts = sample.reduce((sum, item) => sum + normalizeGiftScore(item), 0) / sample.length;
  const consistency = clampScore((sample.length / 5) * 100);
  const w = ALGORITHM_CONFIG.creatorMomentum;
  return clampScore(
    avgViral * w.avgViral +
      viewGrowth * w.viewGrowth +
      engagement * w.engagement +
      gifts * w.gifts +
      consistency * w.consistency,
  );
}

export function scoreLiveItem(live: LiveRankingSignals, now = Date.now()): number {
  const hours = Math.max((now - live.startedAtMs) / 3_600_000, 0.08);
  const viewers = Math.max(0, live.viewers);
  const viewScore = logNorm100(viewers / hours, 40);
  const concurrent = logNorm100(viewers, 120);
  const age = Math.max(0, now - live.startedAtMs);
  const freshness = age <= 10 * 60_000 ? 100 : age <= 3_600_000 ? 82 : 55;
  const coldStart = viewers < 8 && age <= 15 * 60_000 ? 28 : 0;
  return clampScore(concurrent * 0.42 + viewScore * 0.38 + freshness * 0.14 + coldStart);
}

export function isQualifiedWatch(input: {
  contentType: RankingContentType;
  dwellMs: number;
  durationSec?: number | null;
}): boolean {
  const dwellSec = Math.max(0, input.dwellMs) / 1000;
  if (input.contentType === 'post' && !(input.durationSec && input.durationSec > 0)) {
    return dwellSec >= ALGORITHM_CONFIG.qualified.photoMinSec;
  }
  const duration = Math.max(0, Number(input.durationSec) || 0);
  const pct = duration > 0 ? dwellSec / duration : 0;
  return dwellSec >= ALGORITHM_CONFIG.qualified.videoMinSec || pct >= ALGORITHM_CONFIG.qualified.videoMinPct;
}
