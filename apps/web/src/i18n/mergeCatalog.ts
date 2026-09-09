import type { Catalog } from './es';

export function mergeCatalog(
  base: Catalog,
  overlay: { [K in keyof Catalog]?: Partial<Catalog[K]> },
): Catalog {
  const next: Catalog = { ...base };
  for (const group of Object.keys(overlay) as (keyof Catalog)[]) {
    const patch = overlay[group];
    if (!patch) continue;
    Object.assign(next[group], patch);
  }
  return next;
}
