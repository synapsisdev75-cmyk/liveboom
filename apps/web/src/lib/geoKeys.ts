/** Zona aproximada pública del usuario (nunca coordenadas). */
export type PublicGeo = {
  city: string;
  region: string;
  country: string;
  countryCode: string;
  cityKey: string;
  regionKey: string;
  source: 'ip' | 'gps';
  updatedAtMs: number;
};

const COUNTRY_CODES: Record<string, string> = {
  colombia: 'co',
  mexico: 'mx',
  venezuela: 've',
  ecuador: 'ec',
  peru: 'pe',
  argentina: 'ar',
  chile: 'cl',
  panama: 'pa',
  espana: 'es',
  spain: 'es',
  'estados unidos': 'us',
  'united states': 'us',
};

const REGION_NOISE = /\b(d\.?\s?c\.?|departamento de(l)?|department|province of|provincia de|estado de|state of)\b/g;

/** Texto normalizado para comparar zonas: sin tildes, minúsculas, `_` como separador. */
export function geoKeyPart(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(REGION_NOISE, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Nombre visible del departamento: «Meta Department» → «Meta». */
export function regionDisplayName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+(department|province|state|region)$/i, '')
    .replace(/^(departamento(\s+del?)?|provincia\s+de|estado\s+de)\s+/i, '')
    .trim();
}

/** Nombre visible de la ciudad: «Perímetro Urbano Villavicencio» → «Villavicencio». */
export function cityDisplayName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/^(per[ií]metro\s+urbano|[aá]rea\s+urbana|casco\s+urbano|municipio\s+de|ciudad\s+de)\s+/i, '')
    .trim();
}

export function countryCodeFor(country: unknown, code?: unknown): string {
  const raw = String(code ?? '')
    .trim()
    .toLowerCase();
  if (/^[a-z]{2}$/.test(raw)) return raw;
  const name = geoKeyPart(country).replace(/_/g, ' ');
  return COUNTRY_CODES[name] || geoKeyPart(country);
}

export function buildPublicGeo(input: {
  city?: unknown;
  region?: unknown;
  country?: unknown;
  countryCode?: unknown;
  source: PublicGeo['source'];
  now?: number;
}): PublicGeo | null {
  const countryCode = countryCodeFor(input.country, input.countryCode);
  if (!countryCode) return null;
  const city = cityDisplayName(input.city).slice(0, 80);
  const region = regionDisplayName(input.region).slice(0, 80);
  const cityPart = geoKeyPart(city);
  const regionPart = geoKeyPart(region);
  return {
    city,
    region,
    country: String(input.country ?? '').trim().slice(0, 80),
    countryCode,
    cityKey: cityPart ? `${countryCode}:${cityPart}` : '',
    regionKey: regionPart ? `${countryCode}:${regionPart}` : '',
    source: input.source,
    updatedAtMs: input.now ?? Date.now(),
  };
}

export function parsePublicGeo(raw: unknown): PublicGeo | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const countryCode = String(data.countryCode || '').trim();
  if (!countryCode) return null;
  return {
    city: cityDisplayName(data.city),
    region: regionDisplayName(data.region),
    country: String(data.country || ''),
    countryCode,
    cityKey: String(data.cityKey || ''),
    regionKey: String(data.regionKey || ''),
    source: data.source === 'gps' ? 'gps' : 'ip',
    updatedAtMs: Number(data.updatedAtMs || 0),
  };
}

export function sameGeoKeys(a: PublicGeo | null, b: PublicGeo | null): boolean {
  if (!a || !b) return false;
  return a.countryCode === b.countryCode && a.regionKey === b.regionKey && a.cityKey === b.cityKey;
}
