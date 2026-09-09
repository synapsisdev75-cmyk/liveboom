import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { firebaseApp } from './firebase';
import {
  detectBrowserLocale,
  htmlLangFor,
  isAppLocale,
  isRtlLocale,
  LOCALE_EXPLICIT_KEY,
  LOCALE_STORAGE_KEY,
  parseAppLocale,
  type AppLocale,
} from '../i18n/locales';

const db = getFirestore(firebaseApp);

export function hasExplicitLocale(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(LOCALE_EXPLICIT_KEY) === '1';
  } catch {
    return false;
  }
}

export function readStoredLocale(): AppLocale {
  if (typeof window === 'undefined') return detectBrowserLocale();
  try {
    if (hasExplicitLocale()) {
      const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (raw && isAppLocale(raw)) return raw;
    }
  } catch {
    /* private mode */
  }
  return detectBrowserLocale();
}

export function writeStoredLocale(locale: AppLocale, explicit = true) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    if (explicit) window.localStorage.setItem(LOCALE_EXPLICIT_KEY, '1');
  } catch {
    /* quota / private mode */
  }
}

export function applyLocaleToDocument(locale: AppLocale) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = htmlLangFor(locale);
  document.documentElement.dir = isRtlLocale(locale) ? 'rtl' : 'ltr';
}

export async function fetchCloudLocale(uid: string): Promise<AppLocale | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    const raw = data.preferredLanguage ?? data.locale;
    return raw ? parseAppLocale(raw) : null;
  } catch {
    return null;
  }
}

export async function persistCloudLocale(uid: string, locale: AppLocale) {
  const id = String(uid || '').trim();
  if (!id) return;
  await setDoc(
    doc(db, 'users', id),
    {
      firebaseUid: id,
      preferredLanguage: locale,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
