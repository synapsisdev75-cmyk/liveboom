/** Equivalente justo de retiro: 1 coin = $20 COP (pack inicial). */
export const COIN_TO_COP = 20;
export const MIN_WITHDRAW_COINS = 50;

export const COIN_PACKAGES = [
  {
    id: '100_coins',
    name: 'Pack Inicial',
    coins: 100,
    amountInCop: 200000,
    priceLabel: '$2.000 COP',
    popular: false,
  },
  {
    id: '500_coins',
    name: 'Pack Popular',
    coins: 500,
    amountInCop: 950000,
    priceLabel: '$9.500 COP',
    popular: true,
  },
  {
    id: '1000_coins',
    name: 'Pack Pro',
    coins: 1000,
    amountInCop: 1800000,
    priceLabel: '$18.000 COP',
    popular: false,
  },
] as const;

export type CoinPackageId = (typeof COIN_PACKAGES)[number]['id'];

export function coinsToCop(coins: number) {
  return Math.max(0, Math.floor(Number(coins) || 0)) * COIN_TO_COP;
}

export function formatCop(amount: number) {
  return `$${amount.toLocaleString('es-CO')} COP`;
}
