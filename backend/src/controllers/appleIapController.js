const wallet = require('../lib/walletService');
const { verifyAppleSignedTransaction } = require('../lib/apple/appleIap');

async function confirmAppleIap(req, res) {
  const uid = String(req.user?.uid || '').trim();
  if (!uid) {
    res.status(401).json({ error: 'No hay sesión para acreditar el BLAST' });
    return;
  }
  const signedTransaction = String(req.body?.signedTransaction || '').trim();
  if (!signedTransaction) {
    res.status(400).json({ error: 'Falta el comprobante de Apple' });
    return;
  }

  let purchase;
  try {
    purchase = await verifyAppleSignedTransaction(signedTransaction);
  } catch (error) {
    const code = error?.code || 'APPLE_VERIFY';
    console.warn('[payments/apple-iap]', code, error?.message);
    res.status(400).json({ error: error?.message || 'Apple no validó la compra', code });
    return;
  }

  try {
    const result = await wallet.creditPurchased({
      userId: uid,
      amount: purchase.coins,
      idempotencyKey: `APPLE_IAP:${purchase.transactionId}`,
      referenceType: 'apple_iap',
      referenceId: purchase.transactionId,
      fingerprint: uid,
      metadata: {
        productId: purchase.productId,
        environment: purchase.environment || null,
        store: 'apple',
      },
    });
    if (result?.code === 'IDEMPOTENCY_CONFLICT') {
      res.status(409).json({ error: 'Esta compra ya se usó en otra cuenta' });
      return;
    }
    if (!result?.ok) {
      res.status(400).json({ error: 'No se pudo sumar el BLAST' });
      return;
    }
    const summary = result.summary || (await wallet.getSummary(uid));
    res.json({
      coins: purchase.coins,
      duplicate: Boolean(result.duplicate),
      coinsBalance: summary.coinsBalance,
      purchasedBlastBalance: summary.purchasedBlastBalance,
      earnedBlastBalance: summary.earnedBlastBalance,
    });
  } catch (error) {
    console.error('[payments/apple-iap]', error);
    res.status(500).json({ error: 'No se pudo sumar el BLAST de Apple' });
  }
}

module.exports = { confirmAppleIap };
module.exports.confirmAppleIap = confirmAppleIap;
