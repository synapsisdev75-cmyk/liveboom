import { calculateViralScore } from './scores';
import type { RankingSignals } from './types';

function signals(partial: Partial<RankingSignals> & Pick<RankingSignals, 'id'>): RankingSignals {
  return {
    id: partial.id,
    creatorId: partial.creatorId || 'c1',
    contentType: partial.contentType || 'boom_clip',
    createdAtMs: partial.createdAtMs ?? Date.now() - 2 * 60 * 60 * 1000,
    qualifiedViews: partial.qualifiedViews ?? partial.uniqueQualifiedViews ?? 0,
    uniqueQualifiedViews: partial.uniqueQualifiedViews ?? 0,
    uniqueLikes: partial.uniqueLikes ?? 0,
    uniqueDislikes: partial.uniqueDislikes ?? 0,
    uniqueCommenters: partial.uniqueCommenters ?? 0,
    validCommentWeight: partial.validCommentWeight ?? partial.uniqueCommenters ?? 0,
    giftCoins: partial.giftCoins ?? 0,
    uniqueGiftSenders: partial.uniqueGiftSenders ?? 0,
    durationSec: partial.durationSec ?? 20,
  };
}

export function runLiveboomAlgorithmSelfCheck(now = Date.now()): string[] {
  const errors: string[] = [];
  const small = calculateViralScore(
    signals({
      id: 'a',
      uniqueQualifiedViews: 500,
      uniqueLikes: 150,
      uniqueCommenters: 40,
      validCommentWeight: 48,
      giftCoins: 220,
      uniqueGiftSenders: 8,
      uniqueDislikes: 5,
      createdAtMs: now - 3 * 60 * 60 * 1000,
    }),
    now,
  );
  const large = calculateViralScore(
    signals({
      id: 'b',
      uniqueQualifiedViews: 50_000,
      uniqueLikes: 150,
      uniqueCommenters: 5,
      validCommentWeight: 5,
      giftCoins: 0,
      uniqueGiftSenders: 0,
      uniqueDislikes: 0,
      createdAtMs: now - 4 * 24 * 60 * 60 * 1000,
    }),
    now,
  );
  if (small.viralScore < 55) errors.push(`A: small creator score too low (${small.viralScore})`);
  if (large.viralScore >= small.viralScore) {
    errors.push(`B: large low-engagement beat small (${large.viralScore} >= ${small.viralScore})`);
  }
  const tiny = calculateViralScore(
    signals({
      id: 'c',
      uniqueQualifiedViews: 1,
      uniqueLikes: 1,
      createdAtMs: now - 10 * 60 * 1000,
    }),
    now,
  );
  if (tiny.viralScore >= 80) errors.push(`C: 1 view / 1 like became viral (${tiny.viralScore})`);
  const stale = calculateViralScore(
    signals({
      id: 'd',
      uniqueQualifiedViews: 8000,
      uniqueLikes: 400,
      createdAtMs: now - 20 * 24 * 60 * 60 * 1000,
    }),
    now,
  );
  const rising = calculateViralScore(
    signals({
      id: 'e',
      uniqueQualifiedViews: 2000,
      uniqueLikes: 180,
      uniqueCommenters: 30,
      createdAtMs: now - 40 * 60 * 1000,
    }),
    now,
  );
  if (rising.velocityScore <= stale.velocityScore) {
    errors.push(`F: rising content velocity not higher (${rising.velocityScore} vs ${stale.velocityScore})`);
  }
  if (stale.freshnessScore >= rising.freshnessScore) {
    errors.push(`E: stale freshness not lower (${stale.freshnessScore} vs ${rising.freshnessScore})`);
  }
  return errors;
}
