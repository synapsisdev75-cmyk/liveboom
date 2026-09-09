export type RankingContentType = 'post' | 'boom_clip' | 'flashboom' | 'live';

export type RankingSignals = {
  id: string;
  creatorId: string;
  contentType: RankingContentType;
  createdAtMs: number;
  expiresAtMs?: number | null;
  qualifiedViews: number;
  uniqueQualifiedViews: number;
  uniqueLikes: number;
  uniqueDislikes: number;
  uniqueCommenters: number;
  validCommentWeight: number;
  giftCoins: number;
  uniqueGiftSenders: number;
  durationSec?: number | null;
  trustWeight?: number;
};

export type ViralBreakdown = {
  viewScore: number;
  likeScore: number;
  commentScore: number;
  giftScore: number;
  velocityScore: number;
  freshnessScore: number;
  dislikePenalty: number;
  viralScore: number;
  distributionStage: 1 | 2 | 3 | 4 | 5;
  rankingReasons: string[];
  rankingVersion: string;
};

export type ForYouSignals = {
  interestAffinity: number;
  watchAffinity: number;
  creatorAffinity: number;
  discoveryScore: number;
  skipped?: boolean;
  completedRecently?: boolean;
  ignoredCreator?: boolean;
};

export type LiveRankingSignals = {
  id: string;
  creatorId: string;
  viewers: number;
  startedAtMs: number;
  category?: string | null;
};
