const { randomUUID } = require('crypto');
const { prisma } = require('../lib/prisma');
const { resolveCoinPackage } = require('../lib/coinPackages');
const { createWidgetIntegritySignature } = require('../lib/wompi');

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
