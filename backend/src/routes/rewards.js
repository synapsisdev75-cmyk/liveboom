const express = require('express');
const { asFn } = require('../lib/asFn');
const rewards = require('../lib/adRewardsService');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const superAdminMod = require('../middleware/requireSuperAdmin');
const requireAdsAdmin = superAdminMod.requireCapability('ads');

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.ip || '';
}

function fail(res, error, fallback) {
  if (error instanceof rewards.RewardError) {
    return res.status(error.status).json({ error: error.message, code: error.code, ...error.extra });
  }
  console.error('[rewards]', fallback, error);
  return res.status(500).json({ error: fallback });
}

function body(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

function antifraud(req) {
  const b = body(req);
  return {
    deviceId: String(b.deviceId || '').slice(0, 200),
    signals: b.signals && typeof b.signals === 'object' ? b.signals : {},
    ip: clientIp(req),
  };
}

// ── Usuario ─────────────────────────────────────────────────────────────────

router.get('/status', requireAuth, async (_req, res) => {
  try {
    res.json(await rewards.publicStatus());
  } catch (error) {
    fail(res, error, 'No se pudo leer Gana Puntos');
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    res.json(await rewards.myRewards(req.user.uid));
  } catch (error) {
    fail(res, error, 'No se pudieron cargar tus recompensas');
  }
});

router.get('/campaigns', requireAuth, async (req, res) => {
  try {
    res.json(await rewards.availableCampaigns(req.user.uid));
  } catch (error) {
    fail(res, error, 'No se pudieron cargar las recompensas disponibles');
  }
});

router.get('/feed', requireAuth, async (req, res) => {
  try {
    res.json(await rewards.nextFeedCampaign(req.user.uid, String(req.query.surface || 'inicio')));
  } catch (error) {
    fail(res, error, 'No se pudo cargar la publicidad');
  }
});

router.post('/campaigns/:id/click', requireAuth, async (req, res) => {
  try {
    await rewards.recordClick(req.user.uid, String(req.params.id));
    res.json({ ok: true });
  } catch (error) {
    fail(res, error, 'No se pudo registrar el clic');
  }
});

router.post('/sessions', requireAuth, async (req, res) => {
  try {
    const { deviceId, signals } = antifraud(req);
    res.json(
      await rewards.startSession({
        uid: req.user.uid,
        campaignId: String(body(req).campaignId || ''),
        deviceId,
        signals,
      }),
    );
  } catch (error) {
    fail(res, error, 'No se pudo iniciar la visualización');
  }
});

router.post('/sessions/:id/beat', requireAuth, async (req, res) => {
  try {
    const { signals } = antifraud(req);
    res.json(
      await rewards.heartbeat({
        uid: req.user.uid,
        sessionId: String(req.params.id),
        visible: body(req).visible !== false,
        signals,
      }),
    );
  } catch (error) {
    fail(res, error, 'No se pudo actualizar la visualización');
  }
});

router.post('/sessions/:id/complete', requireAuth, async (req, res) => {
  try {
    res.json(await rewards.completeSession({ uid: req.user.uid, sessionId: String(req.params.id), ...antifraud(req) }));
  } catch (error) {
    fail(res, error, 'No se pudieron acreditar los puntos');
  }
});

router.post('/sessions/:id/abandon', requireAuth, async (req, res) => {
  try {
    await rewards.abandonSession({ uid: req.user.uid, sessionId: String(req.params.id) });
    res.json({ ok: true });
  } catch (error) {
    fail(res, error, 'No se pudo cerrar la visualización');
  }
});

router.post('/campaigns/:id/follow', requireAuth, async (req, res) => {
  try {
    res.json(await rewards.claimFollow({ uid: req.user.uid, campaignId: String(req.params.id), ...antifraud(req) }));
  } catch (error) {
    fail(res, error, 'No se pudo registrar el seguimiento');
  }
});

router.post('/campaigns/:id/comment', requireAuth, async (req, res) => {
  try {
    res.json(
      await rewards.claimComment({
        uid: req.user.uid,
        campaignId: String(req.params.id),
        text: String(body(req).text || ''),
        ...antifraud(req),
      }),
    );
  } catch (error) {
    fail(res, error, 'No se pudo registrar el comentario');
  }
});

router.post('/campaigns/:id/participate', requireAuth, async (req, res) => {
  try {
    res.json(await rewards.startExternal({ uid: req.user.uid, campaignId: String(req.params.id) }));
  } catch (error) {
    fail(res, error, 'No se pudo abrir la campaña');
  }
});

router.post('/convert', requireAuth, async (req, res) => {
  try {
    res.json(await rewards.convertPoints(req.user.uid));
  } catch (error) {
    fail(res, error, 'No se pudo convertir a BLAST');
  }
});

/** El anunciante confirma registro, descarga o compra: firma HMAC-SHA256(secret, `${campaignId}.${ref}`). */
router.post('/webhooks/conversion', async (req, res) => {
  try {
    const b = body(req);
    const out = await rewards.confirmFromWebhook({
      campaignId: String(b.campaignId || ''),
      ref: String(b.ref || ''),
      signature: String(req.headers['x-liveboom-signature'] || b.signature || ''),
    });
    res.json({ ok: true, status: out.status || 'CONFIRMADO', duplicate: Boolean(out.duplicate) });
  } catch (error) {
    fail(res, error, 'No se pudo confirmar la conversión');
  }
});

// ── Super Admin: Publicidad y recompensas ───────────────────────────────────

router.get('/admin/overview', requireAuth, requireAdsAdmin, async (_req, res) => {
  try {
    res.json(await rewards.adminOverview());
  } catch (error) {
    fail(res, error, 'No se pudo cargar el resumen');
  }
});

router.put('/admin/config', requireAuth, requireAdsAdmin, async (req, res) => {
  try {
    res.json({ config: await rewards.saveConfig(body(req), req.user.email) });
  } catch (error) {
    fail(res, error, 'No se pudo guardar la configuración');
  }
});

router.get('/admin/campaigns', requireAuth, requireAdsAdmin, async (_req, res) => {
  try {
    res.json({ campaigns: await rewards.listCampaignsAdmin() });
  } catch (error) {
    fail(res, error, 'No se pudieron cargar las campañas');
  }
});

router.post('/admin/campaigns', requireAuth, requireAdsAdmin, async (req, res) => {
  try {
    res.json({ campaign: await rewards.createCampaign(body(req), req.user.email) });
  } catch (error) {
    fail(res, error, 'No se pudo crear la campaña');
  }
});

router.put('/admin/campaigns/:id', requireAuth, requireAdsAdmin, async (req, res) => {
  try {
    res.json({ campaign: await rewards.updateCampaign(req.params.id, body(req), req.user.email) });
  } catch (error) {
    fail(res, error, 'No se pudo actualizar la campaña');
  }
});

router.post('/admin/campaigns/:id/status', requireAuth, requireAdsAdmin, async (req, res) => {
  try {
    res.json({
      campaign: await rewards.setCampaignStatus(req.params.id, String(body(req).status || ''), req.user.email),
    });
  } catch (error) {
    fail(res, error, 'No se pudo cambiar el estado');
  }
});

router.get('/admin/campaigns/:id/webhook', requireAuth, requireAdsAdmin, async (req, res) => {
  try {
    res.json({ secret: await rewards.revealWebhookSecret(req.params.id) });
  } catch (error) {
    fail(res, error, 'No se pudo leer la llave del webhook');
  }
});

router.post('/admin/campaigns/:id/webhook/rotate', requireAuth, requireAdsAdmin, async (req, res) => {
  try {
    res.json({ secret: await rewards.rotateWebhookSecret(req.params.id) });
  } catch (error) {
    fail(res, error, 'No se pudo cambiar la llave del webhook');
  }
});

router.get('/admin/campaigns/:id/leads', requireAuth, requireAdsAdmin, async (req, res) => {
  try {
    res.json({ leads: await rewards.listLeads(req.params.id) });
  } catch (error) {
    fail(res, error, 'No se pudieron cargar las participaciones');
  }
});

router.post('/admin/leads/:code/confirm', requireAuth, requireAdsAdmin, async (req, res) => {
  try {
    res.json(await rewards.confirmLead(req.params.code, { source: 'admin', actor: req.user.email }));
  } catch (error) {
    fail(res, error, 'No se pudo confirmar la participación');
  }
});

router.get('/admin/claims', requireAuth, requireAdsAdmin, async (req, res) => {
  try {
    res.json({ claims: await rewards.listClaimsAdmin(String(req.query.status || 'SOSPECHOSO')) });
  } catch (error) {
    fail(res, error, 'No se pudo cargar la auditoría');
  }
});

router.post('/admin/claims/:id/resolve', requireAuth, requireAdsAdmin, async (req, res) => {
  try {
    const b = body(req);
    res.json(
      await rewards.resolveClaim(req.params.id, String(b.decision || ''), {
        actor: req.user.email,
        note: String(b.note || ''),
      }),
    );
  } catch (error) {
    fail(res, error, 'No se pudo resolver la recompensa');
  }
});

module.exports = router;
