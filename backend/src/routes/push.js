const express = require('express');
const { asFn } = require('../lib/asFn');
const { sendPushToUsers } = require('../lib/pushNotify');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));

/**
 * POST /api/push/notify
 * body: { recipientUids: string[], title, body, channel?, data? }
 */
router.post(
  '/notify',
  requireAuth,
  asFn(async (req, res) => {
    const recipientUids = Array.isArray(req.body?.recipientUids)
      ? req.body.recipientUids.map((u) => String(u || '').trim()).filter(Boolean)
      : [];
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    const channel = String(req.body?.channel || 'general').trim();
    const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : {};

    if (!recipientUids.length) {
      res.status(400).json({ error: 'recipientUids requerido' });
      return;
    }
    if (!title && !body) {
      res.status(400).json({ error: 'title o body requerido' });
      return;
    }

    // No permitas notificar a más de 50 por request (Avisar LIVE usa 40).
    const capped = recipientUids.slice(0, 50);
    console.log('[push] /notify', {
      from: req.user?.uid || req.auth?.uid || '?',
      recipients: capped.length,
      channel,
    });
    const result = await sendPushToUsers({
      recipientUids: capped,
      title: title || 'LiveBoom',
      body,
      channel,
      data: {
        ...data,
        channel,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
    });

    res.json({ ok: true, ...result });
  }),
);

module.exports = router;
module.exports.default = router;
