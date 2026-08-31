import { avatarLayoutFromTier, imageWithVersion } from './levelsConfigFirestore';
import { getActiveTiers, getConfigVersion, getTierByXp } from '../store/levelsConfigStore';

export type LevelFrameConfigEntry = {
  src: string;
  avatarLayout: ReturnType<typeof avatarLayoutFromTier>;
};

export function frameConfigForTier(tier: number): LevelFrameConfigEntry {
  const row = getActiveTiers().find((r) => r.tier === tier) ?? getTierByXp(0);
  const version = getConfigVersion();
  return {
    src: imageWithVersion(row.frameImageUrl, version),
    avatarLayout: avatarLayoutFromTier(row),
  };
}

export function frameConfigForXp(xp: number): LevelFrameConfigEntry {
  const row = getTierByXp(xp);
  const version = getConfigVersion();
  return {
    src: imageWithVersion(row.frameImageUrl, version),
    avatarLayout: avatarLayoutFromTier(row),
  };
}
