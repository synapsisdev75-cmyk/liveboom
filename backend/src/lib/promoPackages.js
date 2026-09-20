/**
 * Catálogo comercial de banners (COP). Versión persistente; las órdenes congelan su versión.
 * El recargo animado (25 %) se aplica una sola vez sobre el total estático del paquete.
 */

const PRICE_VERSION = 2;
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

function animatedFromStatic(staticCop) {
  return Math.round(Number(staticCop) * ANIMATED_MULTIPLIER);
}

function buildDefaultPackages() {
  return [1, 3, 7, 15, 30].map((days) => {
    const staticCop = STATIC_BY_DAYS[days];
    const animatedCop = animatedFromStatic(staticCop);
    const dayStatic = STATIC_BY_DAYS[1];
    const dayAnimated = animatedFromStatic(dayStatic);
    const savingsStatic =
      days <= 1 ? 0 : (1 - staticCop / (dayStatic * days)) * 100;
    const savingsAnimated =
      days <= 1 ? 0 : (1 - animatedCop / (dayAnimated * days)) * 100;
    return {
      id: `${days}d`,
      days,
      label: days === 1 ? '1 día' : `${days} días`,
      staticCop,
      animatedCop,
      staticPerDayCop: staticCop / days,
      animatedPerDayCop: animatedCop / days,
      savingsStaticPct: savingsStatic,
      savingsAnimatedPct: savingsAnimated,
      hours: days * 24,
    };
  });
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
  const packages = raw.packages
    .map((row) => {
      const days = Math.floor(Number(row.days) || 0);
      const staticCop = Math.round(Number(row.staticCop != null ? row.staticCop : row.priceCop) || 0);
      if (![1, 3, 7, 15, 30].includes(days) || staticCop < 1) return null;
      const animatedCop =
        row.animatedCop != null ? Math.round(Number(row.animatedCop)) : animatedFromStatic(staticCop);
      const dayRow = raw.packages.find((p) => Number(p.days) === 1);
      const dayStatic = Math.round(Number(dayRow?.staticCop || dayRow?.priceCop || STATIC_BY_DAYS[1]));
      const dayAnimated = animatedFromStatic(dayStatic);
      return {
        id: String(row.id || `${days}d`),
        days,
        label: days === 1 ? '1 día' : `${days} días`,
        staticCop,
        animatedCop,
        staticPerDayCop: staticCop / days,
        animatedPerDayCop: animatedCop / days,
        savingsStaticPct: days <= 1 ? 0 : (1 - staticCop / (dayStatic * days)) * 100,
        savingsAnimatedPct: days <= 1 ? 0 : (1 - animatedCop / (dayAnimated * days)) * 100,
        hours: days * 24,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.days - b.days);
  if (!packages.length) return publicCatalog();
  return publicCatalog(packages, Math.max(1, Math.floor(Number(raw.version) || PRICE_VERSION)));
}

function packageByDays(days, catalog = publicCatalog()) {
  const d = Math.floor(Number(days) || 0);
  return catalog.packages.find((p) => p.days === d) || catalog.packages[0];
}

function packageById(id, catalog = publicCatalog()) {
  const key = String(id || '').trim();
  return catalog.packages.find((p) => p.id === key) || catalog.packages[0];
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
  quoteAmountCop,
  quoteAmountInCents,
  promoPackageByDays,
  promoPackageById,
  promoTotalCop,
  promoAmountInCents,
  animatedFromStatic,
};
module.exports.default = module.exports;
