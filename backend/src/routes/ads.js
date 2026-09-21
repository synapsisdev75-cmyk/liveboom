const { randomUUID } = require('crypto');
const express = require('express');
const { asFn } = require('../lib/asFn');
const { prisma, hasDatabase } = require('../lib/prisma');
const {
  assertIntegrityPair,
  cleanWompiSecret,
  createPaymentLink,
  createWidgetIntegritySignature,
  createWompiReference,
  getWompiTransaction,
  isWompiMerchantActive,
} = require('../lib/wompi');
const { rememberOrder } = require('../lib/walletMemory');
const { publicCatalog } = require('../lib/promoPackages');
const promo = require('../lib/promoCampaigns');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const requireDbUser = asFn(require('../middleware/requireDbUser'));
const superAdminMod = require('../middleware/requireSuperAdmin');
const requireAdsAdmin = superAdminMod.requireCapability('ads');

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

function httpStatus(code) {
  if (
    code === 'INVALID_MEDIA' ||
    code === 'INVALID_PATH' ||
    code === 'QUOTE_EXPIRED' ||
    code === 'TOO_LARGE'
  ) {
    return 400;
  }
  if (code === 'NOT_FOUND') return 404;
  if (code === 'NOT_PAID') return 409;
  return 500;
}

router.get('/packages', async (_req, res) => {
  try {
    const catalog = await promo.loadCatalog();
    res.json({
      ...catalog,
      packages: catalog.packages,
      simulateAvailable: simulatePromoAllowed(),
      wompiConfigured: wompiConfigured(),
      rotation: 'Los paquetes compran participación en la rotación actual, no exclusividad.',
    });
  } catch (error) {
    res.json({
      ...publicCatalog(),
      simulateAvailable: simulatePromoAllowed(),
      wompiConfigured: wompiConfigured(),
    });
  }
});

router.post('/quotes', requireAuth, requireDbUser, async (req, res) => {
  try {
    const quote = await promo.createQuote({
      uid: req.user.uid,
      packageId: req.body?.packageId,
      days: req.body?.days,
      regionId: req.body?.regionId,
      regionLabel: req.body?.regionLabel,
      kind: req.body?.kind,
      title: req.body?.title,
      linkUrl: req.body?.linkUrl,
      mediaUrl: req.body?.mediaUrl,
      storagePath: req.body?.storagePath,
      mime: req.body?.mime,
      width: req.body?.width,
      height: req.body?.height,
      durationSec: req.body?.durationSec,
      ownerUsername: req.dbUser?.username,
      ownerDisplayName: req.dbUser?.displayName || req.dbUser?.username,
      ownerAvatarUrl: req.dbUser?.avatarUrl || null,
    });
    res.status(201).json({ ok: true, quote });
  } catch (error) {
    const code = error && error.code ? String(error.code) : '';
    res.status(httpStatus(code)).json({
      error: error instanceof Error ? error.message : 'No se pudo cotizar el banner',
    });
  }
});

