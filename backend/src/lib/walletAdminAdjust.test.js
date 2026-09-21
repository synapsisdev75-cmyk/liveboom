const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { firestoreConfigured } = require('./firestoreAdmin');

describe('walletService.adminAdjustBlast', { skip: firestoreConfigured() }, () => {
  beforeEach(() => {
    delete require.cache[require.resolve('./walletService')];
    delete require.cache[require.resolve('./walletMemory')];
  });

  it('acredita y debita buckets por separado con idempotencia', async () => {
    const wallet = require('./walletService');
    const uid = `admin-adjust-${Date.now()}`;
    const credit = await wallet.adminAdjustBlast({
      userId: uid,
      bucket: 'earned',
      delta: 40,
      idempotencyKey: 'k1',
      actorEmail: 'synapsisdev75@gmail.com',
      reason: 'test',
    });
    assert.equal(credit.ok, true);
    assert.equal(credit.summary.earnedAvailable, 40);
    assert.equal(credit.summary.purchasedBalance, 0);
    const dup = await wallet.adminAdjustBlast({
      userId: uid,
      bucket: 'earned',
      delta: 40,
      idempotencyKey: 'k1',
      actorEmail: 'synapsisdev75@gmail.com',
    });
    assert.equal(dup.duplicate, true);
    assert.equal(dup.summary.earnedAvailable, 40);
    const debit = await wallet.adminAdjustBlast({
      userId: uid,
      bucket: 'earned',
      delta: -10,
      idempotencyKey: 'k2',
    });
    assert.equal(debit.ok, true);
    assert.equal(debit.summary.earnedAvailable, 30);
    const purchased = await wallet.adminAdjustBlast({
      userId: uid,
      bucket: 'purchased',
      delta: 5,
      idempotencyKey: 'k3',
    });
    assert.equal(purchased.ok, true);
    assert.equal(purchased.summary.purchasedBalance, 5);
    assert.equal(purchased.summary.earnedAvailable, 30);
    assert.equal(purchased.summary.withdrawableBalance, 30);
  });

  it('rechaza débito que mezclaría reserved o buckets insuficientes', async () => {
    const wallet = require('./walletService');
    const uid = `admin-adjust-fail-${Date.now()}`;
    await wallet.adminAdjustBlast({
      userId: uid,
      bucket: 'purchased',
      delta: 8,
      idempotencyKey: 'p1',
    });
    const fail = await wallet.adminAdjustBlast({
      userId: uid,
      bucket: 'earned',
      delta: -1,
      idempotencyKey: 'e1',
    });
    assert.equal(fail.ok, false);
    assert.equal(fail.code, 'INSUFFICIENT_EARNED');
  });
});
