/** Paquetes de publicidad — mantener sincronizado con `apps/web/src/lib/promoRegions.ts`. */
const PROMO_PACKAGES = [
  { id: '1d', days: 1, priceCop: 19_900, label: '1 día' },
  { id: '3d', days: 3, priceCop: 49_900, label: '3 días' },
  { id: '7d', days: 7, priceCop: 99_900, label: '7 días' },
  { id: '15d', days: 15, priceCop: 179_900, label: '15 días' },
  { id: '30d', days: 30, priceCop: 299_900, label: '30 días' },
];

function promoPackageByDays(days) {
  const d = Math.floor(Number(days) || PROMO_PACKAGES[0].days);
  return PROMO_PACKAGES.find((p) => p.days === d) || PROMO_PACKAGES[0];
}

function promoPackageById(id) {
  return PROMO_PACKAGES.find((p) => p.id === id) || PROMO_PACKAGES[0];
}

function promoTotalCop(days) {
  return promoPackageByDays(days).priceCop;
}

function promoAmountInCents(days) {
  return promoTotalCop(days) * 100;
}

module.exports = {
  PROMO_PACKAGES,
  promoPackageByDays,
  promoPackageById,
  promoTotalCop,
  promoAmountInCents,
};
