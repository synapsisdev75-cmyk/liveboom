import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { firebaseApp } from './firebase';
import {
  applySemanticTokens,
  clampIntensity,
  DEFAULT_INTENSITY,
  resolveSemanticTokens,
  tokensToCssMap,
} from './appearanceTokens';

export const APPEARANCE_STORAGE_KEY = 'liveboom:appearance';

export type AppearanceTheme = 'dark' | 'light';
export type AppearanceAccent =
  | 'default'
  | 'pink'
  | 'blue'
  | 'green'
  | 'orange'
  | 'red'
  | 'gold'
  | 'violet';

export type AppearancePrefs = {
  theme: AppearanceTheme;
  accent: AppearanceAccent;
  darkIntensity: number;
  lightIntensity: number;
};

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  theme: 'dark',
  accent: 'default',
  darkIntensity: DEFAULT_INTENSITY,
  lightIntensity: DEFAULT_INTENSITY,
};

export const ACCENT_OPTIONS: {
  id: AppearanceAccent;
  label: string;
  swatch: string;
}[] = [
  { id: 'default', label: 'Predeterminado', swatch: 'linear-gradient(135deg,#ec4899,#06b6d4)' },
  { id: 'pink', label: 'Rosa', swatch: '#f472b6' },
  { id: 'blue', label: 'Azul', swatch: '#22d3ee' },
  { id: 'green', label: 'Verde', swatch: '#34d399' },
  { id: 'orange', label: 'Naranja', swatch: '#fb923c' },
  { id: 'red', label: 'Rojo', swatch: '#f87171' },
  { id: 'gold', label: 'Dorado', swatch: '#f5c84c' },
  { id: 'violet', label: 'Violeta', swatch: '#a855f7' },
];

const ACCENT_IDS = new Set<AppearanceAccent>(ACCENT_OPTIONS.map((item) => item.id));

export function isAppearanceTheme(value: unknown): value is AppearanceTheme {
  return value === 'dark' || value === 'light';
}

export function isAppearanceAccent(value: unknown): value is AppearanceAccent {
  return typeof value === 'string' && ACCENT_IDS.has(value as AppearanceAccent);
}

export function parseAppearancePrefs(raw: unknown): AppearancePrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_APPEARANCE };
  const data = raw as Record<string, unknown>;
  const themeRaw = data.themeMode ?? data.theme;
  const accentRaw = data.accentPalette ?? data.accent;
  return {
    theme: isAppearanceTheme(themeRaw) ? themeRaw : DEFAULT_APPEARANCE.theme,
    accent: isAppearanceAccent(accentRaw) ? accentRaw : DEFAULT_APPEARANCE.accent,
    darkIntensity: clampIntensity(data.darkIntensity ?? DEFAULT_INTENSITY),
    lightIntensity: clampIntensity(data.lightIntensity ?? DEFAULT_INTENSITY),
  };
}

export function readStoredAppearance(): AppearancePrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_APPEARANCE };
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    return parseAppearancePrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function writeStoredAppearance(prefs: AppearancePrefs) {
  if (typeof window === 'undefined') return;
  try {
    const tokens = resolveSemanticTokens(
      prefs.theme,
      prefs.accent,
      prefs.theme === 'dark' ? prefs.darkIntensity : prefs.lightIntensity,
    );
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({
        theme: prefs.theme,
        accent: prefs.accent,
        themeMode: prefs.theme,
        accentPalette: prefs.accent,
        darkIntensity: prefs.darkIntensity,
        lightIntensity: prefs.lightIntensity,
        css: tokensToCssMap(tokens),
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function applyAppearanceToDocument(prefs: AppearancePrefs) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-lb-theme', prefs.theme);
  root.setAttribute('data-lb-accent', prefs.accent);
  root.setAttribute(
    'data-lb-intensity',
    String(prefs.theme === 'dark' ? prefs.darkIntensity : prefs.lightIntensity),
  );
  root.style.colorScheme = prefs.theme;
  applySemanticTokens(
    root,
    resolveSemanticTokens(
      prefs.theme,
      prefs.accent,
      prefs.theme === 'dark' ? prefs.darkIntensity : prefs.lightIntensity,
    ),
  );
}

export async function fetchCloudAppearance(uid: string): Promise<AppearancePrefs | null> {
  const id = String(uid || '').trim();
  if (!id) return null;
  try {
    const snap = await getDoc(doc(getFirestore(firebaseApp), 'users', id));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    if (
      !isAppearanceTheme(data.appearanceTheme) &&
      !isAppearanceTheme(data.themeMode) &&
      !isAppearanceAccent(data.appearanceAccent) &&
      !isAppearanceAccent(data.accentPalette)
    ) {
      return null;
    }
    return parseAppearancePrefs({
      theme: data.appearanceTheme ?? data.themeMode,
      accent: data.appearanceAccent ?? data.accentPalette,
      themeMode: data.themeMode ?? data.appearanceTheme,
      accentPalette: data.accentPalette ?? data.appearanceAccent,
      darkIntensity: data.darkIntensity,
      lightIntensity: data.lightIntensity,
    });
  } catch {
    return null;
  }
}

export async function persistCloudAppearance(uid: string, prefs: AppearancePrefs): Promise<void> {
  const id = String(uid || '').trim();
  if (!id) return;
  try {
    await setDoc(
      doc(getFirestore(firebaseApp), 'users', id),
      {
        appearanceTheme: prefs.theme,
        appearanceAccent: prefs.accent,
        themeMode: prefs.theme,
        accentPalette: prefs.accent,
        darkIntensity: prefs.darkIntensity,
        lightIntensity: prefs.lightIntensity,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch {
    /* rules / offline */
  }
}
