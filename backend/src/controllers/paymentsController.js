const { resolveCoinPackage, COIN_TO_COP, MIN_WITHDRAW_COINS, coinsToCop, blastForPackage } = require('../lib/coinPackages');
const {
  assertIntegrityPair,
  cleanWompiSecret,
  createWidgetIntegritySignature,
  createPaymentLink,
  createWompiReference,
  getWompiTransaction,
  getWompiMerchant,
  isWompiMerchantActive,
} = require('../lib/wompi');
const {
  rememberOrder,
  takeOrder,
  getBalances,
  setBalances,
  listWithdrawals,
  listAllWithdrawals,
  addWithdrawal,
  withdrawEarned,
  restoreEarned,
  updateWithdrawal,
} = require('../lib/walletMemory');
const dbUserFromTokenMod = require('../lib/dbUserFromToken');
const { prisma, hasDatabase } = require('../lib/prisma');
const {
  firestoreConfigured,
  savePaymentOrder,
  completePaymentOrder,
  readPaymentOrder,
  readUserCoinsBalance,
  createWithdrawalRequest,
  listWithdrawalRequests,
  updateWithdrawalRequest,
  readSuperAdminEmails,
} = require('../lib/firestoreAdmin');

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

const SUPER_ADMIN_OWNER_EMAIL = 'synapsisdev75@gmail.com';

async function isReqSuperAdmin(req) {
  const email = String(req.user?.email || req.dbUser?.email || '')
    .trim()
    .toLowerCase();
  if (!email) return false;
  if (email === SUPER_ADMIN_OWNER_EMAIL) return true;
  if (!firestoreConfigured()) return false;
  try {
    const emails = await readSuperAdminEmails();
    return emails.includes(email);
  } catch {
    return false;
  }
}

function serializeWithdrawalForUser(row) {
  return {
    id: row.id,
    coins: row.coins,
    amountCop: row.amountCop,
    status: row.status,
    payoutMethod: row.payoutMethod,
    fullName: row.fullName || row.displayName,
    displayName: row.displayName || row.fullName,
    createdAt: row.createdAt,
    source: row.source || 'earned',
  };
}

