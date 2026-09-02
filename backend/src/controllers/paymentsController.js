const { resolveCoinPackage, COIN_PACKAGES, COIN_TO_COP, MIN_WITHDRAW_COINS, coinsToCop } = require('../lib/coinPackages');
const {
  assertIntegrityPair,
  cleanWompiSecret,
  createWidgetIntegritySignature,
  fetchWompiTransaction,
  fetchWompiTransactionByReference,
  buildPaymentReference,
  parsePackageIdFromReference,
} = require('../lib/wompi');
const {
  credit,
  debit,
  rememberOrder,
  peekOrder,
  getOrder,
  markOrderCompleted,
  getBalance,
  setBalance,
  listWithdrawals,
  addWithdrawal,
} = require('../lib/walletMemory');
const {
  firestoreConfigured,
  savePaymentOrder,
  getPaymentOrder,
  getFirestoreCoins,
  creditApprovedOrder,
} = require('../lib/walletFirestore');
const dbUserFromTokenMod = require('../lib/dbUserFromToken');
const { randomUUID } = require('crypto');
const { prisma, hasDatabase } = require('../lib/prisma');

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

async function readPersistedCoins(uid) {
  let dbCoins = 0;
  if (hasDatabase && prisma) {
    try {
      const user = await prisma.user.findUnique({
        where: { firebaseUid: uid },
        select: { coinsBalance: true },
      });
      dbCoins = Number(user?.coinsBalance ?? 0);
    } catch {
      dbCoins = 0;
    }
  }
  const fsCoins = await getFirestoreCoins(uid);
  return Math.max(getBalance(uid), dbCoins, fsCoins);
}

/** Recarga = saldo actual (Firestore, memoria, Prisma o el que ya ve el usuario) + coins del paquete. */
async function creditTopup(uid, coins, floorFromClient = 0) {
  const amount = Math.max(0, Math.floor(Number(coins) || 0));
  const persisted = await readPersistedCoins(uid);
  const floor = Math.max(persisted, Math.max(0, Math.floor(Number(floorFromClient) || 0)));
  if (floor > getBalance(uid)) {
    setBalance(uid, floor);
  }
  const coinsBalance = credit(uid, amount);
  if (hasDatabase && prisma) {
    try {
      await prisma.user.update({
        where: { firebaseUid: uid },
        data: { coinsBalance },
      });
    } catch (error) {
      console.warn('[payments] no se persistió el saldo:', error.message);
    }
  }
  return coinsBalance;
}

async function settleApprovedTopup({ uid, order, wompiTxnId, floorFromClient = 0 }) {
  const floor = Math.max(
    Number(floorFromClient) || 0,
    Number(order.floor) || 0,
  );
  const fsResult = await creditApprovedOrder({
    uid,
    coins: order.coins,
    reference: order.reference,
    wompiTxnId,
    floor,
  });
  if (fsResult) {
    setBalance(uid, fsResult.coinsBalance);
    if (hasDatabase && prisma && !fsResult.duplicate) {
      try {
        await prisma.user.update({
          where: { firebaseUid: uid },
          data: { coinsBalance: fsResult.coinsBalance },
        });
      } catch (error) {
        console.warn('[payments] no se persistió el saldo prisma:', error.message);
      }
      try {
        await prisma.transaction.updateMany({
          where: { reference: order.reference },
          data: { status: 'completed', wompiTxnId: wompiTxnId || undefined },
        });
      } catch (error) {
        console.warn('[payments] no se actualizó la transacción:', error.message);
      }
    }
    markOrderCompleted(order.reference);
    return fsResult;
  }

  const memoryOrder = getOrder(order.reference);
  if (memoryOrder?.status === 'completed') {
    const coinsBalance = Math.max(getBalance(uid), await readPersistedCoins(uid));
    return { duplicate: true, coinsBalance };
  }

  const coinsBalance = await creditTopup(uid, order.coins, floor);
  markOrderCompleted(order.reference);
  return { duplicate: false, coinsBalance };
}

async function resolvePendingOrder({ reference, uid, txn }) {
  const fromFs = await getPaymentOrder(reference);
  if (fromFs) {
    return { ...fromFs, reference };
  }
  const fromMem = peekOrder(reference, uid) || getOrder(reference);
  if (fromMem && (!fromMem.uid || fromMem.uid === String(uid))) {
    return { ...fromMem, reference };
  }
  const packageId =
    parsePackageIdFromReference(reference, Object.keys(COIN_PACKAGES)) ||
    (txn && Number(txn.amount_in_cents)
      ? Object.keys(COIN_PACKAGES).find(
          (id) => COIN_PACKAGES[id].amountInCop === Number(txn.amount_in_cents),
        )
      : null);
  if (!packageId || !COIN_PACKAGES[packageId]) return null;
  const pack = COIN_PACKAGES[packageId];
  return {
    reference,
    uid,
    coins: pack.coins,
    packageId,
    amountInCop: pack.amountInCop,
    floor: 0,
    kind: 'coins',
  };
}

