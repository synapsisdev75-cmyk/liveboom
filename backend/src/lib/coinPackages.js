const COIN_PACKAGES = {
  '500_coins': { coins: 500, amountInCop: 500000 },
  '1000_coins': { coins: 1000, amountInCop: 1000000 },
  '5000_coins': { coins: 5000, amountInCop: 4500000 },
  '12000_coins': { coins: 12000, amountInCop: 10000000 },
};

function resolveCoinPackage(packageId, amountInCop) {
  const pack = COIN_PACKAGES[packageId];
  if (!pack) {
    return { error: `Paquete inválido: ${packageId}` };
  }
  if (Number(amountInCop) !== pack.amountInCop) {
    return { error: 'El monto no coincide con el paquete de coins' };
  }
  return { pack };
}

module.exports = { COIN_PACKAGES, resolveCoinPackage };
