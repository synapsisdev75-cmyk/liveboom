const { prisma, hasDatabase } = require('../lib/prisma');
const { verifyWompiChecksum } = require('../lib/wompi');
const { getPaymentOrder } = require('../lib/walletFirestore');

function mapWompiStatus(status) {
  if (status === 'APPROVED') return 'completed';
  if (status === 'DECLINED' || status === 'VOIDED' || status === 'ERROR') return 'declined';
  return 'pending';
}

/**
 * Acredita coins una sola vez aunque Wompi reenvíe el webhook.
 * Compare-and-swap: solo el primer UPDATE de pending → completed incrementa el saldo.
 */
async function creditApprovedOrderPrisma(order, wompiTxnId) {
  if (!hasDatabase || !prisma) return null;
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.transaction.updateMany({
      where: {
        id: order.id,
        status: 'pending',
      },
      data: {
        status: 'completed',
        wompiTxnId,
      },
    });

    if (claimed.count !== 1) {
      return { duplicate: true };
    }

    const user = await tx.user.update({
      where: { id: order.userId },
      data: {
        coinsBalance: { increment: order.amount },
      },
    });

    return { duplicate: false, coinsBalance: user.coinsBalance };
  });
}

async function handleWompiWebhook(req, res) {
  const eventsSecret = process.env.WOMPI_EVENTS_SECRET;
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

    const txn = payload.data?.transaction;
    if (!txn || payload.event !== 'transaction.updated') {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    const reference = txn.reference;
    if (!reference) {
      res.status(200).json({ ok: true, unmatched: true });
      return;
    }

    if (txn.status === 'APPROVED') {
      const { settleApprovedTopup, resolvePendingOrder } = require('./paymentsController');
      let prismaOrder = null;
      if (hasDatabase && prisma) {
        try {
          prismaOrder = await prisma.transaction.findUnique({ where: { reference } });
        } catch (error) {
          console.warn('[webhooks/wompi] prisma lookup:', error.message);
        }
      }

      if (prismaOrder && Number(txn.amount_in_cents) !== prismaOrder.amountInCop) {
        console.error('[webhooks/wompi] monto distinto al de la orden', {
          reference,
          expected: prismaOrder.amountInCop,
          received: txn.amount_in_cents,
        });
        res.status(400).json({ error: 'El monto del evento no coincide con la orden' });
        return;
      }

      const stored = (await getPaymentOrder(reference)) || {};
      const uid =
        stored.uid ||
        (prismaOrder && hasDatabase && prisma
          ? (
              await prisma.user.findUnique({
                where: { id: prismaOrder.userId },
                select: { firebaseUid: true },
              }).catch(() => null)
            )?.firebaseUid
          : null);

      const order = await resolvePendingOrder({ reference, uid, txn });
      if (!order || !uid) {
        if (prismaOrder) {
          const result = await creditApprovedOrderPrisma(prismaOrder, txn.id);
          res.status(200).json({ ok: true, duplicate: result?.duplicate, via: 'prisma' });
          return;
        }
        res.status(200).json({ ok: true, unmatched: true });
        return;
      }

      if (order.amountInCop && Number(txn.amount_in_cents) !== Number(order.amountInCop)) {
        console.error('[webhooks/wompi] monto distinto al de la orden', {
          reference,
          expected: order.amountInCop,
          received: txn.amount_in_cents,
        });
        res.status(400).json({ error: 'El monto del evento no coincide con la orden' });
        return;
      }

      const result = await settleApprovedTopup({
        uid,
        order: { ...order, reference },
        wompiTxnId: txn.id,
        floorFromClient: order.floor,
      });
      res.status(200).json({ ok: true, duplicate: result.duplicate });
      return;
    }

    if (hasDatabase && prisma) {
      try {
        const order = await prisma.transaction.findUnique({ where: { reference } });
        if (order?.status === 'pending') {
          await prisma.transaction.updateMany({
            where: { id: order.id, status: 'pending' },
            data: {
              status: mapWompiStatus(txn.status),
              wompiTxnId: txn.id,
            },
          });
        }
      } catch (error) {
        console.warn('[webhooks/wompi] status update:', error.message);
      }
    }

    res.status(200).json({ ok: true, status: txn.status });
  } catch (error) {
    console.error('[webhooks/wompi]', error);
    res.status(500).json({ error: 'No se pudo procesar el webhook' });
  }
}

module.exports = { handleWompiWebhook, creditApprovedOrder: creditApprovedOrderPrisma };
