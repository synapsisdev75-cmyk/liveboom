import type { Catalog } from './es';

/**
 * Overlay catalogs must never mutate the English (or Spanish) base.
 * A shallow `{ ...base }` keeps the same group objects, so Object.assign
 * used to leak Russian/Arabic/etc. into `en` and mix languages on screen.
 */
export function mergeCatalog(
  base: Catalog,
  overlay: { [K in keyof Catalog]?: Partial<Catalog[K]> },
): Catalog {
  const next: Record<string, Record<string, string>> = {};
  for (const group of Object.keys(base) as (keyof Catalog)[]) {
    next[String(group)] = { ...(base[group] as Record<string, string>) };
  }
  for (const group of Object.keys(overlay) as (keyof Catalog)[]) {
    const patch = overlay[group];
    if (!patch) continue;
    const key = String(group);
    next[key] = { ...next[key], ...(patch as Record<string, string>) };
  }
  return next as unknown as Catalog;
}
