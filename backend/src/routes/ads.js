const express = require('express');
const { randomUUID } = require('crypto');
const { asFn } = require('../lib/asFn');
const { prisma, hasDatabase } = require('../lib/prisma');
const {
  assertIntegrityPair,
  cleanWompiSecret,
  createWidgetIntegritySignature,
} = require('../lib/wompi');
const { rememberOrder, takeOrder } = require('../lib/walletMemory');

const {
  PROMO_PACKAGES,
  promoPackageByDays,
  promoPackageById,
  promoTotalCop,
  promoAmountInCents,
} = require('../lib/promoPackages');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const requireDbUser = asFn(require('../middleware/requireDbUser'));

function resolvePackage(body) {
  const packageId = String(body?.packageId || '').trim();
  if (packageId) {
    const byId = promoPackageById(packageId);
    if (byId) return byId;
  }
  const days = Math.floor(Number(body?.days) || 0);
  return promoPackageByDays(days);
}

function simulatePromoAllowed() {
  const flag = String(
    process.env.ALLOW_SIMULATE_PROMO ?? process.env.ALLOW_SIMULATE_TOPUP ?? '1',
  )
    .trim()
    .toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off' || flag === 'no') return false;
  return true;
}

function wompiConfigured() {
  const publicKey = cleanWompiSecret(process.env.WOMPI_PUBLIC_KEY);
  const integrity = cleanWompiSecret(process.env.WOMPI_INTEGRITY_SECRET);
  if (!publicKey || !integrity) return false;
  try {
    assertIntegrityPair(publicKey, integrity);
    return true;
  } catch {
    return false;
  }
}

router.get('/packages', (_req, res) => {
  res.json({
    packages: PROMO_PACKAGES.map((pkg) => ({
      ...pkg,
      pricePerDayCop: Math.round(pkg.priceCop / pkg.days),
    })),
    simulateAvailable: simulatePromoAllowed(),
    wompiConfigured: wompiConfigured(),
  });
});

router.post('/simulate', requireAuth, requireDbUser, async (req, res) => {
  try {
    if (!simulatePromoAllowed()) {
      res.status(403).json({ error: 'Simulación de publicidad deshabilitada' });
      return;
    }
    const pkg = resolvePackage(req.body);
    const regionId = String(req.body?.regionId || 'nacional').trim().slice(0, 40) || 'nacional';
    const reference = `ad_sim_${String(req.dbUser.id).slice(0, 20)}_${randomUUID().replace(/-/g, '')}`;

    if (hasDatabase && prisma) {
      try {
        await prisma.transaction.create({
          data: {
            userId: req.dbUser.id,
            amount: 0,
            amountInCop: promoAmountInCents(pkg.days),
            type: 'promo_simulated',
            status: 'completed',
            packageId: pkg.id,
            reference,
            currency: 'COP',
          },
        });
      } catch (error) {
        console.warn('[ads/simulate] txn', error.message);
      }
    }

    res.json({
      simulated: true,
      reference,
      packageId: pkg.id,
      days: pkg.days,
      hours: pkg.days * 24,
      amountPaidCop: pkg.priceCop,
      regionId,
    });
  } catch (error) {
    console.error('[ads/simulate]', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo simular el pago de publicidad',
    });
  }
});

router.post('/create-order', requireAuth, requireDbUser, async (req, res) => {
  try {
    const pkg = resolvePackage(req.body);
    const days = pkg.days;
    const regionId = String(req.body?.regionId || 'nacional').trim().slice(0, 40) || 'nacional';
    const publicKey = String(process.env.WOMPI_PUBLIC_KEY || '').trim();
    if (!wompiConfigured()) {
      const reference = `ad_mock_${String(req.dbUser.id).slice(0, 20)}_${randomUUID().replace(/-/g, '')}`;
      res.status(201).json({
        mock: true,
        reference,
        days,
        hours: days * 24,
        totalCop: promoTotalCop(days),
        packageId: pkg.id,
        regionId,
        message:
          'Wompi no está configurado. Usa la activación de prueba o POST /api/ads/simulate.',
      });
      return;
    }

    const amount = promoAmountInCents(days);
    const packageId = pkg.id;
    const reference = `ad_${String(req.dbUser.id).slice(0, 20)}_${randomUUID().replace(/-/g, '')}`;
    const currency = 'COP';
    const integritySecret = assertIntegrityPair(publicKey, process.env.WOMPI_INTEGRITY_SECRET);
    const integritySignature = createWidgetIntegritySignature(
      reference,
      amount,
      currency,
      integritySecret,
    );
    if (!integritySignature) {
      res.status(500).json({ error: 'No se pudo firmar el pago de publicidad' });
      return;
    }

    const uid = req.dbUser.firebaseUid || req.user.uid;
    rememberOrder({
      reference,
      uid,
      coins: 0,
      packageId,
      floor: 0,
      kind: 'promo',
      days,
      hours: days * 24,
      amountInCop: amount,
      regionId,
    });

    if (hasDatabase && prisma) {
      try {
        await prisma.transaction.create({
          data: {
            userId: req.dbUser.id,
            amount: 0,
            amountInCop: amount,
            type: 'promo_pending',
            status: 'pending',
            packageId,
            reference,
            currency: 'COP',
          },
        });
      } catch (error) {
        console.warn('[ads/create-order] txn', error.message);
      }
    }

    res.status(201).json({
      reference,
      publicKey: cleanWompiSecret(publicKey),
      amountInCop: amount,
      amountInCents: amount,
      currency,
      integritySignature,
      days,
      hours: days * 24,
      totalCop: promoTotalCop(days),
      pricePerDayCop: Math.round(pkg.priceCop / pkg.days),
      regionId,
      packageId,
    });
  } catch (error) {
    console.error('[ads/create-order]', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo crear el pago de publicidad',
    });
  }
});

router.post('/complete', requireAuth, requireDbUser, async (req, res) => {
  try {
    const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim() : '';
    if (!reference) {
      res.status(400).json({ error: 'reference es obligatorio' });
      return;
    }
    const uid = req.user.uid;
    const order = takeOrder(reference, uid);
    if (!order || order.kind !== 'promo') {
      res.status(404).json({ error: 'No encontramos ese pago de publicidad' });
      return;
    }

    if (hasDatabase && prisma) {
      try {
        await prisma.transaction.updateMany({
          where: { reference, userId: req.dbUser.id },
          data: { status: 'completed', type: 'promo_paid' },
        });
      } catch (error) {
        console.warn('[ads/complete] txn', error.message);
      }
    }

    res.json({
      ok: true,
      reference,
      days: Number(order.days) || 1,
      hours: Number(order.hours) || 24,
      amountPaidCop: Math.round(Number(order.amountInCop || 0) / 100),
      regionId: order.regionId || 'nacional',
    });
  } catch (error) {
    console.error('[ads/complete]', error);
    res.status(500).json({ error: 'No se pudo confirmar la publicidad' });
  }
});

module.exports = router;
module.exports.default = router;
