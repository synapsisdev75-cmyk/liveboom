export const APP_LOCALES = [
  'es',
  'en',
  'pt',
  'fr',
  'de',
  'it',
  'zh',
  'ja',
  'ko',
  'hi',
  'bn',
  'ar',
  'ru',
] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'es';

export const LOCALE_STORAGE_KEY = 'liveboom:locale';
export const LOCALE_EXPLICIT_KEY = 'liveboom:locale:explicit';

export const LOCALE_META: Record<
  AppLocale,
  {
    nativeName: string;
    englishName: string;
    spanishName: string;
    flag: string;
    htmlLang: string;
    bcp47: string;
    dir: 'ltr' | 'rtl';
  }
> = {
  es: {
    nativeName: 'Español',
    englishName: 'Spanish',
    spanishName: 'Español',
    flag: '🇪🇸',
    htmlLang: 'es',
    bcp47: 'es-ES',
    dir: 'ltr',
  },
  en: {
    nativeName: 'English',
    englishName: 'English',
    spanishName: 'Inglés',
    flag: '🇺🇸',
    htmlLang: 'en',
    bcp47: 'en-US',
    dir: 'ltr',
  },
  pt: {
    nativeName: 'Português',
    englishName: 'Portuguese',
    spanishName: 'Portugués',
    flag: '🇧🇷',
    htmlLang: 'pt',
    bcp47: 'pt-BR',
    dir: 'ltr',
  },
  fr: {
    nativeName: 'Français',
    englishName: 'French',
    spanishName: 'Francés',
    flag: '🇫🇷',
    htmlLang: 'fr',
    bcp47: 'fr-FR',
    dir: 'ltr',
  },
  de: {
    nativeName: 'Deutsch',
    englishName: 'German',
    spanishName: 'Alemán',
    flag: '🇩🇪',
    htmlLang: 'de',
    bcp47: 'de-DE',
    dir: 'ltr',
  },
  it: {
    nativeName: 'Italiano',
    englishName: 'Italian',
    spanishName: 'Italiano',
    flag: '🇮🇹',
    htmlLang: 'it',
    bcp47: 'it-IT',
    dir: 'ltr',
  },
  zh: {
    nativeName: '中文',
    englishName: 'Chinese (Mandarin)',
    spanishName: 'Chino',
    flag: '🇨🇳',
    htmlLang: 'zh-CN',
    bcp47: 'zh-CN',
    dir: 'ltr',
  },
  ja: {
    nativeName: '日本語',
    englishName: 'Japanese',
    spanishName: 'Japonés',
    flag: '🇯🇵',
    htmlLang: 'ja',
    bcp47: 'ja-JP',
    dir: 'ltr',
  },
  ko: {
    nativeName: '한국어',
    englishName: 'Korean',
    spanishName: 'Coreano',
    flag: '🇰🇷',
    htmlLang: 'ko',
    bcp47: 'ko-KR',
    dir: 'ltr',
  },
  hi: {
    nativeName: 'हिन्दी',
    englishName: 'Hindi',
    spanishName: 'Hindi',
    flag: '🇮🇳',
    htmlLang: 'hi',
    bcp47: 'hi-IN',
    dir: 'ltr',
  },
  bn: {
    nativeName: 'বাংলা',
    englishName: 'Bengali',
    spanishName: 'Bengalí',
    flag: '🇧🇩',
    htmlLang: 'bn',
    bcp47: 'bn-BD',
    dir: 'ltr',
  },
  ar: {
    nativeName: 'العربية',
    englishName: 'Arabic',
    spanishName: 'Árabe',
    flag: '🇸🇦',
    htmlLang: 'ar',
    bcp47: 'ar',
    dir: 'rtl',
  },
  ru: {
    nativeName: 'Русский',
    englishName: 'Russian',
    spanishName: 'Ruso',
    flag: '🇷🇺',
    htmlLang: 'ru',
    bcp47: 'ru-RU',
    dir: 'ltr',
  },
};

const LOCALE_SET = new Set<string>(APP_LOCALES);

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && LOCALE_SET.has(value);
}

export function isRtlLocale(locale: AppLocale) {
  return LOCALE_META[locale].dir === 'rtl';
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

export function localeSearchHaystack(id: AppLocale): string {
  const meta = LOCALE_META[id];
  return `${meta.nativeName} ${meta.englishName} ${meta.spanishName} ${id}`.toLowerCase();
}
