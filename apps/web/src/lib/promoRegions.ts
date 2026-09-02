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

/** Paquetes de publicidad (duración fija + precio COP). Mantener sincronizado con `backend/src/lib/promoPackages.js`. */
export const PROMO_PACKAGES = [
  { id: '1d', days: 1, priceCop: 19_900, label: '1 día' },
  { id: '3d', days: 3, priceCop: 49_900, label: '3 días' },
  { id: '7d', days: 7, priceCop: 99_900, label: '7 días' },
  { id: '15d', days: 15, priceCop: 179_900, label: '15 días' },
  { id: '30d', days: 30, priceCop: 299_900, label: '30 días' },
] as const;

/** Banner publicitario 3:1 — referencia obligatoria para imagen y video. */
export const PROMO_BANNER_WIDTH = 2172;
export const PROMO_BANNER_HEIGHT = 724;
export const PROMO_BANNER_SIZE_LABEL = `${PROMO_BANNER_WIDTH} × ${PROMO_BANNER_HEIGHT}`;

export type PromoPackageId = (typeof PROMO_PACKAGES)[number]['id'];

export const PROMO_DAYS_MIN = PROMO_PACKAGES[0]!.days;
export const PROMO_DAYS_MAX = PROMO_PACKAGES[PROMO_PACKAGES.length - 1]!.days;

export function promoPackageByDays(days: number) {
  const d = Math.floor(Number(days) || PROMO_PACKAGES[0].days);
  return PROMO_PACKAGES.find((p) => p.days === d) ?? PROMO_PACKAGES[0];
}

export function promoPackageById(id: string) {
  return PROMO_PACKAGES.find((p) => p.id === id) ?? PROMO_PACKAGES[0];
}

/** Precio efectivo por día del paquete seleccionado (solo informativo). */
export function promoCopPerDay(days: number, _regionId?: string) {
  const pkg = promoPackageByDays(days);
  return Math.round(pkg.priceCop / pkg.days);
}

/** Centavos COP para Wompi (1 COP = 100 cents). */
export function promoAmountInCents(days: number, _regionId?: string) {
  return promoPackageByDays(days).priceCop * 100;
}

export function promoTotalCop(days: number, _regionId?: string) {
  return promoPackageByDays(days).priceCop;
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
