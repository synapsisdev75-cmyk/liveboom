const test = require('node:test');
const assert = require('node:assert/strict');

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

test('gift and withdrawal transactions are atomic and idempotent', { skip: !enabled }, async () => {
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'liveboom-app';
  const { Timestamp } = require('firebase-admin/firestore');
  const { getAdminDb } = require('./firestoreAdmin');
  const { sendGiftTransaction } = require('./giftTransactions');
  const {
    createWithdrawalRequest,
    updateWithdrawalRequest,
  } = require('./withdrawalRequests');

  const db = getAdminDb();
  const senderUid = 'test-wallet-sender';
  const creatorUid = 'test-wallet-creator';
  const postId = 'test-wallet-publication';
  const adminUid = 'test-wallet-admin';
  const adminEmail = 'synapsisdev75@gmail.com';

  await Promise.all([
    db.collection('users').doc(senderUid).set({
      firebaseUid: senderUid,
      username: 'wallet_sender',
      displayName: 'Sender',
      email: 'sender@example.com',
      purchasedBlastBalance: 100,
      earnedBlastBalance: 20,
      coinsBalance: 120,
      earnedBlastSpent: 0,
      earnedBlastWithdrawn: 0,
    }),
    db.collection('users').doc(creatorUid).set({
      firebaseUid: creatorUid,
      username: 'wallet_creator',
      displayName: 'Creator',
      email: 'creator@example.com',
      purchasedBlastBalance: 0,
      earnedBlastBalance: 100,
      coinsBalance: 100,
      earnedBlastSpent: 0,
      earnedBlastWithdrawn: 0,
    }),
    db.collection('posts').doc(postId).set({
      authorUid: creatorUid,
      type: 'photo',
      postFormat: 'post',
      visibility: 'public',
    }),
    db.collection('adminSessions').doc(adminUid).set({
      email: adminEmail,
      expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
    }),
  ]);

  const giftInput = {
    senderUid,
    senderName: 'Sender',
    giftId: 'aguacate',
    multiplier: 1,
    clientId: 'integration-gift-1',
    postId,
  };
  const sent = await sendGiftTransaction(giftInput);
  const duplicateGift = await sendGiftTransaction(giftInput);
  assert.equal(sent.duplicate, false);
  assert.equal(sent.context.source, 'publication');
  assert.equal(sent.senderBalances.purchasedBlastBalance, 75);
  assert.equal(sent.senderBalances.earnedBlastBalance, 20);
  assert.equal(sent.recipientBalances.earnedBlastBalance, 125);
  assert.equal(duplicateGift.duplicate, true);
  assert.equal(duplicateGift.recipientBalances.earnedBlastBalance, 125);

  const withdrawalInput = {
    uid: creatorUid,
    tokenProfile: { name: 'Creator', email: 'creator@example.com' },
    coins: 50,
    amountCop: 750,
    coinToCop: 15,
    clientRequestId: 'integration-withdrawal-1',
    fullName: 'Creator Test',
    documentId: '12345678',
    payoutMethod: 'Nequi',
    accountNumber: '3001234567',
    accountType: 'billetera',
  };
  const withdrawal = await createWithdrawalRequest(withdrawalInput);
  const duplicateWithdrawal = await createWithdrawalRequest(withdrawalInput);
  assert.equal(withdrawal.duplicate, false);
  assert.equal(withdrawal.balances.earnedBlastBalance, 75);
  assert.equal(withdrawal.balances.earnedBlastWithdrawn, 50);
  assert.equal(duplicateWithdrawal.duplicate, true);
  assert.equal(duplicateWithdrawal.balances.earnedBlastBalance, 75);

  const rejected = await updateWithdrawalRequest(
    { uid: adminUid, email: adminEmail },
    withdrawal.withdrawal.id,
    'rejected',
    'Cuenta inválida',
  );
  assert.equal(rejected.status, 'rejected');
  const creator = (await db.collection('users').doc(creatorUid).get()).data();
  assert.equal(creator.earnedBlastBalance, 125);
  assert.equal(creator.earnedBlastWithdrawn, 0);
  assert.equal(creator.purchasedBlastBalance, 0);
});
