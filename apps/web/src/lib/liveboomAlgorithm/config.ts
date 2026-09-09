/** Configuración central del motor LiveBoom. Cambiar pesos aquí, no en la UI. */

export const ALGORITHM_VERSION = 'v1';

export const ALGORITHM_CONFIG = {
  version: ALGORITHM_VERSION,
  viral: {
    views: 0.3,
    likes: 0.25,
    comments: 0.15,
    gifts: 0.2,
    velocity: 0.1,
  },
  forYou: {
    interestAffinity: 0.45,
    watchAffinity: 0.2,
    viralScore: 0.15,
    creatorAffinity: 0.1,
    freshnessScore: 0.05,
    discoveryScore: 0.05,
  },
  creatorMomentum: {
    avgViral: 0.35,
    viewGrowth: 0.2,
    engagement: 0.15,
    gifts: 0.15,
    followers: 0.1,
    consistency: 0.05,
  },
  giftCategoryMultiplier: {
    1: 1,
    2: 2,
    3: 4,
    4: 7,
    5: 12,
  } as Record<1 | 2 | 3 | 4 | 5, number>,
  priors: {
    views: 50,
    likes: 6,
    comments: 2,
    gifts: 1,
    dislikes: 2,
  },
  dislikePenaltyMax: 20,
  viralThresholds: {
    low: 40,
    interest: 60,
    expand: 70,
    viral: 80,
    explosive: 90,
  },
  forYouMix: {
    known: 0.7,
    related: 0.2,
    discovery: 0.1,
  },
  maxConsecutiveAuthor: 2,
  qualified: {
    videoMinSec: 3,
    videoMinPct: 0.25,
    photoMinSec: 2,
  },
} as const;

export type AlgorithmVersion = typeof ALGORITHM_VERSION;
export type AlgorithmConfig = typeof ALGORITHM_CONFIG;
