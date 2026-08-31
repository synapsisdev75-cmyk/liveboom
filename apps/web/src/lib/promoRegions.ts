/** Regiones de Colombia para publicidad sectorizada (uso interno + targeting). */
export const CO_REGIONS = [
  { id: 'nacional', label: 'Colombia (nacional)' },
  { id: 'bogota', label: 'Bogotá D.C.' },
  { id: 'antioquia', label: 'Antioquia' },
  { id: 'valle', label: 'Valle del Cauca' },
  { id: 'atlantico', label: 'Atlántico' },
  { id: 'cundinamarca', label: 'Cundinamarca' },
  { id: 'santander', label: 'Santander' },
  { id: 'bolivar', label: 'Bolívar' },
  { id: 'norte_santander', label: 'Norte de Santander' },
  { id: 'tolima', label: 'Tolima' },
  { id: 'risaralda', label: 'Risaralda' },
  { id: 'caldas', label: 'Caldas' },
  { id: 'magdalena', label: 'Magdalena' },
  { id: 'cesar', label: 'Cesar' },
  { id: 'meta', label: 'Meta' },
  { id: 'boyaca', label: 'Boyacá' },
  { id: 'huila', label: 'Huila' },
  { id: 'cordoba', label: 'Córdoba' },
  { id: 'narino', label: 'Nariño' },
  { id: 'cauca', label: 'Cauca' },
  { id: 'otros', label: 'Otra región' },
] as const;

export type RegionId = (typeof CO_REGIONS)[number]['id'];

export const PROMO_KINDS = [
  { id: 'live', label: 'Promocionar live' },
  { id: 'image', label: 'Imagen / banner' },
  { id: 'video', label: 'Video / reel' },
  { id: 'marketing', label: 'Marketing / marca' },
] as const;

export type PromoKind = (typeof PROMO_KINDS)[number]['id'];

/** Precio base por día en pesos colombianos (COP). */
export const PROMO_COP_PER_DAY = 15_000;
export const PROMO_DAYS_MIN = 1;
export const PROMO_DAYS_MAX = 14;

/** Nacional cuesta 50% más por día. */
export function promoCopPerDay(regionId: string) {
  const base = PROMO_COP_PER_DAY;
  return regionId === 'nacional' ? Math.round(base * 1.5) : base;
}

/** Centavos COP para Wompi (1 COP = 100 cents). */
export function promoAmountInCents(days: number, regionId: string) {
  const d = Math.min(PROMO_DAYS_MAX, Math.max(PROMO_DAYS_MIN, Math.floor(Number(days) || 1)));
  return d * promoCopPerDay(regionId) * 100;
}

export function promoTotalCop(days: number, regionId: string) {
  return promoAmountInCents(days, regionId) / 100;
}

export function formatPromoCop(amount: number) {
  return `$${Math.round(amount).toLocaleString('es-CO')} COP`;
}

const STATE_ALIASES: Record<string, RegionId> = {
  bogota: 'bogota',
  'bogotá': 'bogota',
  'bogota d.c.': 'bogota',
  'bogotá d.c.': 'bogota',
  'distrito capital': 'bogota',
  antioquia: 'antioquia',
  'valle del cauca': 'valle',
  valle: 'valle',
  atlantico: 'atlantico',
  atlántico: 'atlantico',
  cundinamarca: 'cundinamarca',
  santander: 'santander',
  bolivar: 'bolivar',
  bolívar: 'bolivar',
  'norte de santander': 'norte_santander',
  tolima: 'tolima',
  risaralda: 'risaralda',
  caldas: 'caldas',
  magdalena: 'magdalena',
  cesar: 'cesar',
  meta: 'meta',
  boyaca: 'boyaca',
  boyacá: 'boyaca',
  huila: 'huila',
  cordoba: 'cordoba',
  córdoba: 'cordoba',
  narino: 'narino',
  nariño: 'narino',
  cauca: 'cauca',
};

export function regionLabel(id: string) {
  return CO_REGIONS.find((r) => r.id === id)?.label || id;
}

export function regionFromNominatimState(state: string | null | undefined): RegionId {
  const key = String(state || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (!key) return 'otros';
  for (const [alias, id] of Object.entries(STATE_ALIASES)) {
    const normalizedAlias = alias.normalize('NFD').replace(/\p{M}/gu, '');
    if (key.includes(normalizedAlias) || normalizedAlias.includes(key)) return id;
  }
  return 'otros';
}
