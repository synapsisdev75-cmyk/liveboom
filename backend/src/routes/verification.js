const express = require('express');
const { asFn } = require('../lib/asFn');
const superAdminMod = require('../middleware/requireSuperAdmin');
const verification = require('../lib/verificationService');
const config = require('../lib/verificationConfig');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const requireVerificationAdmin = superAdminMod.requireCapability('verification');

function uidOf(req) {
  return String(req.user?.uid || '').trim();
}

function sendError(res, error) {
  const status = Number(error?.status) || 500;
  res.status(status).json({ error: error instanceof Error ? error.message : 'Error de verificación' });
}

router.get('/config', requireAuth, (_req, res) => {
  res.json(config.publicConfig());
});

router.get('/', requireAuth, async (req, res) => {
  try {
    res.json(await verification.getPublicCase(uidOf(req)));
  } catch (error) {
    sendError(res, error);
  }
});

router.put('/', requireAuth, async (req, res) => {
  try {
    res.json(
      await verification.saveDraft(uidOf(req), req.body || {}, {
        email: req.user?.email || '',
      }),
    );
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/accounts', requireAuth, async (req, res) => {
  try {
    res.json(await verification.upsertAccount(uidOf(req), req.body || {}));
  } catch (error) {
    sendError(res, error);
  }
});

router.post(
  '/files',
  requireAuth,
  express.raw({
    type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/octet-stream'],
    limit: '8mb',
  }),
  async (req, res) => {
    try {
      const slot = String(req.query.slot || req.headers['x-file-slot'] || '').trim();
      const declared = String(req.headers['content-type'] || '').split(';')[0].trim();
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
      res.json(
        await verification.saveFile({
          uid: uidOf(req),
          slot,
          buffer,
          declaredType: declared === 'application/octet-stream' ? '' : declared,
        }),
      );
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post('/submit', requireAuth, async (req, res) => {
  try {
    res.json(
      await verification.submitCase(uidOf(req), req.body || {}, {
        email: req.user?.email || '',
      }),
    );
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/files/:fileId/url', requireAuth, async (req, res) => {
  try {
    const admin = await superAdminMod.emailHasCapability(req.user?.email || '', 'verification');
    const targetUid = admin && req.query.uid ? String(req.query.uid) : uidOf(req);
    if (!admin && targetUid !== uidOf(req)) {
      res.status(403).json({ error: 'No autorizado.' });
      return;
    }
    res.json(
      await verification.signedFileUrl({
        uid: targetUid,
        fileId: String(req.params.fileId || ''),
        actorId: uidOf(req),
        isAdmin: admin,
      }),
    );
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/admin', requireAuth, requireVerificationAdmin, async (req, res) => {
  try {
    res.json(
      await verification.listQueue({
        cursor: req.query.cursor,
        limit: req.query.limit,
        filter: req.query.filter,
      }),
    );
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/admin/:uid', requireAuth, requireVerificationAdmin, async (req, res) => {
  try {
    const uid = String(req.params.uid || '');
    const current = await verification.getPublicCase(uid);
    if (current.status === 'submitted' || current.status === 'in_review' || current.needsAdmin) {
      await verification.lockCase(uid, uidOf(req));
    }
    res.json(await verification.adminGet(uid));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/admin/:uid/decision', requireAuth, requireVerificationAdmin, async (req, res) => {
  try {
    res.json(
      await verification.decideCase({
        uid: String(req.params.uid || ''),
        actorId: uidOf(req),
        actorEmail: req.user?.email || '',
        action: String(req.body?.action || ''),
        reason: req.body?.reason,
        internalNote: req.body?.internalNote,
        slots: req.body?.slots,
      }),
    );
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
module.exports.router = router;
module.exports.default = router;
