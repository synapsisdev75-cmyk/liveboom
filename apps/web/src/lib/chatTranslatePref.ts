import { isAppLocale, type AppLocale } from '../i18n/locales';

const STORAGE_KEY = 'liveboom:chat-translate-target';

/** Idioma elegido por el usuario en «Traducir» del chat; null = aún no eligió (usar idioma de la app). */
export function readChatTranslateTarget(): AppLocale | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isAppLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeChatTranslateTarget(locale: AppLocale) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* quota / modo privado */
  }
}