router.post('/simulate', requireAuth, requireDbUser, async (req, res) => {
  try {
    if (!simulatePromoAllowed()) {
      res.status(403).json({ error: 'Simulación de publicidad deshabilitada' });
      return;
    }
    const quoteId = String(req.body?.quoteId || '').trim();
    let quote = quoteId ? await promo.readQuote(quoteId, req.user.uid) : null;
    if (!quote) {
      const created = await promo.createQuote({
        uid: req.user.uid,
        packageId: req.body?.packageId,
        days: req.body?.days,
        regionId: req.body?.regionId,
        regionLabel: req.body?.regionLabel,
        kind: req.body?.kind,
        title: req.body?.title,
        linkUrl: req.body?.linkUrl,
        mediaUrl: req.body?.mediaUrl,
        storagePath: req.body?.storagePath,
        mime: req.body?.mime,
        width: req.body?.width,
        height: req.body?.height,
        durationSec: req.body?.durationSec,
        ownerUsername: req.dbUser?.username,
        ownerDisplayName: req.dbUser?.displayName || req.dbUser?.username,
        ownerAvatarUrl: req.dbUser?.avatarUrl || null,
      });
      quote = await promo.readQuote(created.quoteId, req.user.uid);
    }
    const reference = `ad_sim_${String(req.dbUser.id).slice(0, 20)}_${randomUUID().replace(/-/g, '')}`;
    const order = await promo.createPendingOrder({
      quote,
      reference,
      uid: req.user.uid,
      userId: req.dbUser.id,
    });
    const campaignId = await promo.writeCampaignFromOrder(order, { simulate: true, approved: true });
    await promo.persistOrder({
      ...order,
      status: 'simulated',
      paymentStatus: 'simulated',
      reviewStatus: 'approved',
      publishStatus: 'live',
      campaignId,
    });
    if (hasDatabase && prisma) {
      try {
        await prisma.transaction.create({
          data: {
            userId: req.dbUser.id,
            amount: 0,
            amountInCop: order.amountInCents,
            type: 'promo_simulated',
            status: 'completed',
            packageId: order.packageId,
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
      campaignId,
      packageId: order.packageId,
      days: order.days,
      hours: order.hours,
      amountPaidCop: order.totalCop,
      format: order.format,
      regionId: order.regionId,
    });
  } catch (error) {
    const code = error && error.code ? String(error.code) : '';
    console.error('[ads/simulate]', error);
    res.status(httpStatus(code)).json({
      error: error instanceof Error ? error.message : 'No se pudo simular el pago de publicidad',
    });
  }
});

router.post('/create-order', requireAuth, requireDbUser, async (req, res) => {
  try {
    const quoteId = String(req.body?.quoteId || '').trim();
    const quote = quoteId ? await promo.readQuote(quoteId, req.user.uid) : null;
    if (!quote) {
      res.status(400).json({ error: 'Necesitas una cotización vigente antes de pagar' });
      return;
    }
    const publicKey = String(process.env.WOMPI_PUBLIC_KEY || '').trim();
    if (!wompiConfigured()) {
      const reference = `ad_mock_${String(req.dbUser.id).slice(0, 20)}_${randomUUID().replace(/-/g, '')}`;
      await promo.createPendingOrder({
        quote,
        reference,
        uid: req.user.uid,
        userId: req.dbUser.id,
      });
      res.status(201).json({
        mock: true,
        reference,
        quoteId: quote.quoteId,
        days: quote.days,
        hours: quote.hours,
        totalCop: quote.totalCop,
        amountInCents: quote.amountInCents,
        packageId: quote.packageId,
        format: quote.format,
        regionId: quote.regionId,
        message: 'Wompi no está configurado. Usa la activación de prueba.',
      });
      return;
    }

    const amount = Math.floor(Number(quote.amountInCents) || 0);
    if (!Number.isInteger(amount) || amount <= 0) {
      res.status(400).json({ error: 'El monto de la cotización no es válido' });
      return;
    }
    const reference = createWompiReference('ad');
    const currency = 'COP';
    const integritySecret = assertIntegrityPair(publicKey, process.env.WOMPI_INTEGRITY_SECRET);
    const expirationTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, '.000Z');
    const integritySignature = createWidgetIntegritySignature(
      reference,
      amount,
      currency,
      integritySecret,
      expirationTime,
    );
    if (!integritySignature) {
      res.status(500).json({ error: 'No se pudo firmar el pago de publicidad' });
      return;
    }

    const uid = req.user.uid;
    const widgetAvailable = await isWompiMerchantActive(publicKey);
    const order = await promo.createPendingOrder({
      quote,
      reference,
      uid,
      userId: req.dbUser.id,
    });
    rememberOrder({
      reference,
      uid,
      coins: 0,
      packageId: quote.packageId,
      floor: 0,
      kind: 'promo',
      days: quote.days,
      hours: quote.hours,
      amountInCop: amount,
      regionId: quote.regionId,
    });

    let checkoutUrl = null;
    let paymentLinkId = null;
    let checkoutError = null;
    try {
      const link = await createPaymentLink({
        name: `Publicidad ${quote.days} días`,
        description: `Banner LiveBoom · ${quote.format === 'animated' ? 'animado' : 'estático'} · ${quote.days}d`,
        amountInCents: amount,
        reference,
      });
      checkoutUrl = link.url;
      paymentLinkId = link.id;
      await promo.persistOrder({ ...order, paymentLinkId });
    } catch (linkError) {
      checkoutError = linkError instanceof Error ? linkError.message : String(linkError);
      console.warn('[ads/create-order] payment link:', checkoutError);
    }

    if (hasDatabase && prisma) {
      try {
        await prisma.transaction.create({
          data: {
            userId: req.dbUser.id,
            amount: 0,
            amountInCop: amount,
            type: 'promo_pending',
            status: 'pending',
            packageId: quote.packageId,
            reference,
            currency: 'COP',
          },
        });
      } catch (error) {
        console.warn('[ads/create-order] txn', error.message);
      }
    }

    if (!widgetAvailable && !checkoutUrl) {
      res.status(503).json({
        error: 'Wompi no pudo abrir el checkout. Intenta de nuevo en unos minutos.',
        merchantOk: false,
        checkoutError,
      });
      return;
    }

    res.status(201).json({
      reference,
      publicKey: cleanWompiSecret(publicKey),
      amountInCop: amount,
      amountInCents: amount,
      currency,
      integritySignature,
      expirationTime,
      checkoutUrl,
      widgetAvailable,
      preferCheckout: !widgetAvailable && Boolean(checkoutUrl),
      days: quote.days,
      hours: quote.hours,
      totalCop: quote.totalCop,
      format: quote.format,
      regionId: quote.regionId,
      packageId: quote.packageId,
      quoteId: quote.quoteId,
    });
  } catch (error) {
    console.error('[ads/create-order]', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo crear el pago de publicidad',
    });
  }
});

router.get('/orders/:reference', requireAuth, async (req, res) => {
  try {
    const order = await promo.readOrder(req.params.reference);
    if (!order || order.uid !== req.user.uid) {
      res.status(404).json({ error: 'Orden no encontrada' });
      return;
    }
    res.json({ ok: true, order: promo.publicOrder(order) });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo leer la orden' });
  }
});

router.post('/complete', requireAuth, requireDbUser, async (req, res) => {
  try {
    const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim() : '';
    const transactionId =
      typeof req.body?.transactionId === 'string' ? req.body.transactionId.trim() : '';
    if (!reference) {
      res.status(400).json({ error: 'reference es obligatorio' });
      return;
    }
    let order = await promo.readOrder(reference);
    if (!order || order.uid !== req.user.uid) {
      res.status(404).json({ error: 'No encontramos ese pago de publicidad' });
      return;
    }
    if (order.paymentStatus !== 'paid' && transactionId) {
      try {
        const txn = await getWompiTransaction(transactionId);
        if (txn) {
          await promo.trySettlePromoTransaction(txn);
          order = await promo.readOrder(reference);
        }
      } catch (error) {
        console.warn('[ads/complete] wompi', error.message);
      }
    }
    if (hasDatabase && prisma && order?.paymentStatus === 'paid') {
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
      ...promo.publicOrder(order),
      days: Number(order.days) || 1,
      hours: Number(order.hours) || 24,
      amountPaidCop: Number(order.totalCop || 0),
    });
  } catch (error) {
    console.error('[ads/complete]', error);
    res.status(500).json({ error: 'No se pudo confirmar la publicidad' });
  }
});

