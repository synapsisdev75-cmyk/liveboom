import { en } from './en';
import { es, type Catalog, type MessageKey } from './es';
import { fr } from './fr';
import { it } from './it';
import type { AppLocale } from './locales';
import { pt } from './pt';
import { zh } from './zh';

export const CATALOGS: Record<AppLocale, Catalog> = { es, en, fr, it, pt, zh };

function lookup(tree: Catalog, key: MessageKey): string {
  const [group, name] = key.split('.') as [keyof Catalog, string];
  const branch = tree[group] as Record<string, string> | undefined;
  const value = branch?.[name];
  return typeof value === 'string' ? value : key;
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
  const fallback = locale === 'es' ? primary : lookup(CATALOGS.es, key);
  return interpolate(primary || fallback || key, vars);
}

export type { Catalog, MessageKey };