function buildOrderResponse({ dbUser, pack, packageId, amountInCop, publicKey, customerEmail, customerName }) {
  const uid = dbUser.firebaseUid || dbUser.id;
  const reference = buildPaymentReference(packageId, uid);
  const currency = 'COP';
  const integritySecret = assertIntegrityPair(publicKey, process.env.WOMPI_INTEGRITY_SECRET);
  const integritySignature = createWidgetIntegritySignature(
    reference,
    amountInCop,
    currency,
    integritySecret,
  );
  if (!integritySignature) {
    throw new Error('No se pudo generar la firma de integridad de Wompi');
  }
  return {
    reference,
    publicKey: cleanWompiSecret(publicKey),
    amountInCop,
    amountInCents: amountInCop,
    currency,
    packageId,
    coins: pack.coins,
    integritySignature,
    customerEmail: customerEmail || undefined,
    customerName: customerName || undefined,
  };
}

async function completeWidget(req, res) {
  try {
    const referenceIn =
      typeof req.body?.reference === 'string' ? req.body.reference.trim() : '';
    const transactionId =
      typeof req.body?.transactionId === 'string' ? req.body.transactionId.trim() : '';
    const uid = req.user?.uid;
    if (!uid) {
      res.status(401).json({ error: 'Inicia sesión para acreditar la recarga' });
      return;
    }
    if (!referenceIn && !transactionId) {
      res.status(400).json({ error: 'reference o transactionId es obligatorio' });
      return;
    }

    let txn = null;
    if (transactionId) {
      txn = await fetchWompiTransaction(transactionId);
    }
    if (!txn && referenceIn) {
      txn = await fetchWompiTransactionByReference(referenceIn);
    }
    if (!txn) {
      res.status(409).json({
        error:
          'No se pudo verificar el pago con Wompi. Si ya pagaste, espera unos segundos y recarga la billetera.',
      });
      return;
    }
    if (txn.status !== 'APPROVED') {
      res.status(409).json({
        error: `El pago quedó en ${txn.status}. Aún no se acredita blast.`,
        status: txn.status,
      });
      return;
    }

    const reference = String(txn.reference || referenceIn || '').trim();
    if (!reference) {
      res.status(400).json({ error: 'La transacción de Wompi no trae referencia' });
      return;
    }

    const order = await resolvePendingOrder({ reference, uid, txn });
    if (!order) {
      res.status(404).json({ error: 'No encontramos esa orden de recarga' });
      return;
    }
    if (order.uid && order.uid !== String(uid)) {
      res.status(403).json({ error: 'Esta orden pertenece a otra cuenta' });
      return;
    }
    if (order.kind && order.kind !== 'coins') {
      res.status(400).json({ error: 'Esta orden no es una recarga de blast' });
      return;
    }
    if (order.amountInCop && Number(txn.amount_in_cents) !== Number(order.amountInCop)) {
      res.status(400).json({ error: 'El monto pagado no coincide con el paquete' });
      return;
    }

    const result = await settleApprovedTopup({
      uid,
      order: { ...order, reference },
      wompiTxnId: txn.id,
      floorFromClient: req.body?.currentBalance,
    });

    res.json({
      reference,
      coins: order.coins,
      coinsBalance: result.coinsBalance,
      duplicate: Boolean(result.duplicate),
    });
  } catch (error) {
    console.error('[payments/complete-widget]', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'No se pudo acreditar la recarga',
      });
    }
  }
}

function simulateTopupAllowed() {
  const flag = String(process.env.ALLOW_SIMULATE_TOPUP ?? '1').trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off' || flag === 'no') return false;
  return true;
}

function getPaymentStatus(_req, res) {
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
  res.json({
    configured: Boolean(publicKey && integrity),
    sandbox,
    pairOk,
    firestore: firestoreConfigured(),
    simulateAvailable: simulateTopupAllowed(),
    coinToCop: COIN_TO_COP,
    minWithdrawCoins: MIN_WITHDRAW_COINS,
  });
}

