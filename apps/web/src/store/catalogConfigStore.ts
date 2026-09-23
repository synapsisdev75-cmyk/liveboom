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
    // null = aún no cargó (sortedLiveGiftCatalog devuelve []). Evita “cargado vacío”.
    setRuntimeGiftCatalog(null);
    setRuntimeCoinPackages(buildDefaultCoinPackages().packages);
    const unsubGifts = listenGiftsCatalog((doc) => {
      const gifts = mergeGiftsCatalog(doc);
      setRuntimeGiftCatalog(gifts);
      set((state) => ({
        ready: true,
        gifts,
        // Incrementar siempre: doc.version puede repetirse y el LIVE
        // no re-renderizaba la caja de regalos (useMemo vacío en APK).
        giftsVersion: state.giftsVersion + 1,
      }));
    });
    const unsubPacks = listenCoinPackagesConfig((doc) => {
      const packages = mergeCoinPackages(doc);
      setRuntimeCoinPackages(packages);
      set((state) => ({
        ready: true,
        packages,
        packsVersion: state.packsVersion + 1,
      }));
    });
    return () => {
      unsubGifts();
      unsubPacks();
    };
  },
}));
