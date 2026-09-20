/**
 * Proyección administrativa de ingresos publicitarios.
 * No es un cobro ni una garantía de impresiones.
 */

const DEFAULT_PARAMS = {
  dauShare: 0.4,
  impressionsPerUserPerDayPerSlot: 2,
  scenarioDays: 30,
  slots: 3,
  cpmUsd: 1.25,
  occupancy: 0.7,
  animatedUplift: 1.25,
  copPerUsd: 3111.59,
  defaultMaus: [100, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000],
};

function normalizeParams(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const dauShare = Number(p.dauShare);
  const impacts = Number(p.impressionsPerUserPerDayPerSlot);
  const days = Math.floor(Number(p.scenarioDays));
  const slots = Math.floor(Number(p.slots));
  const cpmUsd = Number(p.cpmUsd);
  const occupancy = Number(p.occupancy);
  const animatedUplift = Number(p.animatedUplift);
  const copPerUsd = Number(p.copPerUsd);
  return {
    dauShare: dauShare > 0 && dauShare <= 1 ? dauShare : DEFAULT_PARAMS.dauShare,
    impressionsPerUserPerDayPerSlot:
      impacts > 0 && impacts <= 50 ? impacts : DEFAULT_PARAMS.impressionsPerUserPerDayPerSlot,
    scenarioDays: days >= 1 && days <= 366 ? days : DEFAULT_PARAMS.scenarioDays,
    slots: slots >= 1 && slots <= 12 ? slots : DEFAULT_PARAMS.slots,
    cpmUsd: cpmUsd > 0 && cpmUsd <= 100 ? cpmUsd : DEFAULT_PARAMS.cpmUsd,
    occupancy: occupancy > 0 && occupancy <= 1 ? occupancy : DEFAULT_PARAMS.occupancy,
    animatedUplift: animatedUplift >= 1 && animatedUplift <= 3 ? animatedUplift : DEFAULT_PARAMS.animatedUplift,
    copPerUsd: copPerUsd > 0 && copPerUsd <= 20000 ? copPerUsd : DEFAULT_PARAMS.copPerUsd,
    defaultMaus: Array.isArray(p.defaultMaus) && p.defaultMaus.length
      ? p.defaultMaus.map((n) => Math.max(1, Math.floor(Number(n) || 0))).filter(Boolean)
      : DEFAULT_PARAMS.defaultMaus.slice(),
  };
}

function projectRow(mau, params) {
  const p = normalizeParams(params);
  const safeMau = Math.max(0, Number(mau) || 0);
  const dauEstimated = safeMau * p.dauShare;
  const impressionsPerSlot = dauEstimated * p.impressionsPerUserPerDayPerSlot * p.scenarioDays;
  const impressionsTotal = impressionsPerSlot * p.slots;
  const cpmTotalCop = (impressionsTotal / 1000) * p.cpmUsd * p.copPerUsd;
  const staticIncomeCop = cpmTotalCop * p.occupancy;
  const animatedIncomeCop = staticIncomeCop * p.animatedUplift;
  return {
    mau: safeMau,
    dauEstimated,
    impressionsPerSlot,
    impressionsTotal,
    cpmTotalCop,
    staticIncomeCop,
    animatedIncomeCop,
    staticIncomeCopRounded: Math.round(staticIncomeCop),
    animatedIncomeCopRounded: Math.round(animatedIncomeCop),
    guidance:
      safeMau < 5000
        ? 'Tarifa fija de lanzamiento todavía defendible'
        : 'Evaluar migración a precio por CPM / audiencia',
  };
}

function projectTable(maus, params) {
  const p = normalizeParams(params);
  const list = Array.isArray(maus) && maus.length ? maus : p.defaultMaus;
  return {
    params: p,
    disclaimer:
      'Estimación interna. El 70 % de ocupación y los dos impactos diarios son supuestos, no mediciones ni descuentos al comprador. Estático y animado son escenarios alternativos, no se suman.',
    rows: list.map((mau) => projectRow(mau, p)),
  };
}

module.exports = {
  DEFAULT_PARAMS,
  normalizeParams,
  projectRow,
  projectTable,
};
module.exports.default = module.exports;
