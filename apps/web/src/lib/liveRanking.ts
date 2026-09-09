import type { ActiveLiveFeedItem } from './liveGiftsFirestore';
import { scoreLiveItem } from './liveboomAlgorithm';

/** Máximo de lives en la sección Directos Top. */
export const TOP_LIVE_LIMIT = 5;

export type RankedLiveFeed = {
  topLives: ActiveLiveFeedItem[];
  regularLives: ActiveLiveFeedItem[];
};

/**
 * Filtra por categoría, ordena por espectadores (DESC, estable en empates)
 * y reparte entre Directos Top y Live en línea.
 */
export function getLiveRanking(
  lives: ActiveLiveFeedItem[],
  selectedCategory: string,
): RankedLiveFeed {
  const filtered = lives.filter((live) => {
    if (selectedCategory) {
      return (live.category || 'otro') === selectedCategory;
    }
    return true;
  });

  const ranked = [...filtered].sort((a, b) => {
    const scoreA = scoreLiveItem({
      id: a.uid,
      creatorId: a.uid,
      viewers: a.viewers || 0,
      startedAtMs: Date.parse(a.startedAt) || 0,
      category: a.category,
    });
    const scoreB = scoreLiveItem({
      id: b.uid,
      creatorId: b.uid,
      viewers: b.viewers || 0,
      startedAtMs: Date.parse(b.startedAt) || 0,
      category: b.category,
    });
    const diff = scoreB - scoreA;
    if (diff !== 0) return diff;
    return (b.viewers || 0) - (a.viewers || 0);
  });

  return {
    topLives: ranked.slice(0, TOP_LIVE_LIMIT),
    regularLives: ranked.slice(TOP_LIVE_LIMIT),
  };
}
