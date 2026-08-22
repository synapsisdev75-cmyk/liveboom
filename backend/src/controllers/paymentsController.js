const { randomUUID } = require('crypto');
const { prisma } = require('../lib/prisma');
const { resolveCoinPackage } = require('../lib/coinPackages');
const { createWidgetIntegritySignature } = require('../lib/wompi');

async function createOrder(req, res) {
  const packageId = req.body?.packageId;
  const amountInCop = Number(req.body?.amountInCop);

  if (!packageId || !Number.isInteger(amountInCop) || amountInCop <= 0) {
    res.status(400).json({ error: 'packageId y amountInCop (centavos COP) son obligatorios' });
    return;
  }

  const publicKey = process.env.WOMPI_PUBLIC_KEY;
  if (!publicKey) {
    res.status(500).json({ error: 'WOMPI_PUBLIC_KEY no está configurada' });
    return;
  }

  const resolved = resolveCoinPackage(packageId, amountInCop);
  if (resolved.error) {
    res.status(400).json({ error: resolved.error });
    return;
  }

  const reference = `lb_${req.dbUser.id}_${randomUUID().replace(/-/g, '')}`;
  const currency = 'COP';

  try {
    const transaction = await prisma.transaction.create({
      data: {
        userId: req.dbUser.id,
        amount: resolved.pack.coins,
        amountInCop,
        type: 'deposit',
        status: 'pending',
        packageId,
        reference,
        currency,
      },
    });

    res.status(201).json({
      reference: transaction.reference,
      publicKey,
      amountInCop: transaction.amountInCop,
      currency,
      packageId,
      coins: transaction.amount,
      integritySignature: createWidgetIntegritySignature(
        transaction.reference,
        transaction.amountInCop,
        currency,
        process.env.WOMPI_INTEGRITY_SECRET,
      ),
    });
  } catch (error) {
    console.error('[payments/create-order]', error);
    res.status(500).json({ error: 'No se pudo crear la orden de pago' });
  }
}

module.exports = { createOrder };
