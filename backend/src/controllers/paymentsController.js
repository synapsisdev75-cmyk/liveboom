const { resolveCoinPackage, MIN_WITHDRAW_COINS } = require('../lib/coinPackages');
const {
  assertIntegrityPair,
  cleanWompiSecret,
  createWidgetIntegritySignature,
  createPaymentLink,
  createWompiReference,
  createBlastPurchaseReference,
  getWompiTransaction,
  getWompiMerchant,
  isWompiMerchantActive,
} = require('../lib/wompi');
const {
  rememberOrder,
  setBalances,
} = require('../lib/walletMemory');
const dbUserFromTokenMod = require('../lib/dbUserFromToken');
const { prisma, hasDatabase } = require('../lib/prisma');
const {
  firestoreConfigured,
  savePaymentOrder,
  readPaymentOrder,
  readUserCoinsBalance,
} = require('../lib/firestoreAdmin');
const {
  SUCCESS: RECHARGE_OK,
  PENDING: RECHARGE_PENDING,
  DECLINED: RECHARGE_DECLINED,
} = require('../lib/blastRechargeCopy');

function dbUserFromToken(decoded) {
  const fn =
    typeof dbUserFromTokenMod === 'function'
      ? dbUserFromTokenMod
      : dbUserFromTokenMod.dbUserFromToken || dbUserFromTokenMod.default;
  return fn(decoded);
}

function userForOrder(req) {
  return req.dbUser || (req.user ? dbUserFromToken(req.user) : null);
}

/** Recarga = Wallet.creditPurchased (nunca earned / nunca retirable). */
async function creditTopup(uid, coins, idempotencyKey) {
  const amount = Math.max(0, Math.floor(Number(coins) || 0));
  const wallet = require('../lib/walletService');
  const result = await wallet.creditPurchased({
    userId: uid,
    amount,
    idempotencyKey: idempotencyKey || `RECHARGE_TOPUP:${uid}:${amount}:${Date.now()}`,
    referenceType: 'recharge',
  });
  if (!result?.ok) {
    throw new Error(result?.code || 'No se pudo acreditar la recarga');
  }
  return result.summary.coinsBalance;
}

function buildOrderResponse({ pack, packageId, amountInCop, publicKey, reference }) {
  const orderRef = reference || createBlastPurchaseReference();
  const currency = 'COP';
  const expirationTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const integritySecret = assertIntegrityPair(publicKey, process.env.WOMPI_INTEGRITY_SECRET);
  const integritySignature = createWidgetIntegritySignature(
    orderRef,
    amountInCop,
    currency,
    integritySecret,
    expirationTime,
  );
  if (!integritySignature) {
    throw new Error('No se pudo generar la firma de integridad de Wompi');
  }
  return {
    reference: orderRef,
    publicKey: cleanWompiSecret(publicKey),
    amountInCop,
    amountInCents: amountInCop,
    currency,
    packageId,
    coins: pack.coins,
    integritySignature,
    expirationTime,
  };
}

