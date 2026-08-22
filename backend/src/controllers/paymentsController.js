const { randomUUID } = require('crypto');
const { prisma, hasDatabase } = require('../lib/prisma');
const { resolveCoinPackage } = require('../lib/coinPackages');
const {
  assertIntegrityPair,
  cleanWompiSecret,
  createWidgetIntegritySignature,
} = require('../lib/wompi');
const { credit, rememberOrder, takeOrder } = require('../lib/walletMemory');
const dbUserFromTokenMod = require('../lib/dbUserFromToken');

function dbUserFromToken(decoded) {
  const fn =
    typeof dbUserFromTokenMod === 'function'
      ? dbUserFromTokenMod
      : dbUserFromTokenMod.dbUserFromToken || dbUserFromTokenMod.default;
  return fn(decoded);
}

function userForOrder(req) {
  return req.dbUser || (req.user ? dbUserFromToken(req.user) : null);
}

function buildOrderResponse({ dbUser, pack, packageId, amountInCop, publicKey }) {
  const reference = `lb_${String(dbUser.id).slice(0, 24)}_${randomUUID().replace(/-/g, '')}`;
  const currency = 'COP';
  const integritySecret = assertIntegrityPair(publicKey, process.env.WOMPI_INTEGRITY_SECRET);
  const integritySignature = createWidgetIntegritySignature(
    reference,
    amountInCop,
    currency,
    integritySecret,
  );
  if (!integritySignature) {
    throw new Error('No se pudo generar la firma de integridad de Wompi');
  }
  return {
    reference,
    publicKey: cleanWompiSecret(publicKey),
    amountInCop,
    amountInCents: amountInCop,
    currency,
    packageId,
    coins: pack.coins,
    integritySignature,
  };
}

async function completeWidget(req, res) {
  try {
    const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim() : '';
    if (!reference) {
      res.status(400).json({ error: 'reference es obligatorio' });
      return;
    }

    const uid = req.user?.uid;
    const order = takeOrder(reference, uid);
    if (!order) {
      res.status(404).json({ error: 'No encontramos esa orden de recarga' });
      return;
    }

    const coinsBalance = credit(uid, order.coins);

    if (hasDatabase && prisma) {
      try {
        await prisma.user.update({
          where: { firebaseUid: uid },
          data: { coinsBalance: { increment: order.coins } },
        });
      } catch (error) {
        console.warn('[payments/complete-widget] no se persistió el saldo:', error.message);
      }
    }

    res.json({
      reference,
      coins: order.coins,
      coinsBalance,
    });
  } catch (error) {
    console.error('[payments/complete-widget]', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'No se pudo acreditar la recarga',
      });
    }
  }
}

function getPaymentStatus(_req, res) {
  const publicKey = cleanWompiSecret(process.env.WOMPI_PUBLIC_KEY);
  const integrity = cleanWompiSecret(process.env.WOMPI_INTEGRITY_SECRET);
  const sandbox = publicKey.startsWith('pub_test_');
  let pairOk = false;
  try {
    if (publicKey && integrity) {
      assertIntegrityPair(publicKey, integrity);
      pairOk = true;
    }
  } catch {
    pairOk = false;
  }
  res.json({
    configured: Boolean(publicKey && integrity),
    sandbox,
    pairOk,
    simulateAvailable: sandbox,
  });
}

async function simulateTopup(req, res) {
  try {
    const publicKey = cleanWompiSecret(process.env.WOMPI_PUBLIC_KEY);
    if (!publicKey.startsWith('pub_test_')) {
      res.status(403).json({ error: 'Simulación solo disponible en modo pruebas' });
      return;
    }
    const packageId = req.body?.packageId;
    if (!packageId || typeof packageId !== 'string') {
      res.status(400).json({ error: 'packageId es obligatorio' });
      return;
    }
    const resolved = resolveCoinPackage(packageId, req.body?.amountInCop);
    if (resolved.error) {
      res.status(400).json({ error: resolved.error });
      return;
    }
    const dbUser = userForOrder(req);
    if (!dbUser?.id) {
      res.status(401).json({ error: 'No hay usuario para acreditar coins' });
      return;
    }
    const uid = dbUser.firebaseUid || dbUser.id;
    const coinsBalance = credit(uid, resolved.pack.coins);
    if (hasDatabase && prisma) {
      try {
        await prisma.user.update({
          where: { firebaseUid: uid },
          data: { coinsBalance: { increment: resolved.pack.coins } },
        });
      } catch (error) {
        console.warn('[payments/simulate] no se persistió el saldo:', error.message);
      }
    }
    res.json({
      coins: resolved.pack.coins,
      coinsBalance,
      simulated: true,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo simular la recarga',
    });
  }
}

async function createOrder(req, res) {
  try {
    const packageId = req.body?.packageId;
    if (!packageId || typeof packageId !== 'string') {
      res.status(400).json({ error: 'packageId es obligatorio' });
      return;
    }

    const publicKey = String(process.env.WOMPI_PUBLIC_KEY || '').trim();
    if (!publicKey) {
      res.status(500).json({ error: 'WOMPI_PUBLIC_KEY no está configurada en el API' });
      return;
    }

    const resolved = resolveCoinPackage(packageId, req.body?.amountInCop);
    if (resolved.error) {
      res.status(400).json({ error: resolved.error });
      return;
    }

    const dbUser = userForOrder(req);
    if (!dbUser?.id) {
      res.status(401).json({ error: 'No hay usuario para crear el pedido' });
      return;
    }

    const amountInCop = resolved.pack.amountInCop;
    const order = buildOrderResponse({
      dbUser,
      pack: resolved.pack,
      packageId,
      amountInCop,
      publicKey,
    });

    rememberOrder({
      reference: order.reference,
      uid: dbUser.firebaseUid || dbUser.id,
      coins: resolved.pack.coins,
      packageId,
    });

    if (hasDatabase && prisma) {
      try {
        await prisma.transaction.create({
          data: {
            userId: dbUser.id,
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
  } catch (error) {
    console.error('[payments/create-order]', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'No se pudo crear el pedido de Wompi',
      });
    }
  }
}

module.exports = { createOrder, completeWidget, getPaymentStatus, simulateTopup };
module.exports.createOrder = createOrder;
module.exports.completeWidget = completeWidget;
module.exports.getPaymentStatus = getPaymentStatus;
module.exports.simulateTopup = simulateTopup;
