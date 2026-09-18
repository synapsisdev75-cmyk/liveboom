const express = require('express');
const { asFn } = require('../lib/asFn');
const wallet = require('../lib/walletService');
const { MIN_WITHDRAW_COINS, coinsToCop, COIN_TO_COP } = require('../lib/coinPackages');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));

router.get('/summary', requireAuth, async (req, res) => {
  try {
    const uid = req.user?.uid;
    const summary = await wallet.getSummary(uid);
    res.json({
      ...summary,
      minWithdrawCoins: MIN_WITHDRAW_COINS,
      coinToCop: COIN_TO_COP,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo leer la billetera',
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
      amount: withdrawal.coins,
      withdrawalId: withdrawal.id,
      actorEmail: email,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.code || 'No se pudo confirmar' });
      return;
    }
    res.json({ ok: true, summary: result.summary });
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
      amount: withdrawal.coins,
      withdrawalId: withdrawal.id,
      actorEmail: email,
      actorUid: uid,
    });
    if (!result.ok) {
      const status = result.code === 'FORBIDDEN' ? 403 : 400;
      res.status(status).json({ error: result.code || 'No se pudo rechazar' });
      return;
    }
    res.json({ ok: true, summary: result.summary });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo rechazar el retiro',
    });
  }
});

router.get('/:firebaseUid', async (req, res) => {
  try {
    const uid = String(req.params.firebaseUid || '').trim();
    const summary = await wallet.getSummary(uid);
    res.json({
      firebaseUid: uid,
      coins: summary.coinsBalance,
      coinsBalance: summary.coinsBalance,
      ...summary,
      minWithdrawCoins: MIN_WITHDRAW_COINS,
      coinToCop: COIN_TO_COP,
      withdrawableCop: coinsToCop(summary.withdrawableBalance),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo leer la billetera',
    });
  }
});

module.exports = router;
module.exports.default = router;