async function settleFromWompiId(transactionId, expectedUid, referenceHint) {
  const id = String(transactionId || '').trim();
  if (!id) return { ok: false, error: 'transactionId es obligatorio' };
  const { reconcileTransactionId, attachWompiTransactionId } = require('../lib/blastPurchaseService');
  if (referenceHint && expectedUid && firestoreConfigured()) {
    try {
      await attachWompiTransactionId(referenceHint, expectedUid, id);
    } catch {
      /* hint opcional */
    }
  }
  if (firestoreConfigured()) {
    return reconcileTransactionId(id, expectedUid || null);
  }
  const txn = await getWompiTransaction(id);
  if (!txn) return { ok: false, error: 'Transacción no encontrada en Wompi' };
  const { evaluateWompiSettlement } = require('../lib/blastPurchase');
  const reference = String(txn.reference || '').trim();
  const mem = require('../lib/walletMemory');
  const order = reference ? mem.getOrder(reference) : null;
  const savedOrder = order || (reference ? { reference, uid: expectedUid } : null);
  const decision = evaluateWompiSettlement({
    order: savedOrder
      ? {
          ...savedOrder,
          id: reference,
          wompiReference: reference,
          amountInCop: savedOrder.amountInCop,
          packageId: savedOrder.packageId,
          coins: savedOrder.coins,
          status: 'PENDING',
        }
      : null,
    txn,
    expectedUid,
  });
  if (decision.action !== 'credit') {
    return { ok: false, error: decision.code || 'NO_CREDIT', decision, pending: decision.action === 'pending' };
  }
  const coinsBalance = await creditTopup(
    expectedUid,
    decision.blast,
    `RECHARGE:${reference || id}`,
  );
  if (reference) mem.takeOrder(reference, expectedUid);
  return {
    ok: true,
    uid: expectedUid,
    coins: decision.blast,
    coinsBalance,
    purchasedBlastBalance: coinsBalance,
    earnedBlastBalance: 0,
    summary: { coinsBalance, purchasedBalance: coinsBalance, earnedAvailable: 0 },
  };
}

function publicPurchaseResult(result) {
  const summary = result.summary || {};
  return {
    reference: result.reference || null,
    coins: result.coins || 0,
    coinsBalance: result.coinsBalance ?? summary.coinsBalance,
    purchasedBlastBalance: result.purchasedBlastBalance ?? summary.purchasedBalance,
    earnedBlastBalance: result.earnedBlastBalance ?? summary.earnedAvailable,
    earnedBlastReserved: result.earnedBlastReserved ?? summary.earnedReserved,
    withdrawableBalance: result.withdrawableBalance ?? summary.withdrawableBalance,
    duplicate: Boolean(result.duplicate),
    pending: Boolean(result.pending),
    status: result.decision?.code || (result.ok ? 'OK' : result.error),
  };
}

async function completeRedirect(req, res) {
  try {
    const transactionId = String(req.body?.transactionId || '').trim();
    if (!transactionId) {
      res.status(400).json({ error: 'transactionId es obligatorio' });
      return;
    }
    const uid = req.user?.uid;
    const reference = String(req.body?.reference || '').trim();
    const result = await settleFromWompiId(transactionId, uid, reference);
    if (!result.ok) {
      const code = result.error;
      if (code === 'PENDING' || result.pending || result.decision?.action === 'pending') {
        res.json({
          pending: true,
          message: RECHARGE_PENDING,
        });
        return;
      }
      if (code === 'DECLINED' || result.decision?.code === 'DECLINED') {
        res.status(400).json({
          error: RECHARGE_DECLINED,
          status: 'DECLINED',
        });
        return;
      }
      if (code === 'forbidden' || code === 'FORBIDDEN') {
        res.status(403).json({ error: 'Esta orden de recarga no es tuya' });
        return;
      }
      res.status(400).json({
        error: result.error || 'No se pudo confirmar el pago con Wompi',
        status: result.decision?.code || null,
      });
      return;
    }
    if (result.pending) {
      res.json({
        pending: true,
        message: RECHARGE_PENDING,
      });
      return;
    }
    if (result.uid) {
      const { setBalances } = require('../lib/walletMemory');
      setBalances(result.uid, {
        purchasedBlastBalance: result.purchasedBlastBalance ?? result.summary?.purchasedBalance,
        earnedBlastBalance: result.earnedBlastBalance ?? result.summary?.earnedAvailable,
        coinsBalance: result.coinsBalance ?? result.summary?.coinsBalance,
      });
    }
    res.json({
      ...publicPurchaseResult(result),
      message: RECHARGE_OK,
    });
  } catch (error) {
    console.error('[payments/complete-redirect]', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'No se pudo verificar la transacción',
      });
    }
  }
}

/**
 * El widget no acredita. Solo informa estado o reconcilia si hay transactionId de Wompi.
 */
