/**
 * Catálogo comercial de banners (COP). Versión persistente; las órdenes congelan su versión.
 * El recargo animado (25 %) se aplica una sola vez sobre el total estático del paquete.
 */

const PRICE_VERSION = 3;
const CURRENCY = 'COP';
const ANIMATED_MULTIPLIER = 1.25;
const ANIMATED_30D_PROJECTION_REF = 499_900;

const STATIC_BY_DAYS = {
  1: 24_900,
  3: 59_900,
  7: 119_900,
  15: 219_900,
  30: 399_900,
};

/** Paquetes por horas (`days: 0`). Siempre presentes aunque el catálogo guardado no los traiga. */
const STATIC_BY_HOURS = {
  2: 1_600,
};

const DAY_OPTIONS = Object.keys(STATIC_BY_DAYS).map(Number);
const HOUR_OPTIONS = Object.keys(STATIC_BY_HOURS).map(Number);

function animatedFromStatic(staticCop) {
  return Math.round(Number(staticCop) * ANIMATED_MULTIPLIER);
}

function packageLabel(days, hours) {
  const d = Math.floor(Number(days) || 0);
  if (d >= 1) return d === 1 ? '1 día' : `${d} días`;
  const h = Math.floor(Number(hours) || 0);
  return h === 1 ? '1 hora' : `${h} horas`;
}

function buildPackage({ id, days, hours, staticCop, animatedCop, dayStatic }) {
  const animated =
    animatedCop != null ? Math.round(Number(animatedCop)) : animatedFromStatic(staticCop);
  const dayAnimated = animatedFromStatic(dayStatic);
  const dayFraction = hours / 24;
  return {
    id: String(id || (days >= 1 ? `${days}d` : `${hours}h`)),
    days,
    label: packageLabel(days, hours),
    staticCop,
    animatedCop: animated,
    staticPerDayCop: staticCop / dayFraction,
    animatedPerDayCop: animated / dayFraction,
    savingsStaticPct: days <= 1 ? 0 : (1 - staticCop / (dayStatic * days)) * 100,
    savingsAnimatedPct: days <= 1 ? 0 : (1 - animated / (dayAnimated * days)) * 100,
    hours,
  };
}

function defaultHourPackages(dayStatic = STATIC_BY_DAYS[1]) {
  return HOUR_OPTIONS.map((hours) =>
    buildPackage({ days: 0, hours, staticCop: STATIC_BY_HOURS[hours], dayStatic }),
  );
}

function buildDefaultPackages() {
  const dayStatic = STATIC_BY_DAYS[1];
  return [
    ...defaultHourPackages(dayStatic),
    ...DAY_OPTIONS.map((days) =>
      buildPackage({ days, hours: days * 24, staticCop: STATIC_BY_DAYS[days], dayStatic }),
    ),
  ];
}

const DEFAULT_PACKAGES = buildDefaultPackages();

function publicCatalog(packages = DEFAULT_PACKAGES, version = PRICE_VERSION) {
  return {
    version,
    currency: CURRENCY,
    animatedMultiplier: ANIMATED_MULTIPLIER,
    animatedMonthlyProjectionRef: ANIMATED_30D_PROJECTION_REF,
    animatedMonthlyProjectionRefNote: 'Referencia no aplicada al cobro',
    masterWidth: 2172,
    masterHeight: 724,
    maxAnimatedSeconds: 20,
    packages,
  };
}

function normalizeCatalog(raw) {
  if (!raw || !Array.isArray(raw.packages) || !raw.packages.length) {
    return publicCatalog();
  }
  const dayRow = raw.packages.find((p) => Number(p.days) === 1);
  const dayStatic = Math.round(Number(dayRow?.staticCop || dayRow?.priceCop || STATIC_BY_DAYS[1]));
  const packages = raw.packages
    .map((row) => {
      const days = Math.floor(Number(row.days) || 0);
      const hours = days >= 1 ? days * 24 : Math.floor(Number(row.hours) || 0);
      const staticCop = Math.round(Number(row.staticCop != null ? row.staticCop : row.priceCop) || 0);
      const validDuration = days >= 1 ? DAY_OPTIONS.includes(days) : HOUR_OPTIONS.includes(hours);
      if (!validDuration || staticCop < 1) return null;
      return buildPackage({
        id: row.id,
        days,
        hours,
        staticCop,
        animatedCop: row.animatedCop,
        dayStatic,
      });
    })
    .filter(Boolean);
  if (!packages.some((p) => p.days >= 1)) return publicCatalog();
  defaultHourPackages(dayStatic).forEach((pkg) => {
    if (!packages.some((p) => p.days === 0 && p.hours === pkg.hours)) packages.push(pkg);
  });
  packages.sort((a, b) => a.hours - b.hours);
  return publicCatalog(packages, Math.max(1, Math.floor(Number(raw.version) || PRICE_VERSION)));
}

/** Sin coincidencia se usa el primer paquete por días (nunca uno por horas). */
function fallbackPackage(catalog) {
  return catalog.packages.find((p) => p.days >= 1) || catalog.packages[0];
}

function packageByDays(days, catalog = publicCatalog()) {
  const d = Math.floor(Number(days) || 0);
  if (d < 1) return fallbackPackage(catalog);
  return catalog.packages.find((p) => p.days === d) || fallbackPackage(catalog);
}

function packageById(id, catalog = publicCatalog()) {
  const key = String(id || '').trim();
  return catalog.packages.find((p) => p.id === key) || fallbackPackage(catalog);
}

function quoteAmountCop(pkg, format) {
  const animated = format === 'animated' || format === 'video';
  return animated ? pkg.animatedCop : pkg.staticCop;
}

function quoteAmountInCents(pkg, format) {
  return quoteAmountCop(pkg, format) * 100;
}

/** Compatibilidad: sin formato = estático (no más barato que el catálogo vigente). */
function promoPackageByDays(days) {
  const pkg = packageByDays(days);
  return { ...pkg, priceCop: pkg.staticCop };
}

function promoPackageById(id) {
  const pkg = packageById(id);
  return { ...pkg, priceCop: pkg.staticCop };
}

function promoTotalCop(days, format = 'static') {
  return quoteAmountCop(packageByDays(days), format);
}

function promoAmountInCents(days, format = 'static') {
  return promoTotalCop(days, format) * 100;
}

const PROMO_PACKAGES = DEFAULT_PACKAGES.map((p) => ({
  ...p,
  priceCop: p.staticCop,
}));

module.exports = {
  PRICE_VERSION,
  CURRENCY,
  ANIMATED_MULTIPLIER,
  ANIMATED_30D_PROJECTION_REF,
  DEFAULT_PACKAGES,
  PROMO_PACKAGES,
  publicCatalog,
  normalizeCatalog,
  packageByDays,
  packageById,
  packageLabel,
  quoteAmountCop,
  quoteAmountInCents,
  promoPackageByDays,
  promoPackageById,
  promoTotalCop,
  promoAmountInCents,
  animatedFromStatic,
};
module.exports.default = module.exports;
