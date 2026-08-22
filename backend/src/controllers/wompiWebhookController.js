const { prisma } = require('../lib/prisma');
const { verifyWompiChecksum } = require('../lib/wompi');

function mapWompiStatus(status) {
  if (status === 'APPROVED') return 'completed';
  if (status === 'DECLINED' || status === 'VOIDED' || status === 'ERROR') return 'declined';
  return 'pending';
}

/**
 * Acredita coins una sola vez aunque Wompi reenvíe el webhook.
 * Compare-and-swap: solo el primer UPDATE de pending → completed incrementa el saldo.
 */
async function creditApprovedOrder(order, wompiTxnId) {
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

    const order = await prisma.transaction.findUnique({
      where: { reference },
    });

    if (!order) {
      res.status(200).json({ ok: true, unmatched: true });
      return;
    }

    if (order.status === 'completed') {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }

    if (txn.status === 'APPROVED') {
      if (Number(txn.amount_in_cents) !== order.amountInCop) {
        console.error('[webhooks/wompi] monto distinto al de la orden', {
          reference,
          expected: order.amountInCop,
          received: txn.amount_in_cents,
        });
        res.status(400).json({ error: 'El monto del evento no coincide con la orden' });
        return;
      }

      const result = await creditApprovedOrder(order, txn.id);
      res.status(200).json({ ok: true, duplicate: result.duplicate });
      return;
    }

    if (order.status === 'pending') {
      await prisma.transaction.updateMany({
        where: { id: order.id, status: 'pending' },
        data: {
          status: mapWompiStatus(txn.status),
          wompiTxnId: txn.id,
        },
      });
    }

    res.status(200).json({ ok: true, status: txn.status });
  } catch (error) {
    console.error('[webhooks/wompi]', error);
    res.status(500).json({ error: 'No se pudo procesar el webhook' });
  }
}

module.exports = { handleWompiWebhook, creditApprovedOrder };
