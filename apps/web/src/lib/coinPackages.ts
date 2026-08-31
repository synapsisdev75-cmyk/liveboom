/** Equivalente justo de retiro: 1 blast = $50 COP. */
export const COIN_TO_COP = 50;
export const MIN_WITHDRAW_COINS = 50;

/** Descuento por volumen al comprar paquetes (centavos Wompi = blast × rate × 100). */
function packAmountInCop(blast: number) {
  let rate = 50;
  if (blast >= 1000) rate = 42.5;
  else if (blast >= 200) rate = 45;
  return Math.round(blast * rate * 100);
}

export const COIN_PACKAGES = [
  { id: 'flash_20', name: 'Flash', coins: 20, amountInCop: packAmountInCop(20), popular: false, bestValue: false, artUrl: '/blast/pack-flash.png' },
  { id: 'mini_40', name: 'Mini', coins: 40, amountInCop: packAmountInCop(40), popular: false, bestValue: false, artUrl: '/blast/pack-mini.png' },
  { id: 'inicio_75', name: 'Inicio', coins: 75, amountInCop: packAmountInCop(75), popular: false, bestValue: false, artUrl: '/blast/pack-inicio.png' },
  { id: 'basico_100', name: 'Básico', coins: 100, amountInCop: packAmountInCop(100), popular: false, bestValue: false, artUrl: '/blast/pack-basico.png' },
  { id: 'impulso_125', name: 'Impulso', coins: 125, amountInCop: packAmountInCop(125), popular: false, bestValue: false, artUrl: '/blast/pack-impulso.png' },
  { id: 'plus_150', name: 'Plus', coins: 150, amountInCop: packAmountInCop(150), popular: false, bestValue: false, artUrl: '/blast/pack-plus.png' },
  { id: 'popular_200', name: 'Popular', coins: 200, amountInCop: packAmountInCop(200), popular: true, bestValue: false, artUrl: '/blast/pack-popular.png' },
  { id: 'fan_350', name: 'Fan', coins: 350, amountInCop: packAmountInCop(350), popular: false, bestValue: false, artUrl: '/blast/pack-fan.png' },
  { id: 'pro_500', name: 'Pro', coins: 500, amountInCop: packAmountInCop(500), popular: false, bestValue: false, artUrl: '/blast/pack-pro.png' },
  { id: 'power_750', name: 'Power', coins: 750, amountInCop: packAmountInCop(750), popular: false, bestValue: false, artUrl: '/blast/pack-power.png' },
  { id: 'gold_1000', name: 'Gold', coins: 1000, amountInCop: packAmountInCop(1000), popular: false, bestValue: true, artUrl: '/blast/pack-gold.png' },
  { id: 'gold_plus_1500', name: 'Gold+', coins: 1500, amountInCop: packAmountInCop(1500), popular: false, bestValue: false, artUrl: '/blast/pack-gold-plus.png' },
  { id: 'vip_2500', name: 'VIP', coins: 2500, amountInCop: packAmountInCop(2500), popular: false, bestValue: false, artUrl: '/blast/pack-vip.png' },
  { id: 'vip_plus_5000', name: 'VIP+', coins: 5000, amountInCop: packAmountInCop(5000), popular: false, bestValue: false, artUrl: '/blast/pack-vip-plus.png' },
  { id: 'diamond_7500', name: 'Diamond', coins: 7500, amountInCop: packAmountInCop(7500), popular: false, bestValue: false, artUrl: '/blast/pack-diamond.png' },
  { id: 'diamond_plus_10000', name: 'Diamond+', coins: 10000, amountInCop: packAmountInCop(10000), popular: false, bestValue: false, artUrl: '/blast/pack-diamond-plus.png' },
  { id: 'titan_25000', name: 'Titan', coins: 25000, amountInCop: packAmountInCop(25000), popular: false, bestValue: false, artUrl: '/blast/pack-titan.png' },
] as const;

export type CoinPackageId = (typeof COIN_PACKAGES)[number]['id'];

export function coinsToCop(coins: number) {
  return Math.max(0, Math.floor(Number(coins) || 0)) * COIN_TO_COP;
}

export function formatCop(amount: number) {
  return `$${amount.toLocaleString('es-CO')} COP`;
}

export function packageCopLabel(amountInCents: number) {
  return `COP $${Math.round(amountInCents / 100).toLocaleString('es-CO')}`;
}
