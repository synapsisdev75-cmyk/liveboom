import { create } from 'zustand';
import {
  buildDefaultConfig,
  listenLevelsConfig,
  type LevelsConfigDoc,
  type RemoteTierConfig,
} from '../lib/levelsConfigFirestore';

type State = {
  ready: boolean;
  config: LevelsConfigDoc | null;
  tiers: RemoteTierConfig[];
  hydrate: () => () => void;
  getTier: (tier: number) => RemoteTierConfig | undefined;
  getTierByXp: (xp: number) => RemoteTierConfig;
};

function tiersFromDoc(doc: LevelsConfigDoc | null): RemoteTierConfig[] {
  if (doc?.tiers?.length) {
    return [...doc.tiers].sort((a, b) => a.tier - b.tier);
  }
  return buildDefaultConfig().tiers;
}

export const useLevelsConfigStore = create<State>((set, get) => ({
  ready: false,
  config: null,
  tiers: buildDefaultConfig().tiers,

  hydrate: () => {
    const unsub = listenLevelsConfig((doc) => {
      set({
        ready: true,
        config: doc,
        tiers: tiersFromDoc(doc),
      });
    });
    return unsub;
  },

  getTier: (tier) => get().tiers.find((row) => row.tier === tier),

  getTierByXp: (xp) => {
    const safe = Math.max(0, Math.floor(Number(xp) || 0));
    const rows = get().tiers;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (safe >= rows[i]!.minXp) return rows[i]!;
    }
    return rows[0]!;
  },
}));

/** Fuera de React — helpers síncronos. */
export function getActiveTiers(): RemoteTierConfig[] {
  return useLevelsConfigStore.getState().tiers;
}

export function getTierByXp(xp: number): RemoteTierConfig {
  return useLevelsConfigStore.getState().getTierByXp(xp);
}

export function getConfigVersion(): number {
  return useLevelsConfigStore.getState().config?.version ?? 1;
}
