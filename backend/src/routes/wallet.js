const express = require('express');
const { asFn } = require('../lib/asFn');
const wallet = require('../lib/walletService');
const {
  publicWalletSummary,
  quoteWithdrawal,
  publicWithdrawalRecord,
  stripLeakedRate,
} = require('../lib/payoutConversion');
const { normalizeWithdrawalStatus } = require('../lib/walletEngine');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));

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

router.post('/withdrawals/:id/confirm', requireAuth, async (req, res) => {
  try {
    const email = req.user?.email;
    if (!wallet.isOwnerEmail(email)) {
      res.status(403).json({ error: 'No autorizado' });
      return;
    }
    const withdrawal = await wallet.readWithdrawal(req.params.id);
    if (!withdrawal) {
      res.status(404).json({ error: 'Retiro no encontrado' });
      return;
    }
    const result = await wallet.confirmWithdrawal({
      userId: withdrawal.userId,
      amount: withdrawal.earnedBlastAmount || withdrawal.coins,
      withdrawalId: withdrawal.id,
      actorEmail: email,
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
    const result = await wallet.rejectWithdrawal({
      userId: withdrawal.userId,
      amount: withdrawal.earnedBlastAmount || withdrawal.coins,
      withdrawalId: withdrawal.id,
      actorEmail: email,
      actorUid: uid,
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
  const reserved = new Set(['transactions', 'summary', 'withdrawals', 'payout-quote']);
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
