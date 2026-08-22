const COIN_PACKAGES = {
  '100_coins': { coins: 100, amountInCop: 200000 },
  '500_coins': { coins: 500, amountInCop: 950000 },
  '1000_coins': { coins: 1000, amountInCop: 1800000 },
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
    return { error: 'El monto no coincide con el paquete de coins' };
  }
  return { pack };
}

module.exports = { COIN_PACKAGES, resolveCoinPackage };
