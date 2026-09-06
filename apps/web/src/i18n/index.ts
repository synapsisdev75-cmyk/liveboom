import { useMemo } from 'react';
import type { MessageKey } from './es';
import type { AppLocale } from './locales';
import { LOCALE_META } from './locales';
import { translate } from './translate';
import { getLocale, useLocaleStore } from '../store/localeStore';

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(getLocale(), key, vars);
}

export function useT() {
  const locale = useLocaleStore((state) => state.locale);
  return useMemo(() => {
    const fn = (key: MessageKey, vars?: Record<string, string | number>) =>
      translate(locale, key, vars);
    fn.locale = locale;
    return fn;
  }, [locale]);
}

export function languageLabel(locale: AppLocale, inLocale: AppLocale = locale): string {
  if (inLocale === locale) return LOCALE_META[locale].nativeName;
  return LOCALE_META[locale].nativeName;
}

export function categoryMessageKey(
  id: string | null | undefined,
): Extract<MessageKey, `category.${string}`> {
  switch (id) {
    case 'musica':
    case 'gaming':
    case 'charla':
    case 'deportes':
    case 'arte':
    case 'educacion':
    case 'humor':
    case 'otro':
      return `category.${id}`;
    default:
      return 'category.general';
  }
}

export type { AppLocale, MessageKey };
export { APP_LOCALES, DEFAULT_LOCALE, LOCALE_META, parseAppLocale, bcp47For } from './locales';
export { useLocaleStore, getLocale } from '../store/localeStore';