async function completeWidget(req, res) {
  try {
    const transactionId = String(req.body?.transactionId || req.body?.id || '').trim();
    const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim() : '';
    const uid = req.user?.uid;

    if (transactionId) {
      const result = await settleFromWompiId(transactionId, uid, reference);
      if (result.pending) {
        res.json({
          pending: true,
          message: RECHARGE_PENDING,
        });
        return;
      }
      if (!result.ok) {
        if (result.decision?.code === 'DECLINED') {
          res.status(400).json({
            error: RECHARGE_DECLINED,
            status: 'DECLINED',
          });
          return;
        }
        res.status(400).json({ error: result.error || 'Pago no acreditado todavía' });
        return;
      }
      res.json({
        ...publicPurchaseResult(result),
        message: RECHARGE_OK,
      });
      return;
    }

    if (!reference) {
      res.status(400).json({ error: 'transactionId o reference es obligatorio' });
      return;
    }

    if (firestoreConfigured()) {
      const saved = await readPaymentOrder(reference);
      if (!saved) {
        res.status(404).json({ error: 'No encontramos esa orden de recarga' });
        return;
      }
      if (String(saved.uid) !== String(uid)) {
        res.status(403).json({ error: 'Esta orden de recarga no es tuya' });
        return;
      }
      const credited = ['completed', 'COMPLETED', 'CREDITED'].includes(
        String(saved.status || ''),
      );
      if (credited) {
        const balance = await readUserCoinsBalance(uid);
        res.json({
          reference,
          coins: Number(saved.blastAmount || saved.coins) || 0,
          coinsBalance: balance,
          duplicate: true,
          message: RECHARGE_OK,
        });
        return;
      }
      res.json({
        pending: true,
        reference,
        status: saved.status || 'PENDING',
        message: RECHARGE_PENDING,
      });
      return;
    }

    res.json({
      pending: true,
      reference,
      message: RECHARGE_PENDING,
    });
  } catch (error) {
    console.error('[payments/complete-widget]', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'No se pudo consultar la recarga',
      });
    }
  }
}

async function reconcilePayment(req, res) {
  try {
    const transactionId = String(req.body?.transactionId || '').trim();
    const uid = req.user?.uid;
    const reference = String(req.body?.reference || '').trim();
    if (!transactionId) {
      const { reconcileStalePending } = require('../lib/blastPurchaseService');
      const stats = await reconcileStalePending(20);
      const summary = await require('../lib/walletService').getSummary(uid);
      res.json({
        ok: true,
        ...stats,
        summary: require('../lib/payoutConversion').publicWalletSummary(summary),
      });
      return;
    }
    const result = await settleFromWompiId(transactionId, uid, reference);
    if (!result.ok && !result.pending) {
      res.status(400).json({ error: result.error || 'No se pudo conciliar' });
      return;
    }
    res.json({
      ...publicPurchaseResult(result),
      pending: Boolean(result.pending),
      message: result.pending
        ? RECHARGE_PENDING
        : RECHARGE_OK,
    });
  } catch (error) {
    console.error('[payments/reconcile]', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo conciliar el pago',
    });
  }
}

async function getPaymentStatus(_req, res) {
  const publicKey = cleanWompiSecret(process.env.WOMPI_PUBLIC_KEY);
  const integrity = cleanWompiSecret(process.env.WOMPI_INTEGRITY_SECRET);
  const sandbox = publicKey.startsWith('pub_test_');
  let pairOk = false;
  try {
    if (publicKey && integrity) {
      assertIntegrityPair(publicKey, integrity);
      pairOk = true;
    }
  } catch {
    pairOk = false;
  }
  let merchantOk = false;
  let merchantName = null;
  if (publicKey) {
    try {
      const merchant = await getWompiMerchant(publicKey);
      merchantOk = Boolean(merchant?.active);
      merchantName = merchant?.name ? String(merchant.name) : null;
    } catch {
      merchantOk = false;
    }
  }
  res.json({
    configured: Boolean(publicKey && integrity),
    sandbox,
    pairOk,
    merchantOk,
    merchantName,
    widgetAvailable: merchantOk,
    firestore: firestoreConfigured(),
    hint: merchantOk
      ? null
      : 'La llave pública no existe en Wompi sandbox. Copia de nuevo desde el dashboard o usa checkout hospedado.',
  });
}

