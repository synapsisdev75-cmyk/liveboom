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

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const requireDbUser = asFn(require('../middleware/requireDbUser'));

const PROMO_COP_PER_DAY = 15_000;
const DAYS_MIN = 1;
const DAYS_MAX = 14;

function clampDays(value) {
  return Math.min(DAYS_MAX, Math.max(DAYS_MIN, Math.floor(Number(value) || 1)));
}

function pricePerDayCop(regionId) {
  return String(regionId || '') === 'nacional'
    ? Math.round(PROMO_COP_PER_DAY * 1.5)
    : PROMO_COP_PER_DAY;
}

/** Wompi usa centavos: $15.000 COP = 1_500_000. */
function amountInCents(days, regionId) {
  return clampDays(days) * pricePerDayCop(regionId) * 100;
}

router.post('/create-order', requireAuth, requireDbUser, async (req, res) => {
  try {
    const days = clampDays(req.body?.days);
    const regionId = String(req.body?.regionId || 'nacional').trim().slice(0, 40) || 'nacional';
    const publicKey = String(process.env.WOMPI_PUBLIC_KEY || '').trim();
    if (!publicKey) {
      res.status(500).json({ error: 'WOMPI_PUBLIC_KEY no está configurada en el API' });
      return;
    }

    const amount = amountInCents(days, regionId);
    const packageId = `promo_${days}d_${regionId}`;
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
      totalCop: amount / 100,
      pricePerDayCop: pricePerDayCop(regionId),
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
