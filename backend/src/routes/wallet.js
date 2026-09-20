const express = require('express');
const { asFn } = require('../lib/asFn');
const wallet = require('../lib/walletService');
const {
  publicWalletSummary,
  quoteWithdrawal,
  publicWithdrawalRecord,
  adminWithdrawalRecord,
  stripLeakedRate,
} = require('../lib/payoutConversion');
const { normalizeWithdrawalStatus } = require('../lib/walletEngine');
const superAdminMod = require('../middleware/requireSuperAdmin');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));
const requireSuperAdmin = asFn(superAdminMod);
const isSuperAdminEmail =
  typeof superAdminMod.isSuperAdminEmail === 'function'
    ? superAdminMod.isSuperAdminEmail
    : async () => false;

function sendPublic(res, payload) {
  res.json(stripLeakedRate(payload));
}

router.get('/summary', requireAuth, async (req, res) => {
  try {
    const uid = req.user?.uid;
    const summary = await wallet.getSummary(uid);
    sendPublic(res, publicWalletSummary(summary));
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo leer la billetera',
    });
  }
});

router.get('/payout-quote', requireAuth, async (req, res) => {
  try {
    const uid = req.user?.uid;
    const summary = await wallet.getSummary(uid);
    const blast = Math.floor(Number(req.query.blast ?? req.query.coins) || 0);
    const quote = quoteWithdrawal(blast, summary.earnedAvailable);
    if (!quote.ok) {
      res.status(400).json({
        error:
          quote.code === 'PURCHASED_NOT_WITHDRAWABLE'
            ? 'Solo puedes retirar BLAST ganados.'
            : quote.code === 'BELOW_MINIMUM'
              ? 'El monto a retirar no alcanza el mínimo autorizado.'
              : 'Monto inválido',
        ...quote,
      });
      return;
    }
    sendPublic(res, quote);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo cotizar el retiro',
    });
  }
});

router.get('/transactions', requireAuth, async (req, res) => {
  try {
    const uid = req.user?.uid;
    const filter = String(req.query.filter || 'all');
    const transactions = await wallet.getTransactions(uid, { filter, limit: 50 });
    res.json({ transactions });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo leer el historial',
    });
  }
});

router.get('/withdrawals', requireAuth, async (req, res) => {
  try {
    const uid = req.user?.uid;
    const rows = await wallet.listWithdrawals(uid);
    sendPublic(res, {
      withdrawals: rows.map((row) =>
        publicWithdrawalRecord({
          ...row,
          status: normalizeWithdrawalStatus(row.status),
        }),
      ),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo listar retiros',
    });
  }
});