async function createOrder(req, res) {
  try {
    const packageId = req.body?.packageId;
    if (!packageId || typeof packageId !== 'string') {
      res.status(400).json({ error: 'packageId es obligatorio' });
      return;
    }

    const publicKey = String(process.env.WOMPI_PUBLIC_KEY || '').trim();
    if (!publicKey) {
      res.status(500).json({ error: 'WOMPI_PUBLIC_KEY no está configurada en el API' });
      return;
    }

    const resolved = resolveCoinPackage(packageId, req.body?.amountInCop);
    if (resolved.error) {
      res.status(400).json({ error: resolved.error });
      return;
    }

    const dbUser = userForOrder(req);
    if (!dbUser?.id) {
      res.status(401).json({ error: 'No hay usuario para crear el pedido' });
      return;
    }

    const amountInCop = resolved.pack.amountInCop;
    const widgetAvailable = await isWompiMerchantActive(publicKey);
    const order = buildOrderResponse({
      dbUser,
      pack: resolved.pack,
      packageId,
      amountInCop,
      publicKey,
    });

    const orderUid = String(req.user?.uid || dbUser.firebaseUid || '').trim();
    if (!orderUid) {
      res.status(401).json({ error: 'No hay usuario para crear el pedido' });
      return;
    }
    rememberOrder({
      reference: order.reference,
      uid: orderUid,
      coins: resolved.pack.coins,
      packageId,
      amountInCop,
    });

    if (firestoreConfigured()) {
      try {
        await savePaymentOrder({
          reference: order.reference,
          uid: orderUid,
          coins: resolved.pack.coins,
          packageId,
          amountInCop,
        });
      } catch (error) {
        console.error('[payments/create-order] firestore order:', error.message);
        res.status(500).json({ error: 'No se pudo crear la orden interna de recarga' });
        return;
      }
    }

    if (hasDatabase && prisma) {
      try {
        await prisma.transaction.create({
          data: {
            userId: dbUser.id,
            amount: resolved.pack.coins,
            amountInCop,
            type: 'deposit',
            status: 'pending',
            packageId,
            reference: order.reference,
            currency: order.currency,
          },
        });
      } catch (error) {
        console.error('[payments/create-order] no se persistió la orden:', error.message);
      }
    }

    let checkoutUrl = null;
    let paymentLinkId = null;
    let checkoutError = null;
    try {
      const link = await createPaymentLink({
        name: resolved.pack.coins ? `Blast ${resolved.pack.coins}` : packageId,
        description: `Recarga Blast — ${resolved.pack.coins} blast`,
        amountInCents: amountInCop,
        reference: order.reference,
      });
      checkoutUrl = link.url;
      paymentLinkId = link.id;
      if (firestoreConfigured() && paymentLinkId) {
        try {
          const { getAdminDb } = require('../lib/firestoreAdmin');
          const { FieldValue } = require('firebase-admin/firestore');
          await getAdminDb()
            .collection('paymentOrders')
            .doc(order.reference)
            .set({ paymentLinkId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        } catch (linkStoreError) {
          console.warn('[payments/create-order] paymentLinkId:', linkStoreError.message);
        }
      }
    } catch (linkError) {
      checkoutError = linkError instanceof Error ? linkError.message : String(linkError);
      console.warn('[payments/create-order] payment link:', checkoutError);
    }

    if (!widgetAvailable && !checkoutUrl) {
      res.status(503).json({
        error:
          'Wompi no reconoce tus llaves sandbox. En el dashboard copia de nuevo la llave pública, privada y secretos, o contacta soporte Wompi.',
        merchantOk: false,
        checkoutError,
      });
      return;
    }

    res.status(201).json({
      ...order,
      checkoutUrl,
      widgetAvailable,
      preferCheckout: !widgetAvailable && Boolean(checkoutUrl),
    });
  } catch (error) {
    console.error('[payments/create-order]', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'No se pudo crear el pedido de Wompi',
      });
    }
  }
}