async function simulateTopup(req, res) {
  try {
    if (!simulateTopupAllowed()) {
      res.status(403).json({ error: 'Simulación deshabilitada' });
      return;
    }
    const packageId = req.body?.packageId;
    if (!packageId || typeof packageId !== 'string') {
      res.status(400).json({ error: 'packageId es obligatorio' });
      return;
    }
    const resolved = resolveCoinPackage(packageId, req.body?.amountInCop);
    if (resolved.error) {
      res.status(400).json({ error: resolved.error });
      return;
    }
    const dbUser = userForOrder(req);
    const uid = req.user?.uid || dbUser?.firebaseUid || dbUser?.id;
    if (!uid) {
      res.status(401).json({ error: 'Inicia sesión para recargar' });
      return;
    }
    const simRef = `sim_${String(uid).slice(0, 16)}_${Date.now()}`;
    await savePaymentOrder({
      reference: simRef,
      uid,
      coins: resolved.pack.coins,
      packageId,
      amountInCop: resolved.pack.amountInCop,
      kind: 'coins',
      floor: Math.max(0, Math.floor(Number(req.body?.currentBalance) || 0)),
    });
    const fsResult = await creditApprovedOrder({
      uid,
      coins: resolved.pack.coins,
      reference: simRef,
      floor: req.body?.currentBalance,
    });
    const coinsBalance =
      fsResult?.coinsBalance ??
      (await creditTopup(uid, resolved.pack.coins, req.body?.currentBalance));
    if (fsResult?.coinsBalance != null) {
      setBalance(uid, fsResult.coinsBalance);
    }
    res.json({
      coins: resolved.pack.coins,
      coinsBalance,
      simulated: true,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo simular la recarga',
    });
  }
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
    const order = buildOrderResponse({
      dbUser,
      pack: resolved.pack,
      packageId,
      amountInCop,
      publicKey,
      customerEmail: req.user?.email || dbUser.email,
      customerName: dbUser.displayName || dbUser.username,
    });

    const pending = {
      reference: order.reference,
      uid: dbUser.firebaseUid || dbUser.id,
      coins: resolved.pack.coins,
      packageId,
      floor: Math.max(0, Math.floor(Number(req.body?.currentBalance) || 0)),
      amountInCop,
      currency: order.currency,
      kind: 'coins',
      status: 'pending',
    };
    rememberOrder(pending);
    await savePaymentOrder(pending);

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

    res.status(201).json(order);
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
    const coins = Math.floor(Number(req.body?.coins) || 0);
    const fullName = String(req.body?.fullName || '').trim().slice(0, 120);
    const documentId = String(req.body?.documentId || '').trim().slice(0, 32);
    const payoutMethod = String(req.body?.payoutMethod || '').trim().slice(0, 40);
    const accountNumber = String(req.body?.accountNumber || '').trim().slice(0, 40);
    const accountType = String(req.body?.accountType || 'ahorros').trim().slice(0, 20);

    if (!Number.isFinite(coins) || coins < MIN_WITHDRAW_COINS) {
      res.status(400).json({
        error: `El retiro mínimo es ${MIN_WITHDRAW_COINS} coins (${coinsToCop(MIN_WITHDRAW_COINS).toLocaleString('es-CO')} COP)`,
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

    const nextBalance = debit(uid, coins);
    if (nextBalance == null) {
      res.status(400).json({
        error: `Saldo insuficiente. Tienes ${getBalance(uid).toLocaleString('es-CO')} coins`,
      });
      return;
    }

    const amountCop = coinsToCop(coins);
    const reference = `wd_${String(uid).slice(0, 16)}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const record = addWithdrawal(uid, {
      id: reference,
      reference,
      coins,
      amountCop,
      coinToCop: COIN_TO_COP,
      fullName,
      documentId,
      payoutMethod,
      accountNumber,
      accountType,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    if (hasDatabase && prisma) {
      try {
        await prisma.user.update({
          where: { firebaseUid: uid },
          data: { coinsBalance: { decrement: coins } },
        });
      } catch (error) {
        console.warn('[payments/withdraw] no se persistió el saldo:', error.message);
      }
      try {
        await prisma.transaction.create({
          data: {
            userId: dbUser.id,
            amount: -coins,
            amountInCop: amountCop * 100,
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

    res.status(201).json({
      withdrawal: record,
      coinsBalance: nextBalance,
      coinToCop: COIN_TO_COP,
      message: `Solicitud registrada: ${coins} coins = $${amountCop.toLocaleString('es-CO')} COP`,
    });
  } catch (error) {
    console.error('[payments/withdraw]', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'No se pudo registrar el retiro',
      });
    }
  }
}

function listMyWithdrawals(req, res) {
  try {
    const dbUser = userForOrder(req);
    if (!dbUser?.id) {
      res.status(401).json({ error: 'Inicia sesión' });
      return;
    }
    const uid = dbUser.firebaseUid || dbUser.id;
    res.json({
      coinToCop: COIN_TO_COP,
      minWithdrawCoins: MIN_WITHDRAW_COINS,
      coinsBalance: getBalance(uid),
      withdrawals: listWithdrawals(uid),
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
  getPaymentStatus,
  simulateTopup,
  withdrawCoins,
  listMyWithdrawals,
  settleApprovedTopup,
  resolvePendingOrder,
};
module.exports.createOrder = createOrder;
module.exports.completeWidget = completeWidget;
module.exports.getPaymentStatus = getPaymentStatus;
module.exports.simulateTopup = simulateTopup;
module.exports.withdrawCoins = withdrawCoins;
module.exports.listMyWithdrawals = listMyWithdrawals;
module.exports.settleApprovedTopup = settleApprovedTopup;
module.exports.resolvePendingOrder = resolvePendingOrder;
