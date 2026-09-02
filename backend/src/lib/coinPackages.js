/** Equivalente justo de retiro: 1 blast = $50 COP. */
const COIN_TO_COP = 50;
const MIN_WITHDRAW_COINS = 50;

/** Precio final cliente (COP) para paquetes desde Popular en adelante. */
const FIXED_PACK_PRICE_COP = {
  200: 10_900,
  350: 17_900,
  500: 24_900,
  750: 36_900,
  1000: 48_900,
  1500: 71_900,
  2500: 118_900,
  5000: 234_900,
  7500: 349_900,
  25000: 1_154_900,
};

const ENTRY_PACK_MARKUP = 0.0265;
const ENTRY_PACK_FEE_COP = 700;

function entryPackAmountInCop(blast) {
  const baseCop = blast * COIN_TO_COP;
  return Math.round(baseCop * (1 + ENTRY_PACK_MARKUP) + ENTRY_PACK_FEE_COP) * 100;
}

function packAmountInCop(blast) {
  if (blast === 125 || blast === 150) return entryPackAmountInCop(blast);
  const fixed = FIXED_PACK_PRICE_COP[blast];
  if (fixed !== undefined) return fixed * 100;
  let rate = 50;
  if (blast >= 1000) rate = 42.5;
  else if (blast >= 200) rate = 45;
  return Math.round(blast * rate * 100);
}

const COIN_PACKAGES = {
  impulso_125: { coins: 125, amountInCop: packAmountInCop(125) },
  plus_150: { coins: 150, amountInCop: packAmountInCop(150) },
  popular_200: { coins: 200, amountInCop: packAmountInCop(200) },
  fan_350: { coins: 350, amountInCop: packAmountInCop(350) },
  pro_500: { coins: 500, amountInCop: packAmountInCop(500) },
  power_750: { coins: 750, amountInCop: packAmountInCop(750) },
  gold_1000: { coins: 1000, amountInCop: packAmountInCop(1000) },
  gold_plus_1500: { coins: 1500, amountInCop: packAmountInCop(1500) },
  vip_2500: { coins: 2500, amountInCop: packAmountInCop(2500) },
  vip_plus_5000: { coins: 5000, amountInCop: packAmountInCop(5000) },
  diamond_7500: { coins: 7500, amountInCop: packAmountInCop(7500) },
  diamond_plus_10000: { coins: 10000, amountInCop: packAmountInCop(10000) },
  titan_25000: { coins: 25000, amountInCop: packAmountInCop(25000) },
};

function resolveCoinPackage(packageId, amountInCop) {
  const pack = COIN_PACKAGES[packageId];
  if (!pack) {
    return { error: `Paquete inválido: ${packageId}` };
  }
  if (
    amountInCop !== undefined &&
    amountInCop !== null &&
    amountInCop !== '' &&
    Number(amountInCop) !== pack.amountInCop
  ) {
    return { error: 'El monto no coincide con el paquete de blast' };
  }
  return { pack };
}

function coinsToCop(coins) {
  return Math.max(0, Math.floor(Number(coins) || 0)) * COIN_TO_COP;
}

module.exports = {
  COIN_PACKAGES,
  COIN_TO_COP,
  MIN_WITHDRAW_COINS,
  resolveCoinPackage,
  coinsToCop,
};
