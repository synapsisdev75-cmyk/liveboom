const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeBlastBalances,
  applyWithdrawEarned,
  applyRefundWithdrawal,
} = require('./blastBalances');

test('withdrawal only reserves earned Blast', () => {
  const current = normalizeBlastBalances({
    purchasedBlastBalance: 900,
    earnedBlastBalance: 120,
    earnedBlastWithdrawn: 10,
  });
  const next = applyWithdrawEarned(current, 100);
  assert.deepEqual(next, {
    purchasedBlastBalance: 900,
    earnedBlastBalance: 20,
    coinsBalance: 920,
    earnedBlastSpent: 0,
    earnedBlastWithdrawn: 110,
    availableEarnedBlast: 20,
    totalBlastBalance: 920,
  });
});

test('withdrawal rejects purchased Blast even when total is sufficient', () => {
  const current = normalizeBlastBalances({
    purchasedBlastBalance: 10_000,
    earnedBlastBalance: 20,
  });
  assert.equal(applyWithdrawEarned(current, 50), null);
});

test('rejected withdrawal restores earned Blast exactly once', () => {
  const reserved = normalizeBlastBalances({
    purchasedBlastBalance: 300,
    earnedBlastBalance: 25,
    earnedBlastWithdrawn: 75,
  });
  const refunded = applyRefundWithdrawal(reserved, 50);
  assert.equal(refunded.purchasedBlastBalance, 300);
  assert.equal(refunded.earnedBlastBalance, 75);
  assert.equal(refunded.earnedBlastWithdrawn, 25);
  assert.equal(refunded.coinsBalance, 375);
});
