import { ar } from './ar';
import { bn } from './bn';
import { de } from './de';
import { en } from './en';
import { es, type Catalog, type MessageKey } from './es';
import { fr } from './fr';
import { hi } from './hi';
import { it } from './it';
import { ja } from './ja';
import { ko } from './ko';
import type { AppLocale } from './locales';
import { pt } from './pt';
import { ru } from './ru';
import { zh } from './zh';

export const CATALOGS: Record<AppLocale, Catalog> = {
  es,
  en,
  pt,
  fr,
  de,
  it,
  zh,
  ja,
  ko,
  hi,
  bn,
  ar,
  ru,
};

function lookup(tree: Catalog, key: MessageKey): string {
  const [group, name] = key.split('.') as [keyof Catalog, string];
  const branch = tree[group] as Record<string, string> | undefined;
  const value = branch?.[name];
  return typeof value === 'string' ? value : '';
}

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = vars[name];
    return value == null ? `{${name}}` : String(value);
  });
}

export function translate(
  locale: AppLocale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const primary = lookup(CATALOGS[locale], key);
  const english = lookup(CATALOGS.en, key);
  const spanish = lookup(CATALOGS.es, key);
  const text = primary || english || spanish;
  return interpolate(text, vars);
}

export type { Catalog, MessageKey };
