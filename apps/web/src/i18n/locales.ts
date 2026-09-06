export const APP_LOCALES = ['es', 'en', 'fr', 'it', 'pt', 'zh'] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'es';

export const LOCALE_STORAGE_KEY = 'liveboom:locale';

export const LOCALE_META: Record<
  AppLocale,
  { nativeName: string; englishName: string; flag: string; htmlLang: string; bcp47: string }
> = {
  es: { nativeName: 'Español', englishName: 'Spanish', flag: '🇪🇸', htmlLang: 'es', bcp47: 'es-ES' },
  en: { nativeName: 'English', englishName: 'English', flag: '🇺🇸', htmlLang: 'en', bcp47: 'en-US' },
  fr: { nativeName: 'Français', englishName: 'French', flag: '🇫🇷', htmlLang: 'fr', bcp47: 'fr-FR' },
  it: { nativeName: 'Italiano', englishName: 'Italian', flag: '🇮🇹', htmlLang: 'it', bcp47: 'it-IT' },
  pt: { nativeName: 'Português', englishName: 'Portuguese', flag: '🇧🇷', htmlLang: 'pt', bcp47: 'pt-BR' },
  zh: { nativeName: '中文', englishName: 'Chinese (Mandarin)', flag: '🇨🇳', htmlLang: 'zh-CN', bcp47: 'zh-CN' },
};

const LOCALE_SET = new Set<string>(APP_LOCALES);

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && LOCALE_SET.has(value);
}

export function parseAppLocale(value: unknown, fallback: AppLocale = DEFAULT_LOCALE): AppLocale {
  if (isAppLocale(value)) return value;
  if (typeof value !== 'string') return fallback;
  const short = value.trim().toLowerCase().replace('_', '-');
  if (short.startsWith('zh')) return 'zh';
  const two = short.slice(0, 2);
  return isAppLocale(two) ? two : fallback;
}

export function detectBrowserLocale(): AppLocale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  const candidates = [navigator.language, ...(navigator.languages ?? [])];
  for (const item of candidates) {
    const raw = String(item || '')
      .trim()
      .toLowerCase()
      .replace('_', '-');
    if (!raw) continue;
    if (raw.startsWith('zh')) return 'zh';
    const two = raw.slice(0, 2);
    if (isAppLocale(two)) return two;
  }
  return DEFAULT_LOCALE;
}

export function htmlLangFor(locale: AppLocale): string {
  return LOCALE_META[locale].htmlLang;
}

export function bcp47For(locale: AppLocale): string {
  return LOCALE_META[locale].bcp47;
}

/** Codes accepted by Google Translate / MyMemory. */
export function translateApiCode(locale: AppLocale | 'auto'): string {
  if (locale === 'auto') return 'auto';
  if (locale === 'zh') return 'zh-CN';
  return locale;
}
