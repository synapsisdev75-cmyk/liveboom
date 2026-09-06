import { create } from 'zustand';
import {
  applyAppearanceToDocument,
  DEFAULT_APPEARANCE,
  fetchCloudAppearance,
  persistCloudAppearance,
  readStoredAppearance,
  writeStoredAppearance,
  type AppearanceAccent,
  type AppearancePrefs,
  type AppearanceTheme,
} from '../lib/appearance';
import { clampIntensity } from '../lib/appearanceTokens';

type AppearanceState = AppearancePrefs & {
  setTheme: (theme: AppearanceTheme) => void;
  setAccent: (accent: AppearanceAccent) => void;
  setDarkIntensity: (value: number) => void;
  setLightIntensity: (value: number) => void;
  toggleTheme: () => void;
  resetAppearance: () => void;
  hydrateFromCloud: (uid: string | null) => Promise<void>;
};

let cloudUid: string | null = null;
let cloudTimer: number | null = null;
const initialPrefs = readStoredAppearance();
if (typeof document !== 'undefined') {
  applyAppearanceToDocument(initialPrefs);
  writeStoredAppearance(initialPrefs);
}

function snapshot(state: AppearancePrefs): AppearancePrefs {
  return {
    theme: state.theme,
    accent: state.accent,
    darkIntensity: state.darkIntensity,
    lightIntensity: state.lightIntensity,
  };
}

function commit(prefs: AppearancePrefs) {
  applyAppearanceToDocument(prefs);
  writeStoredAppearance(prefs);
  if (!cloudUid) return;
  if (cloudTimer) window.clearTimeout(cloudTimer);
  cloudTimer = window.setTimeout(() => {
    void persistCloudAppearance(cloudUid as string, prefs);
  }, 450);
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  ...initialPrefs,
  setTheme: (theme) => {
    const prefs = { ...snapshot(get()), theme };
    commit(prefs);
    set({ theme });
  },
  setAccent: (accent) => {
    const prefs = { ...snapshot(get()), accent };
    commit(prefs);
    set({ accent });
  },
  setDarkIntensity: (value) => {
    const prefs = { ...snapshot(get()), darkIntensity: clampIntensity(value) };
    commit(prefs);
    set({ darkIntensity: prefs.darkIntensity });
  },
  setLightIntensity: (value) => {
    const prefs = { ...snapshot(get()), lightIntensity: clampIntensity(value) };
    commit(prefs);
    set({ lightIntensity: prefs.lightIntensity });
  },
  toggleTheme: () => {
    const theme: AppearanceTheme = get().theme === 'dark' ? 'light' : 'dark';
    const prefs = { ...snapshot(get()), theme };
    commit(prefs);
    set({ theme });
  },
  resetAppearance: () => {
    const prefs = { ...DEFAULT_APPEARANCE };
    commit(prefs);
    set(prefs);
  },
  hydrateFromCloud: async (uid) => {
    cloudUid = uid;
    if (!uid) return;
    const cloud = await fetchCloudAppearance(uid);
    if (!cloud) {
      commit(snapshot(get()));
      return;
    }
    applyAppearanceToDocument(cloud);
    writeStoredAppearance(cloud);
    set(cloud);
  },
}));
