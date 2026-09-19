const { verifyWompiChecksum, cleanWompiSecret, extractWompiTransaction } = require('../lib/wompi');
const { prisma } = require('../lib/prisma');
const { firestoreConfigured } = require('../lib/firestoreAdmin');
const { settleWompiTransaction } = require('../lib/blastPurchaseService');
const { evaluateWompiSettlement } = require('../lib/blastPurchase');

async function creditApprovedPrisma(order, wompiTxnId) {
  const user = await prisma.user.findUnique({ where: { id: order.userId } });
  const uid = user?.firebaseUid || user?.id;
  if (!uid) return { duplicate: true };
  const wallet = require('../lib/walletService');
  const result = await wallet.creditPurchased({
    userId: uid,
    amount: order.amount,
    idempotencyKey: `RECHARGE:${order.reference}`,
    referenceType: 'blast_purchase',
    referenceId: order.reference,
    metadata: { wompiTransactionId: wompiTxnId, packageId: order.packageId || null },
  });
  if (result?.duplicate) return { duplicate: true, coinsBalance: result.summary?.coinsBalance };
  await prisma.transaction.updateMany({
    where: { id: order.id, status: 'pending' },
    data: { status: 'completed', wompiTxnId },
  });
  return { duplicate: Boolean(result?.duplicate), coinsBalance: result?.summary?.coinsBalance };
}

async function handleWompiWebhook(req, res) {
  const eventsSecret = cleanWompiSecret(process.env.WOMPI_EVENTS_SECRET);
  if (!eventsSecret) {
    console.error('[webhooks/wompi] falta WOMPI_EVENTS_SECRET');
    res.status(500).json({ error: 'Webhook no configurado' });
    return;
  }

  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    res.status(400).json({ error: 'Cuerpo inválido' });
    return;
  }

  try {
    if (!verifyWompiChecksum(payload, eventsSecret, req)) {
      res.status(400).json({ error: 'Checksum Wompi inválido' });
      return;
    }

    const txn = extractWompiTransaction(payload);
    const eventName = String(payload.event || '').trim();
    if (!txn) {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }
    if (eventName && eventName !== 'transaction.updated' && String(txn.status || '').toUpperCase() !== 'APPROVED') {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    if (firestoreConfigured()) {
      const result = await settleWompiTransaction(txn, { source: 'webhook' });
      if (result?.error === 'AMOUNT_MISMATCH' || result?.error === 'CURRENCY_MISMATCH' || result?.error === 'REFERENCE_MISMATCH' || result?.error === 'PACKAGE_TAMPERED') {
        console.error('[webhooks/wompi] validación', result.error, txn.reference);
        res.status(200).json({ ok: false, error: result.error, credited: false });
        return;
      }
      if (result?.error === 'INVALID_EVENT') {
        res.status(400).json({ error: 'Evento inválido' });
        return;
      }
      res.status(200).json({
        ok: true,
        duplicate: Boolean(result?.duplicate),
        pending: Boolean(result?.pending),
        source: 'firestore',
        status: result?.decision?.code || result?.error || null,
      });
      return;
    }

    if (prisma) {
      const reference = String(txn.reference || '').trim();
      if (!reference) {
        res.status(200).json({ ok: true, unmatched: true });
        return;
      }
      const order = await prisma.transaction.findUnique({ where: { reference } });
      if (!order) {
        res.status(200).json({ ok: true, unmatched: true });
        return;
      }
      const decision = evaluateWompiSettlement({
        order: {
          id: order.reference,
          reference: order.reference,
          wompiReference: order.reference,
          uid: order.userId,
          packageId: order.packageId,
          coins: order.amount,
          amountInCop: order.amountInCop,
          status: order.status === 'completed' ? 'CREDITED' : 'PENDING',
        },
        txn,
      });
      if (decision.action === 'duplicate') {
        res.status(200).json({ ok: true, duplicate: true, source: 'prisma' });
        return;
      }
      if (decision.action === 'credit') {
        const result = await creditApprovedPrisma(order, txn.id);
        res.status(200).json({ ok: true, duplicate: result.duplicate, source: 'prisma' });
        return;
      }
      if (decision.action === 'mark' && order.status === 'pending') {
        await prisma.transaction.updateMany({
          where: { id: order.id, status: 'pending' },
          data: { status: String(decision.purchaseStatus || txn.status).toLowerCase(), wompiTxnId: txn.id },
        });
      }
      res.status(200).json({ ok: true, status: txn.status, source: 'prisma' });
      return;
    }

    res.status(200).json({ ok: true, unmatched: true });
  } catch (error) {
    console.error('[webhooks/wompi]', error);
    res.status(500).json({ error: 'No se pudo procesar el webhook' });
  }
}

module.exports = { handleWompiWebhook };
