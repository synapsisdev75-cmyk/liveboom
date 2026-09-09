import { create } from 'zustand';
import type { AppLocale } from '../i18n/locales';
import { detectBrowserLocale } from '../i18n/locales';
import {
  applyLocaleToDocument,
  fetchCloudLocale,
  hasExplicitLocale,
  persistCloudLocale,
  readStoredLocale,
  writeStoredLocale,
} from '../lib/localePrefs';

type LocaleState = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  hydrateFromCloud: (uid: string | null) => Promise<void>;
};

let cloudUid: string | null = null;
let cloudTimer: number | null = null;
const initial = readStoredLocale();
if (typeof document !== 'undefined') {
  applyLocaleToDocument(initial);
}

function commit(locale: AppLocale) {
  applyLocaleToDocument(locale);
  writeStoredLocale(locale);
  if (!cloudUid) return;
  if (cloudTimer) window.clearTimeout(cloudTimer);
  cloudTimer = window.setTimeout(() => {
    void persistCloudLocale(cloudUid as string, locale);
  }, 450);
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: initial,
  setLocale: (locale) => {
    commit(locale);
    set({ locale });
  },
  hydrateFromCloud: async (uid) => {
    cloudUid = uid;
    if (!uid) return;
    const cloud = await fetchCloudLocale(uid);
    if (!cloud) {
      commit(useLocaleStore.getState().locale);
      return;
    }
    applyLocaleToDocument(cloud);
    writeStoredLocale(cloud);
    set({ locale: cloud });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('languagechange', () => {
    if (hasExplicitLocale()) return;
    const next = detectBrowserLocale();
    applyLocaleToDocument(next);
    useLocaleStore.setState({ locale: next });
  });
}

export function getLocale(): AppLocale {
  return useLocaleStore.getState().locale;
}
