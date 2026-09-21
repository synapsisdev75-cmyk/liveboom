import { create } from 'zustand';
import {
  buildDefaultCoinPackages,
  listenCoinPackagesConfig,
  listenGiftsCatalog,
  mergeCoinPackages,
  mergeGiftsCatalog,
  type EditableCoinPackage,
  type EditableGift,
} from '../lib/catalogConfigFirestore';
import { setRuntimeCoinPackages, setRuntimeGiftCatalog } from '../lib/catalogRuntime';

type State = {
  ready: boolean;
  gifts: EditableGift[];
  packages: EditableCoinPackage[];
  giftsVersion: number;
  packsVersion: number;
  hydrate: () => () => void;
};

export const useCatalogConfigStore = create<State>((set) => ({
  ready: false,
  gifts: [],
  packages: buildDefaultCoinPackages().packages,
  giftsVersion: 1,
  packsVersion: 1,

  hydrate: () => {
    setRuntimeGiftCatalog([]);
    setRuntimeCoinPackages(buildDefaultCoinPackages().packages);
    const unsubGifts = listenGiftsCatalog((doc) => {
      const gifts = mergeGiftsCatalog(doc);
      setRuntimeGiftCatalog(gifts);
      set({
        ready: true,
        gifts,
        giftsVersion: doc?.version ?? 1,
      });
    });
    const unsubPacks = listenCoinPackagesConfig((doc) => {
      const packages = mergeCoinPackages(doc);
      setRuntimeCoinPackages(packages);
      set({
        ready: true,
        packages,
        packsVersion: doc?.version ?? 1,
      });
    });
    return () => {
      unsubGifts();
      unsubPacks();
    };
  },
}));