router.get('/my-campaigns', requireAuth, async (req, res) => {
  try {
    const campaigns = await promo.listMyCampaigns(req.user.uid);
    res.json({
      ok: true,
      campaigns: campaigns.map((row) => ({
        id: row.id,
        title: row.title,
        format: row.format || null,
        packageId: row.packageId || null,
        amountPaidCop: row.amountPaidCop || row.coinsPaid || 0,
        regionId: row.regionId,
        paymentStatus: row.paymentStatus || null,
        reviewStatus: row.reviewStatus || null,
        publishStatus: row.publishStatus || null,
        active: row.active !== false,
        startsAtMs: row.startsAtMs || null,
        expiresAtMs: row.expiresAtMs || 0,
        impressions: Number(row.impressions || 0),
        clicks: Number(row.clicks || 0),
        mediaUrl: row.mediaUrl || '',
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'No se pudieron cargar tus campañas' });
  }
});

router.post('/campaigns/:id/end', requireAuth, async (req, res) => {
  try {
    const { getAdminDb } = require('../lib/firestoreAdmin');
    const ref = getAdminDb().collection('promotions').doc(String(req.params.id || ''));
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.ownerUid !== req.user.uid) {
      res.status(404).json({ error: 'Campaña no encontrada' });
      return;
    }
    await ref.set(
      { active: false, publishStatus: 'ended', updatedAtMs: Date.now() },
      { merge: true },
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo finalizar' });
  }
});

router.post('/promotions/:id/event', requireAuth, async (req, res) => {
  try {
    const type = req.body?.type === 'click' ? 'click' : 'impression';
    const result = await promo.recordMetric({
      promoId: req.params.id,
      uid: req.user.uid,
      type,
    });
    res.json(result);
  } catch (error) {
    res.status(200).json({ ok: false });
  }
});

router.get('/admin/campaigns', requireAuth, requireAdsAdmin, async (_req, res) => {
  try {
    const campaigns = await promo.listAdminCampaigns();
    res.json({ ok: true, campaigns });
  } catch (error) {
    res.status(500).json({ error: 'No se pudieron cargar las campañas' });
  }
});

router.post('/admin/campaigns/:id/approve', requireAuth, requireAdsAdmin, async (req, res) => {
  try {
    const campaign = await promo.approveCampaign({
      campaignId: req.params.id,
      actorEmail: req.user?.email,
    });
    void require('../lib/adminAudit').writeAdminAudit({
      actorUid: req.user?.uid,
      actorEmail: req.user?.email,
      action: 'ads_approve',
      resourceType: 'campaign',
      resourceId: req.params.id,
      result: 'ok',
    });
    res.json({ ok: true, campaign });
  } catch (error) {
    const code = error && error.code ? String(error.code) : '';
    res.status(httpStatus(code)).json({
      error: error instanceof Error ? error.message : 'No se pudo aprobar',
    });
  }
});

router.post('/admin/campaigns/:id/reject', requireAuth, requireAdsAdmin, async (req, res) => {
  try {
    await promo.rejectCampaign({
      campaignId: req.params.id,
      actorEmail: req.user?.email,
      reason: req.body?.reason,
    });
    void require('../lib/adminAudit').writeAdminAudit({
      actorUid: req.user?.uid,
      actorEmail: req.user?.email,
      action: 'ads_reject',
      resourceType: 'campaign',
      resourceId: req.params.id,
      result: 'ok',
      reason: req.body?.reason,
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo rechazar' });
  }
});

router.get('/admin/projection', requireAuth, requireAdsAdmin, async (req, res) => {
  try {
    const stored = await promo.loadProjection();
    const extraMau = Number(req.query?.mau);
    const maus = stored.params.defaultMaus.slice();
    if (Number.isFinite(extraMau) && extraMau > 0 && !maus.includes(extraMau)) maus.push(extraMau);
    const table = promo.projectionWithParams(stored.params, maus);
    res.json({
      ok: true,
      ...table,
      updatedAtMs: stored.updatedAtMs,
      updatedBy: stored.updatedBy,
      assumptions:
        'DAU = 40 % del MAU, 2 impactos/día/espacio y 3.111,59 COP/USD son supuestos reconstruidos, no la TRM ni mediciones reales.',
    });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo calcular la proyección' });
  }
});

router.put('/admin/projection', requireAuth, requireAdsAdmin, async (req, res) => {
  try {
    const saved = await promo.saveProjection(req.body?.params || req.body, req.user?.email);
    const table = promo.projectionWithParams(saved.params, saved.params.defaultMaus);
    res.json({ ok: true, ...saved, ...table });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo guardar la proyección' });
  }
});

router.put('/admin/catalog', requireAuth, requireAdsAdmin, async (req, res) => {
  try {
    const catalog = await promo.saveCatalog(req.body, req.user?.email);
    res.json({ ok: true, catalog });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo guardar el catálogo' });
  }
});

module.exports = router;
module.exports.default = router;