/** Recarga = saldo Firestore (fuente real) + coins del paquete → comprados. */
async function creditTopup(uid, coins) {
  const amount = Math.max(0, Math.floor(Number(coins) || 0));
  const { setBalances, getBalances } = require('../lib/walletMemory');
  const {
    normalizeBlastBalances,
    applyCreditPurchased,
    firestoreBalancePatch,
  } = require('../lib/blastBalances');

  if (firestoreConfigured()) {
    try {
      const { getAdminDb } = require('../lib/firestoreAdmin');
      const { FieldValue } = require('firebase-admin/firestore');
      const db = getAdminDb();
      const userRef = db.collection('users').doc(String(uid));
      const nextBal = await db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        const current = normalizeBlastBalances(snap.exists ? snap.data() : {});
        const next = applyCreditPurchased(current, amount);
        if (snap.exists) {
          tx.update(userRef, {
            ...firestoreBalancePatch(next),
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          tx.set(
            userRef,
            {
              firebaseUid: String(uid),
              ...firestoreBalancePatch(next),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
        return next;
      });
      setBalances(uid, nextBal);
      if (hasDatabase && prisma) {
        try {
          await prisma.user.update({
            where: { firebaseUid: uid },
            data: { coinsBalance: nextBal.coinsBalance },
          });
        } catch (error) {
          console.warn('[payments] no se persistió el saldo en Prisma:', error.message);
        }
      }
      return nextBal.coinsBalance;
    } catch (error) {
      console.warn('[payments] firestore creditTopup fallback:', error.message);
    }
  }

  let seed = getBalances(uid);
  if (seed.coinsBalance === 0 && hasDatabase && prisma) {
    try {
      const user = await prisma.user.findUnique({
        where: { firebaseUid: uid },
        select: { coinsBalance: true },
      });
      const dbCoins = Number(user?.coinsBalance ?? 0);
      if (dbCoins > 0) {
        seed = normalizeBlastBalances({ coinsBalance: dbCoins });
        setBalances(uid, seed);
      }
    } catch {
      /* ignore */
    }
  }
  const nextBal = applyCreditPurchased(getBalances(uid), amount);
  setBalances(uid, nextBal);
  if (hasDatabase && prisma) {
    try {
      await prisma.user.update({
        where: { firebaseUid: uid },
        data: { coinsBalance: nextBal.coinsBalance },
      });
    } catch (error) {
      console.warn('[payments] no se persistió el saldo:', error.message);
    }
  }
  return nextBal.coinsBalance;
}

function buildOrderResponse({ pack, packageId, amountInCop, publicKey }) {
  const reference = createWompiReference('lb');
  const currency = 'COP';
  const expirationTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const integritySecret = assertIntegrityPair(publicKey, process.env.WOMPI_INTEGRITY_SECRET);
  const integritySignature = createWidgetIntegritySignature(
    reference,
    amountInCop,
    currency,
    integritySecret,
    expirationTime,
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
    expirationTime,
  };
}

async function completeRedirect(req, res) {
  try {
    const transactionId = String(req.body?.transactionId || '').trim();
    if (!transactionId) {
      res.status(400).json({ error: 'transactionId es obligatorio' });
      return;
    }

    const txn = await getWompiTransaction(transactionId);
    if (!txn) {
      res.status(404).json({ error: 'Transacción no encontrada en Wompi' });
      return;
    }

    const status = String(txn.status || '').toUpperCase();
    if (status !== 'APPROVED') {
      res.status(400).json({
        error: `La transacción está en estado ${status || 'desconocido'}`,
        status,
      });
      return;
    }

    const reference = String(txn.reference || '').trim();
    const paymentLinkId = txn.payment_link_id ? String(txn.payment_link_id) : '';
    const paidAmount = Number(txn.amount_in_cents);
    const uid = req.user?.uid;

    if (firestoreConfigured()) {
      let result = null;
      if (reference) {
        result = await completePaymentOrder(reference, uid, {
          amountInCop: paidAmount,
          wompiTxnId: txn.id,
        });
      }
      if (!result?.ok && paymentLinkId) {
        const { completePaymentOrderByLinkId } = require('../lib/firestoreAdmin');
        result = await completePaymentOrderByLinkId(paymentLinkId, {
          amountInCop: paidAmount,
          wompiTxnId: txn.id,
        });
      }
      if (result?.ok) {
        if (result.uid) {
          if (
            result.purchasedBlastBalance != null ||
            result.earnedBlastBalance != null
          ) {
            setBalances(result.uid, {
              purchasedBlastBalance: result.purchasedBlastBalance,
              earnedBlastBalance: result.earnedBlastBalance,
              coinsBalance: result.coinsBalance,
            });
          } else {
            setBalance(result.uid, result.coinsBalance);
          }
        }
        res.json({
          reference: reference || paymentLinkId,
          coins: result.coins,
          coinsBalance: result.coinsBalance,
          purchasedBlastBalance: result.purchasedBlastBalance,
          earnedBlastBalance: result.earnedBlastBalance,
          duplicate: Boolean(result.duplicate),
        });
        return;
      }
      if (result?.error === 'forbidden') {
        res.status(403).json({ error: 'Esta orden de recarga no es tuya' });
        return;
      }
      if (result?.error === 'coins_mismatch') {
        res.status(400).json({ error: 'El blast del paquete no coincide con la orden' });
        return;
      }
      if (reference) {
        const saved = await readPaymentOrder(reference);
        if (saved?.status === 'completed') {
          const balance = await readUserCoinsBalance(uid);
          setBalance(uid, balance);
          res.json({
            reference,
            coins: Number(saved.coins) || 0,
            coinsBalance: balance,
            duplicate: true,
          });
          return;
        }
      }
      res.status(404).json({ error: 'No encontramos la orden asociada a esta transacción' });
      return;
    }

    if (reference) {
      const order = takeOrder(reference, uid);
      if (order) {
        const packCoins = blastForPackage(order.packageId, order.coins);
        if (!packCoins) {
          res.status(400).json({ error: 'El blast del paquete no coincide con la orden' });
          return;
        }
        const coinsBalance = await creditTopup(uid, packCoins);
        res.json({
          reference,
          coins: packCoins,
          coinsBalance,
        });
        return;
      }
    }

    res.status(404).json({ error: 'No encontramos la orden asociada a esta transacción' });
  } catch (error) {
    console.error('[payments/complete-redirect]', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'No se pudo verificar la transacción',
      });
    }
  }
}

async function completeWidget(req, res) {
  try {
    const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim() : '';
    if (!reference) {
      res.status(400).json({ error: 'reference es obligatorio' });
      return;
    }

    const uid = req.user?.uid;

    if (firestoreConfigured()) {
      try {
        const result = await completePaymentOrder(reference, uid);
        if (result.ok) {
          if (
            result.purchasedBlastBalance != null ||
            result.earnedBlastBalance != null
          ) {
            setBalances(uid, {
              purchasedBlastBalance: result.purchasedBlastBalance,
              earnedBlastBalance: result.earnedBlastBalance,
              coinsBalance: result.coinsBalance,
            });
          } else {
            setBalance(uid, result.coinsBalance);
          }
          res.json({
            reference,
            coins: result.coins,
            coinsBalance: result.coinsBalance,
            purchasedBlastBalance: result.purchasedBlastBalance,
            earnedBlastBalance: result.earnedBlastBalance,
            duplicate: Boolean(result.duplicate),
          });
          return;
        }
        if (result.error === 'forbidden') {
          res.status(403).json({ error: 'Esta orden de recarga no es tuya' });
          return;
        }
        if (result.error === 'coins_mismatch') {
          res.status(400).json({ error: 'El blast del paquete no coincide con la orden' });
          return;
        }
        const saved = await readPaymentOrder(reference);
        if (saved?.status === 'completed') {
          const balance = await readUserCoinsBalance(uid);
          setBalance(uid, balance);
          res.json({
            reference,
            coins: Number(saved.coins) || 0,
            coinsBalance: balance,
            duplicate: true,
          });
          return;
        }
      } catch (error) {
        console.warn('[payments/complete-widget] firestore:', error.message);
      }
      res.status(404).json({ error: 'No encontramos esa orden de recarga' });
      return;
    }

    const order = takeOrder(reference, uid);
    if (!order) {
      res.status(404).json({ error: 'No encontramos esa orden de recarga' });
      return;
    }

    const packCoins = blastForPackage(order.packageId, order.coins);
    if (!packCoins) {
      res.status(400).json({ error: 'El blast del paquete no coincide con la orden' });
      return;
    }

    const coinsBalance = await creditTopup(uid, packCoins);

    res.json({
      reference,
      coins: packCoins,
      coinsBalance,
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
    coinToCop: COIN_TO_COP,
    minWithdrawCoins: MIN_WITHDRAW_COINS,
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

    const orderUid = dbUser.firebaseUid || dbUser.id;
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
    const coins = Math.floor(Number(req.body?.coins) || 0);
    const fullName = String(req.body?.fullName || '').trim().slice(0, 120);
    const documentId = String(req.body?.documentId || '').trim().slice(0, 32);
    const payoutMethod = String(req.body?.payoutMethod || '').trim().slice(0, 40);
    const accountNumber = String(req.body?.accountNumber || '').trim().slice(0, 40);
    const accountType = String(req.body?.accountType || 'ahorros').trim().slice(0, 20);

    if (!Number.isFinite(coins) || coins < MIN_WITHDRAW_COINS) {
      res.status(400).json({
        error: `El retiro mínimo es ${MIN_WITHDRAW_COINS} Blast ganados (${coinsToCop(MIN_WITHDRAW_COINS).toLocaleString('es-CO')} COP)`,
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

    const amountCop = coinsToCop(coins);
    const reference = createWompiReference('wd');
    let balances = getBalances(uid);
    let record = null;
    let creditedFirestore = false;

    if (firestoreConfigured()) {
      try {
        const created = await createWithdrawalRequest(uid, {
          id: reference,
          coins,
          amountCop,
          coinToCop: COIN_TO_COP,
          fullName,
          documentId,
          payoutMethod,
          accountNumber,
          accountType,
        });
        if (created?.ok === false && created.error === 'INSUFFICIENT_EARNED') {
          res.status(400).json({
            error: `Solo puedes retirar Blast ganados (regalos, llamadas y videollamadas). Tienes ${Number(created.available || 0).toLocaleString('es-CO')} Blast ganados. Las recargas no se retiran.`,
            availableEarnedBlast: created.available || 0,
            purchasedBlastBalance: created.balances?.purchasedBlastBalance,
          });
          return;
        }
        if (created?.ok && created.balances && created.withdrawal) {
          creditedFirestore = true;
          balances = created.balances;
          record = created.withdrawal;
          setBalances(uid, balances);
        }
      } catch (error) {
        console.warn('[payments/withdraw] firestore fallback:', error.message);
      }
    }

    if (!creditedFirestore) {
      const next = withdrawEarned(uid, coins);
      if (!next) {
        const earned = getBalances(uid).earnedBlastBalance;
        res.status(400).json({
          error: `Solo puedes retirar Blast ganados (regalos, llamadas y videollamadas). Tienes ${earned.toLocaleString('es-CO')} Blast ganados. Las recargas no se retiran.`,
          availableEarnedBlast: earned,
        });
        return;
      }
      balances = next;
      record = addWithdrawal(uid, {
        id: reference,
        reference,
        uid,
        coins,
        amountCop,
        coinToCop: COIN_TO_COP,
        fullName,
        displayName: fullName,
        documentId,
        payoutMethod,
        accountNumber,
        accountType,
        status: 'pending',
        source: 'earned',
        createdAt: new Date().toISOString(),
      });
    } else {
      addWithdrawal(uid, {
        ...record,
        reference,
        documentId,
        accountNumber,
        accountType,
      });
    }

    if (hasDatabase && prisma) {
      try {
        await prisma.user.update({
          where: { firebaseUid: uid },
          data: { coinsBalance: balances.coinsBalance },
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
      withdrawal: serializeWithdrawalForUser(record),
      coinsBalance: balances.coinsBalance,
      purchasedBlastBalance: balances.purchasedBlastBalance,
      earnedBlastBalance: balances.earnedBlastBalance,
      earnedBlastWithdrawn: balances.earnedBlastWithdrawn,
      coinToCop: COIN_TO_COP,
      message: `Solicitud registrada: ${coins} Blast ganados = $${amountCop.toLocaleString('es-CO')} COP`,
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

async function listMyWithdrawals(req, res) {
  try {
    const dbUser = userForOrder(req);
    if (!dbUser?.id) {
      res.status(401).json({ error: 'Inicia sesión' });
      return;
    }
    const uid = dbUser.firebaseUid || dbUser.id;
    let withdrawals = listWithdrawals(uid);
    if (firestoreConfigured()) {
      try {
        const rows = await listWithdrawalRequests({ uid, limit: 80 });
        if (rows.length) withdrawals = rows;
      } catch (error) {
        console.warn('[payments/withdrawals]', error.message);
      }
    }
    const balances = getBalances(uid);
    res.json({
      coinToCop: COIN_TO_COP,
      minWithdrawCoins: MIN_WITHDRAW_COINS,
      coinsBalance: balances.coinsBalance,
      purchasedBlastBalance: balances.purchasedBlastBalance,
      earnedBlastBalance: balances.earnedBlastBalance,
      withdrawals: withdrawals.map(serializeWithdrawalForUser),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo listar retiros',
    });
  }
}

async function listAdminWithdrawals(req, res) {
  try {
    if (!(await isReqSuperAdmin(req))) {
      res.status(403).json({ error: 'Solo Super Admin puede ver las solicitudes de retiro' });
      return;
    }
    let withdrawals = listAllWithdrawals();
    if (firestoreConfigured()) {
      try {
        const rows = await listWithdrawalRequests({ limit: 200 });
        if (rows.length) withdrawals = rows;
      } catch (error) {
        console.warn('[payments/admin/withdrawals]', error.message);
      }
    }
    res.json({
      coinToCop: COIN_TO_COP,
      withdrawals,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudieron listar los retiros',
    });
  }
}

async function reviewAdminWithdrawal(req, res) {
  try {
    if (!(await isReqSuperAdmin(req))) {
      res.status(403).json({ error: 'Solo Super Admin puede revisar retiros' });
      return;
    }
    const id = String(req.params?.id || req.body?.id || '').trim();
    const status = String(req.body?.status || '').trim();
    const reviewNote = String(req.body?.reviewNote || '').trim().slice(0, 500);
    if (!id) {
      res.status(400).json({ error: 'Falta el id de la solicitud' });
      return;
    }
    if (!['pending', 'paid', 'rejected'].includes(status)) {
      res.status(400).json({ error: 'Estado inválido' });
      return;
    }

    const reviewer = String(req.user?.email || req.dbUser?.email || '').trim().toLowerCase();
    let result = null;
    if (firestoreConfigured()) {
      try {
        result = await updateWithdrawalRequest(id, {
          status,
          reviewNote,
          reviewedByEmail: reviewer,
        });
      } catch (error) {
        console.warn('[payments/admin/withdraw] firestore fallback', error.message);
      }
    }

    if (!result?.ok) {
      const mem = updateWithdrawal(id, {
        status,
        reviewNote,
        reviewedByEmail: reviewer,
      });
      if (!mem) {
        res.status(404).json({ error: result?.error === 'not_found' ? 'Solicitud no encontrada' : 'No se pudo actualizar' });
        return;
      }
      if (status === 'rejected' && mem.record?.uid && mem.record?.coins) {
        restoreEarned(mem.record.uid, mem.record.coins);
      }
      result = { ok: true, withdrawal: mem.record };
    } else if (result.balances && result.withdrawal?.uid) {
      setBalances(result.withdrawal.uid, result.balances);
    }

    res.json({ ok: true, withdrawal: result.withdrawal });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo actualizar el retiro',
    });
  }
}

module.exports = {
  createOrder,
  completeWidget,
  completeRedirect,
  getPaymentStatus,
  withdrawCoins,
  listMyWithdrawals,
  listAdminWithdrawals,
  reviewAdminWithdrawal,
};
module.exports.createOrder = createOrder;
module.exports.completeWidget = completeWidget;
module.exports.completeRedirect = completeRedirect;
module.exports.getPaymentStatus = getPaymentStatus;
module.exports.withdrawCoins = withdrawCoins;
module.exports.listMyWithdrawals = listMyWithdrawals;
module.exports.listAdminWithdrawals = listAdminWithdrawals;
module.exports.reviewAdminWithdrawal = reviewAdminWithdrawal;
