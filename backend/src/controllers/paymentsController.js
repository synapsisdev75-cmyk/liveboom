const { randomUUID } = require('crypto');
const { prisma, hasDatabase } = require('../lib/prisma');
const { resolveCoinPackage } = require('../lib/coinPackages');
const { createWidgetIntegritySignature } = require('../lib/wompi');

function buildOrderResponse({ dbUser, pack, packageId, amountInCop, publicKey }) {
  const reference = `lb_${dbUser.id}_${randomUUID().replace(/-/g, '')}`;
  const currency = 'COP';
  return {
    reference,
    publicKey,
    amountInCop,
    currency,
    packageId,
    coins: pack.coins,
    integritySignature: createWidgetIntegritySignature(
      reference,
      amountInCop,
      currency,
      process.env.WOMPI_INTEGRITY_SECRET,
    ),
  };
}

async function createOrder(req, res) {
  const packageId = req.body?.packageId;
  if (!packageId || typeof packageId !== 'string') {
    res.status(400).json({ error: 'packageId es obligatorio' });
    return;
  }

  const publicKey = process.env.WOMPI_PUBLIC_KEY;
  if (!publicKey) {
    res.status(500).json({ error: 'WOMPI_PUBLIC_KEY no está configurada' });
    return;
  }

  const resolved = resolveCoinPackage(packageId, req.body?.amountInCop);
  if (resolved.error) {
    res.status(400).json({ error: resolved.error });
    return;
  }

  const amountInCop = resolved.pack.amountInCop;
  const order = buildOrderResponse({
    dbUser: req.dbUser,
    pack: resolved.pack,
    packageId,
    amountInCop,
    publicKey,
  });

  if (hasDatabase && prisma) {
    try {
      await prisma.transaction.create({
        data: {
          userId: req.dbUser.id,
          amount: resolved.pack.coins,
          amountInCop,
          type: 'deposit',
          status: 'pending',
          packageId,
          reference: order.reference,
          currency: order.currency,
        },
      });
    } catch (error) {
      console.error('[payments/create-order] no se persistió la orden:', error.message);
    }
  }

  res.status(201).json(order);
}

module.exports = { createOrder };