router.post('/withdrawals/prepare', requireAuth, async (req, res) => {
  try {
    const uid = req.user?.uid;
    const coins = Math.floor(Number(req.body?.coins ?? req.body?.earnedBlastAmount) || 0);
    const fullName = String(req.body?.fullName || '').trim().slice(0, 120);
    const documentId = String(req.body?.documentId || '').trim().slice(0, 32);
    const payoutMethod = String(req.body?.payoutMethod || '').trim().slice(0, 40);
    const accountNumber = String(req.body?.accountNumber ?? '').trim().slice(0, 40);
    const accountType = String(req.body?.accountType || 'ahorros').trim().slice(0, 20);
    const accountId = String(req.body?.accountId || '').trim();
    const verification = require('../lib/verificationService');
    const confirm = require('../lib/verificationConfirm');
    const { quoteWithdrawal, publicWalletSummary } = require('../lib/payoutConversion');
    const { withdrawalFingerprint } = require('../lib/withdrawalIdentity');

    const verified = await verification.requireVerifiedPayout(uid, {
      fullName,
      documentId,
      payoutMethod,
      accountNumber,
      accountType,
      accountId,
    });
    if (!verified.ok) {
      const error =
        verified.code === 'ACCOUNT_UNVERIFIED'
          ? 'La cuenta de cobro no está verificada.'
          : verified.code === 'HOLDER_MISMATCH'
            ? 'El titular no coincide con la identidad verificada.'
            : 'Para solicitar tu retiro, necesitamos verificar tu identidad y la cuenta donde recibirás tus ganancias.';
      res.status(403).json({ error, code: verified.code, canWithdraw: false });
      return;
    }

    const summary = await wallet.getSummary(uid);
    const quote = quoteWithdrawal(coins, summary.earnedAvailable);
    if (!quote.ok) {
      res.status(400).json({
        error:
          quote.code === 'PURCHASED_NOT_WITHDRAWABLE'
            ? 'Solo puedes retirar BLAST ganados.'
            : quote.code === 'BELOW_MINIMUM'
              ? 'El monto a retirar no alcanza el mínimo autorizado.'
              : 'Monto inválido',
        code: quote.code,
      });
      return;
    }

    const resolvedName = verified.snapshot.legalName;
    const resolvedDoc = verified.snapshot.documentNumber;
    const resolvedMethod = verified.account.bank;
    const resolvedType = verified.account.accountType;
    const resolvedNumber = verified.account.accountNumber;
    const fingerprint = withdrawalFingerprint({
      userId: uid,
      coins,
      fullName: resolvedName,
      documentId: resolvedDoc,
      payoutMethod: resolvedMethod,
      accountNumber: resolvedNumber,
      accountType: resolvedType,
    });
    const issued = await confirm.issueConfirm({
      userId: uid,
      coins,
      accountId: verified.accountId,
      fingerprint,
    });
    sendPublic(res, {
      confirmId: issued.confirmId,
      expiresAtMs: issued.expiresAtMs,
      code: issued.code,
      delivery: 'app',
      earnedBlastAmount: coins,
      moneyAmountCOP: quote.moneyAmountCOP,
      moneyAmountExact: String(quote.moneyAmountCOP),
      currency: 'COP',
      legalName: resolvedName,
      holderName: resolvedName,
      bank: resolvedMethod,
      accountType: resolvedType,
      accountNumberMasked: verified.account.accountNumberMasked,
      accountId: verified.accountId,
      caseId: verified.caseId,
      summary: publicWalletSummary(summary),
      note: 'Código de un solo uso de LiveBoom. Caduca en 10 minutos y queda ligado a este importe y destino.',
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo preparar la confirmación',
    });
  }
});