async function withdrawCoins(req, res) {
  try {
    const dbUser = userForOrder(req);
    if (!dbUser?.id) {
      res.status(401).json({ error: 'Inicia sesión para retirar' });
      return;
    }
    const uid = dbUser.firebaseUid || dbUser.id;
    void req.body?.amountCOP;
    void req.body?.moneyAmountCOP;
    void req.body?.amount;
    const coins = Math.floor(Number(req.body?.coins ?? req.body?.earnedBlastAmount) || 0);
    const fullName = String(req.body?.fullName || '').trim().slice(0, 120);
    const documentId = String(req.body?.documentId || '').trim().slice(0, 32);
    const payoutMethod = String(req.body?.payoutMethod || '').trim().slice(0, 40);
    const accountNumber = String(req.body?.accountNumber || '').trim().slice(0, 40);
    const accountType = String(req.body?.accountType || 'ahorros').trim().slice(0, 20);

    if (!Number.isFinite(coins) || coins < MIN_WITHDRAW_COINS) {
      const { blastToMoneyExact } = require('../lib/payoutConversion');
      res.status(400).json({
        error: 'El monto a retirar no alcanza el mínimo autorizado.',
        minWithdrawAmount: blastToMoneyExact(MIN_WITHDRAW_COINS),
        currency: 'COP',
      });
      return;
    }
    if (!fullName || fullName.length < 3) {
      res.status(400).json({ error: 'Indica el nombre completo del titular' });
      return;
    }
    if (!documentId || documentId.length < 5) {
      res.status(400).json({ error: 'Indica la cédula o documento' });
      return;
    }
    if (!payoutMethod || payoutMethod.length < 2) {
      res.status(400).json({ error: 'Indica el banco o medio (Nequi, Bancolombia, etc.)' });
      return;
    }
    if (!accountNumber || accountNumber.length < 6) {
      res.status(400).json({ error: 'Indica el número de cuenta o celular Nequi/Daviplata' });
      return;
    }

    const { quoteWithdrawal, blastToMoneyExact, publicWalletSummary, stripLeakedRate } = require('../lib/payoutConversion');
    const wallet = require('../lib/walletService');
    const summary = await wallet.getSummary(uid);
    const quote = quoteWithdrawal(coins, summary.earnedAvailable);
    if (!quote.ok) {
      const code = quote.code;
      if (code === 'PURCHASED_NOT_WITHDRAWABLE') {
        res.status(400).json({
          error: 'Solo puedes retirar BLAST ganados. Los BLAST comprados no se retiran.',
          code,
          withdrawableBalance: summary.withdrawableBalance,
          withdrawableAmount: quote.withdrawableAmount,
          currency: 'COP',
          purchasedBalance: summary.purchasedBalance,
        });
        return;
      }
      res.status(400).json({
        error: 'Saldo retirable insuficiente.',
        code,
        withdrawableBalance: summary.withdrawableBalance,
        withdrawableAmount: blastToMoneyExact(summary.withdrawableBalance),
        currency: 'COP',
      });
      return;
    }
    if (coins < MIN_WITHDRAW_COINS) {
      res.status(400).json({
        error: 'El monto a retirar no alcanza el mínimo autorizado.',
        minWithdrawAmount: blastToMoneyExact(MIN_WITHDRAW_COINS),
        currency: 'COP',
      });
      return;
    }

    const moneyAmountCOP = quote.moneyAmountCOP;
    const moneyAmountExact = String(moneyAmountCOP);
    const reference = createWompiReference('wd');
    const payout = {
      id: reference,
      reference,
      coins,
      earnedBlastAmount: coins,
      moneyAmountCOP,
      moneyAmountExact,
      currency: 'COP',
      fullName,
      documentId,
      payoutMethod,
      accountNumber,
      accountType,
    };
    const result = await wallet.requestWithdrawal({
      userId: uid,
      amount: coins,
      idempotencyKey: `WITHDRAWAL_REQUEST:${reference}`,
      payout,
    });
    if (!result?.ok) {
      const failed = result?.balances
        ? require('../lib/walletEngine').toSummary(result.balances)
        : await wallet.getSummary(uid);
      const code = result?.code;
      res.status(400).json({
        error:
          code === 'PURCHASED_NOT_WITHDRAWABLE'
            ? 'Solo puedes retirar BLAST ganados. Los BLAST comprados no se retiran.'
            : 'Saldo retirable insuficiente.',
        code,
        withdrawableBalance: failed.withdrawableBalance,
        withdrawableAmount: blastToMoneyExact(failed.withdrawableBalance),
        currency: 'COP',
        purchasedBalance: failed.purchasedBalance,
      });
      return;
    }

    const publicSummary = publicWalletSummary(result.summary);
    const { publicWithdrawalRecord } = require('../lib/payoutConversion');
    const { WITHDRAWAL_STATUS } = require('../lib/walletEngine');
    const record = publicWithdrawalRecord({
      ...payout,
      status: WITHDRAWAL_STATUS.REQUESTED,
      requestedAt: new Date().toISOString(),
      paymentReference: reference,
    });

    if (hasDatabase && prisma) {
      try {
        await prisma.transaction.create({
          data: {
            userId: dbUser.id,
            amount: -coins,
            amountInCop: 0,
            type: 'withdraw',
            status: 'pending',
            packageId: 'withdraw',
            reference,
            currency: 'COP',
          },
        });
      } catch (error) {
        console.warn('[payments/withdraw] no se persistió la transacción:', error.message);
      }
    }

    res.status(201).json(stripLeakedRate({
      withdrawal: record,
      ...publicSummary,
      message: 'Retiro solicitado',
      detail: 'Tu solicitud de retiro fue recibida correctamente. El dinero se desembolsará en tu cuenta en un plazo de 3 a 5 días hábiles.',
      earnedBlastAmount: coins,
      moneyAmountCOP,
      moneyAmountExact,
      currency: 'COP',
      status: WITHDRAWAL_STATUS.REQUESTED,
    }));
  } catch (error) {
    console.error('[payments/withdraw]', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'No se pudo registrar el retiro',
      });
    }
  }
}

async function listMyWithdrawals(req, res) {
  try {
    const dbUser = userForOrder(req);
    if (!dbUser?.id) {
      res.status(401).json({ error: 'Inicia sesión' });
      return;
    }
    const uid = dbUser.firebaseUid || dbUser.id;
    const wallet = require('../lib/walletService');
    const { publicWalletSummary, publicWithdrawalRecord } = require('../lib/payoutConversion');
    const { normalizeWithdrawalStatus } = require('../lib/walletEngine');
    const summary = await wallet.getSummary(uid);
    const withdrawals = await wallet.listWithdrawals(uid);
    res.json({
      ...publicWalletSummary(summary),
      withdrawals: withdrawals.map((row) =>
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
}

module.exports = {
  createOrder,
  completeWidget,
  completeRedirect,
  reconcilePayment,
  getPaymentStatus,
  withdrawCoins,
  listMyWithdrawals,
};
module.exports.createOrder = createOrder;
module.exports.completeWidget = completeWidget;
module.exports.completeRedirect = completeRedirect;
module.exports.reconcilePayment = reconcilePayment;
module.exports.getPaymentStatus = getPaymentStatus;
module.exports.withdrawCoins = withdrawCoins;
module.exports.listMyWithdrawals = listMyWithdrawals;
