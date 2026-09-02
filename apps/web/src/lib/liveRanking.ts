import type { ActiveLiveFeedItem } from './liveGiftsFirestore';

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
    const diff = (b.viewers || 0) - (a.viewers || 0);
    if (diff !== 0) return diff;
    return 0;
  });

  return {
    topLives: ranked.slice(0, TOP_LIVE_LIMIT),
    regularLives: ranked.slice(TOP_LIVE_LIMIT),
  };
}