router.get('/admin/withdrawals/report', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { downloadCurrentReport } = require('../lib/withdrawalReport');
    const file = await downloadCurrentReport();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename.replace(/"/g, '')}"`,
    );
    res.setHeader('X-Report-Pending', file.meta.pending ? '1' : '0');
    res.setHeader('X-Report-Generated-At', String(file.meta.generatedAtMs || ''));
    res.send(file.buffer);
  } catch (error) {
    const status = error?.code === 'REPORT_MISSING' || error?.code === 'REPORT_PENDING' ? 409 : 500;
    res.status(status).json({
      error: error instanceof Error ? error.message : 'No se pudo descargar el Excel',
    });
  }
});

router.get('/admin/withdrawals', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { readReportMeta } = require('../lib/withdrawalReport');
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const limit = Math.min(50, Math.max(1, Math.floor(Number(req.query.limit) || 30)));
    const listed = await wallet.listAllWithdrawals({ limit, cursor });
    const withdrawals = Array.isArray(listed) ? listed : listed.withdrawals || [];
    const nextCursor = Array.isArray(listed) ? null : listed.nextCursor || null;
    const report = await readReportMeta();
    sendPublic(res, {
      withdrawals: withdrawals.map((row) =>
        adminWithdrawalRecord({
          ...row,
          status: normalizeWithdrawalStatus(row.status),
        }),
      ),
      nextCursor,
      report,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudieron listar las solicitudes',
    });
  }
});

router.post('/admin/withdrawals/:id/status', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const email = req.user?.email;
    const result = await wallet.updateWithdrawalAdmin({
      withdrawalId: req.params.id,
      status: req.body?.status,
      observations: req.body?.observations,
      disbursementReference: req.body?.disbursementReference,
      actorEmail: email,
      adminOverride: true,
    });
    if (!result.ok) {
      const status =
        result.code === 'FORBIDDEN'
          ? 403
          : result.code === 'NOT_FOUND'
            ? 404
            : 400;
      res.status(status).json({
        error:
          result.code === 'PAYMENT_REFERENCE_REQUIRED'
            ? 'Indica la referencia real del desembolso para marcar Pagado.'
            : result.code === 'ALREADY_PAID'
              ? 'Este retiro ya fue marcado como pagado.'
              : result.code || 'No se pudo actualizar',
        code: result.code,
      });
      return;
    }
    sendPublic(res, { ok: true, summary: result.summary ? publicWalletSummary(result.summary) : null });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo actualizar el retiro',
    });
  }
});

router.post('/withdrawals/:id/confirm', requireAuth, async (req, res) => {
  try {
    const email = req.user?.email;
    if (!(await isSuperAdminEmail(email))) {
      res.status(403).json({ error: 'No autorizado' });
      return;
    }
    const withdrawal = await wallet.readWithdrawal(req.params.id);
    if (!withdrawal) {
      res.status(404).json({ error: 'Retiro no encontrado' });
      return;
    }
    const disbursementReference = String(req.body?.disbursementReference || '').trim();
    if (!disbursementReference) {
      res.status(400).json({
        error: 'Indica la referencia real del desembolso para marcar Pagado.',
        code: 'PAYMENT_REFERENCE_REQUIRED',
      });
      return;
    }
    const result = await wallet.confirmWithdrawal({
      userId: withdrawal.userId,
      amount: withdrawal.earnedBlastAmount || withdrawal.coins,
      withdrawalId: withdrawal.id,
      actorEmail: email,
      adminOverride: true,
      disbursementReference,
      observations: req.body?.observations,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.code || 'No se pudo confirmar' });
      return;
    }
    sendPublic(res, { ok: true, summary: publicWalletSummary(result.summary) });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo confirmar el retiro',
    });
  }
});

router.post('/withdrawals/:id/reject', requireAuth, async (req, res) => {
  try {
    const withdrawal = await wallet.readWithdrawal(req.params.id);
    if (!withdrawal) {
      res.status(404).json({ error: 'Retiro no encontrado' });
      return;
    }
    const uid = req.user?.uid;
    const email = req.user?.email;
    const admin = await isSuperAdminEmail(email);
    const result = await wallet.rejectWithdrawal({
      userId: withdrawal.userId,
      amount: withdrawal.earnedBlastAmount || withdrawal.coins,
      withdrawalId: withdrawal.id,
      actorEmail: email,
      actorUid: uid,
      adminOverride: admin,
    });
    if (!result.ok) {
      const status = result.code === 'FORBIDDEN' ? 403 : 400;
      res.status(status).json({ error: result.code || 'No se pudo rechazar' });
      return;
    }
    sendPublic(res, { ok: true, summary: publicWalletSummary(result.summary) });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo rechazar el retiro',
    });
  }
});

router.get('/:firebaseUid', async (req, res, next) => {
  const reserved = new Set(['transactions', 'summary', 'withdrawals', 'payout-quote', 'admin']);
  if (reserved.has(String(req.params.firebaseUid || ''))) {
    next();
    return;
  }
  try {
    const uid = String(req.params.firebaseUid || '').trim();
    const summary = await wallet.getSummary(uid);
    sendPublic(res, {
      firebaseUid: uid,
      coins: summary.coinsBalance,
      ...publicWalletSummary(summary),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo leer la billetera',
    });
  }
});

module.exports = router;
module.exports.default = router;
