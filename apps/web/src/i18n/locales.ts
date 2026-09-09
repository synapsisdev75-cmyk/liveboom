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
    regionCode: string;
    flagSrc: string;
    htmlLang: string;
    bcp47: string;
    dir: 'ltr' | 'rtl';
  }
> = {
  es: {
    nativeName: 'Español',
    englishName: 'Spanish',
    spanishName: 'Español',
    regionCode: 'ES',
    flagSrc: '/emojis/flags/es.svg',
    htmlLang: 'es',
    bcp47: 'es-ES',
    dir: 'ltr',
  },
  en: {
    nativeName: 'English',
    englishName: 'English',
    spanishName: 'Inglés',
    regionCode: 'US',
    flagSrc: '/emojis/flags/us.svg',
    htmlLang: 'en',
    bcp47: 'en-US',
    dir: 'ltr',
  },
  pt: {
    nativeName: 'Português',
    englishName: 'Portuguese',
    spanishName: 'Portugués',
    regionCode: 'BR',
    flagSrc: '/emojis/flags/br.svg',
    htmlLang: 'pt',
    bcp47: 'pt-BR',
    dir: 'ltr',
  },
  fr: {
    nativeName: 'Français',
    englishName: 'French',
    spanishName: 'Francés',
    regionCode: 'FR',
    flagSrc: '/emojis/flags/fr.svg',
    htmlLang: 'fr',
    bcp47: 'fr-FR',
    dir: 'ltr',
  },
  de: {
    nativeName: 'Deutsch',
    englishName: 'German',
    spanishName: 'Alemán',
    regionCode: 'DE',
    flagSrc: '/emojis/flags/de.svg',
    htmlLang: 'de',
    bcp47: 'de-DE',
    dir: 'ltr',
  },
  it: {
    nativeName: 'Italiano',
    englishName: 'Italian',
    spanishName: 'Italiano',
    regionCode: 'IT',
    flagSrc: '/emojis/flags/it.svg',
    htmlLang: 'it',
    bcp47: 'it-IT',
    dir: 'ltr',
  },
  zh: {
    nativeName: '中文',
    englishName: 'Chinese (Mandarin)',
    spanishName: 'Chino',
    regionCode: 'CN',
    flagSrc: '/emojis/flags/cn.svg',
    htmlLang: 'zh-CN',
    bcp47: 'zh-CN',
    dir: 'ltr',
  },
  ja: {
    nativeName: '日本語',
    englishName: 'Japanese',
    spanishName: 'Japonés',
    regionCode: 'JP',
    flagSrc: '/emojis/flags/jp.svg',
    htmlLang: 'ja',
    bcp47: 'ja-JP',
    dir: 'ltr',
  },
  ko: {
    nativeName: '한국어',
    englishName: 'Korean',
    spanishName: 'Coreano',
    regionCode: 'KR',
    flagSrc: '/emojis/flags/kr.svg',
    htmlLang: 'ko',
    bcp47: 'ko-KR',
    dir: 'ltr',
  },
  hi: {
    nativeName: 'हिन्दी',
    englishName: 'Hindi',
    spanishName: 'Hindi',
    regionCode: 'IN',
    flagSrc: '/emojis/flags/in.svg',
    htmlLang: 'hi',
    bcp47: 'hi-IN',
    dir: 'ltr',
  },
  bn: {
    nativeName: 'বাংলা',
    englishName: 'Bengali',
    spanishName: 'Bengalí',
    regionCode: 'BD',
    flagSrc: '/emojis/flags/bd.svg',
    htmlLang: 'bn',
    bcp47: 'bn-BD',
    dir: 'ltr',
  },
  ar: {
    nativeName: 'العربية',
    englishName: 'Arabic',
    spanishName: 'Árabe',
    regionCode: 'SA',
    flagSrc: '/emojis/flags/sa.svg',
    htmlLang: 'ar',
    bcp47: 'ar',
    dir: 'rtl',
  },
  ru: {
    nativeName: 'Русский',
    englishName: 'Russian',
    spanishName: 'Ruso',
    regionCode: 'RU',
    flagSrc: '/emojis/flags/ru.svg',
    htmlLang: 'ru',
    bcp47: 'ru-RU',
    dir: 'ltr',
  },
};

const LOCALE_SET = new Set<string>(APP_LOCALES);

const LOCALE_ALIASES: Record<string, AppLocale> = {
  english: 'en',
  eng: 'en',
  'en-us': 'en',
  'en-gb': 'en',
  spanish: 'es',
  espanol: 'es',
  español: 'es',
  spa: 'es',
  'es-es': 'es',
  'es-mx': 'es',
  'es-co': 'es',
  portuguese: 'pt',
  portugues: 'pt',
  português: 'pt',
  por: 'pt',
  'pt-br': 'pt',
  'pt-pt': 'pt',
  french: 'fr',
  francais: 'fr',
  français: 'fr',
  'fr-fr': 'fr',
  german: 'de',
  deutsch: 'de',
  'de-de': 'de',
  italian: 'it',
  italiano: 'it',
  'it-it': 'it',
  chinese: 'zh',
  mandarin: 'zh',
  'zh-cn': 'zh',
  'zh-tw': 'zh',
  'zh-hans': 'zh',
  'zh-hant': 'zh',
  japanese: 'ja',
  'ja-jp': 'ja',
  korean: 'ko',
  'ko-kr': 'ko',
  hindi: 'hi',
  'hi-in': 'hi',
  bengali: 'bn',
  bangla: 'bn',
  'bn-bd': 'bn',
  'bn-in': 'bn',
  arabic: 'ar',
  'ar-sa': 'ar',
  'ar-eg': 'ar',
  russian: 'ru',
  ruso: 'ru',
  'ru-ru': 'ru',
};

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && LOCALE_SET.has(value);
}

export function isRtlLocale(locale: AppLocale) {
  return LOCALE_META[locale].dir === 'rtl';
}

export function parseAppLocale(value: unknown, fallback: AppLocale = DEFAULT_LOCALE): AppLocale {
  if (isAppLocale(value)) return value;
  if (typeof value !== 'string') return fallback;
  const short = value.trim().toLowerCase().replaceAll('_', '-');
  if (!short) return fallback;
  if (isAppLocale(short)) return short;
  const aliased = LOCALE_ALIASES[short];
  if (aliased) return aliased;
  if (short.startsWith('zh')) return 'zh';
  const prefix = short.split('-')[0];
  return isAppLocale(prefix) ? prefix : fallback;
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
  return `${meta.nativeName} ${meta.englishName} ${meta.spanishName} ${meta.regionCode} ${id}`.toLowerCase();
}
