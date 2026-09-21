const express = require('express');
const { randomUUID } = require('crypto');
const { asFn } = require('../lib/asFn');
const superAdminMod = require('../middleware/requireSuperAdmin');
const { writeAdminAudit, listAdminAudit } = require('../lib/adminAudit');
const users = require('../lib/adminUsersService');
const chats = require('../lib/adminChatsService');
const wallet = require('../lib/walletService');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const requireOwner = superAdminMod.requireOwner;
const requireMessages = superAdminMod.requireCapability('messages');

function actor(req) {
  return {
    actorUid: req.user?.uid || '',
    actorEmail: req.user?.email || '',
  };
}

function sendError(res, error, fallback) {
  const status = Number(error?.status) || 500;
  res.status(status).json({
    error: error instanceof Error ? error.message : fallback || 'Error Super Admin',
    code: error?.code,
  });
}

router.use(requireAuth);

router.get('/users', requireOwner, async (req, res) => {
  try {
    const page = await users.listAdminUsers({
      q: req.query.q,
      cursor: req.query.cursor,
      limit: req.query.limit,
    });
    res.json(page);
  } catch (error) {
    sendError(res, error, 'No se pudieron listar usuarios');
  }
});

router.post('/users/:uid/xp', requireOwner, async (req, res) => {
  const uid = String(req.params.uid || '').trim();
  try {
    const result = await users.applyXp({
      uid,
      mode: String(req.body?.mode || ''),
      value: req.body?.value,
    });
    void writeAdminAudit({
      ...actor(req),
      action: `user_xp_${result ? String(req.body?.mode || 'set') : 'error'}`,
      resourceType: 'user',
      resourceId: uid,
      result: 'ok',
      reason: req.body?.reason,
      before: result.before,
      after: result.after,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    void writeAdminAudit({
      ...actor(req),
      action: 'user_xp',
      resourceType: 'user',
      resourceId: uid,
      result: 'error',
      meta: { message: error instanceof Error ? error.message : 'error' },
    });
    sendError(res, error, 'No se pudo actualizar XP');
  }
});

router.post('/users/:uid/blast', requireOwner, async (req, res) => {
  const uid = String(req.params.uid || '').trim();
  const who = actor(req);
  try {
    const idempotencyKey = String(req.body?.idempotencyKey || '').trim() || `admin-blast:${randomUUID()}`;
    const result = await wallet.adminAdjustBlast({
      userId: uid,
      bucket: req.body?.bucket,
      delta: req.body?.delta,
      idempotencyKey,
      actorEmail: who.actorEmail,
      reason: req.body?.reason,
    });
    if (!result?.ok) {
      const status = result?.code === 'IDEMPOTENCY_CONFLICT' ? 409 : 400;
      res.status(status).json({
        error:
          result?.code === 'INSUFFICIENT_PURCHASED'
            ? 'No hay BLAST comprados suficientes.'
            : result?.code === 'INSUFFICIENT_EARNED'
              ? 'No hay BLAST ganados suficientes. El reservado de retiro no se toca.'
              : result?.code || 'No se pudo ajustar Blast',
        code: result?.code,
      });
      return;
    }
    void writeAdminAudit({
      ...who,
      action: 'user_blast_adjust',
      resourceType: 'wallet',
      resourceId: uid,
      result: result.duplicate ? 'duplicate' : 'ok',
      reason: req.body?.reason,
      before: result.extra?.before,
      after: result.extra?.after,
      requestId: idempotencyKey,
      meta: { bucket: req.body?.bucket, delta: req.body?.delta, duplicate: Boolean(result.duplicate) },
    });
    res.json({
      ok: true,
      duplicate: Boolean(result.duplicate),
      summary: result.summary,
      extra: result.extra,
    });
  } catch (error) {
    sendError(res, error, 'No se pudo ajustar Blast');
  }
});

router.get('/chats', requireMessages, async (req, res) => {
  try {
    res.json(
      await chats.listAdminChats({
        q: req.query.q,
        cursor: req.query.cursor,
        limit: req.query.limit,
      }),
    );
  } catch (error) {
    sendError(res, error, 'No se pudieron cargar los chats');
  }
});

router.get('/chats/:chatId/messages', requireMessages, async (req, res) => {
  try {
    res.json(await chats.listAdminChatMessages(req.params.chatId, { limit: req.query.limit }));
  } catch (error) {
    sendError(res, error, 'No se pudieron cargar los mensajes');
  }
});

router.get('/audit', requireOwner, async (req, res) => {
  try {
    res.json(
      await listAdminAudit({
        cursor: req.query.cursor,
        limit: req.query.limit,
      }),
    );
  } catch (error) {
    sendError(res, error, 'No se pudo cargar la auditoría');
  }
});

module.exports = router;
module.exports.router = router;
module.exports.default = router;
