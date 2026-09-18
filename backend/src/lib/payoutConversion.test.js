const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  blastToMoneyExact,
  publicWalletSummary,
  quoteWithdrawal,
  publicWithdrawalRecord,
  hasLeakedRate,
} = require('./payoutConversion');
const { toSummary, normalizeBlastBalances } = require('./walletEngine');

describe('payoutConversion', () => {
  it('purchased=10000 earned=5000 → withdrawable money solo de ganados', () => {
    const s = toSummary(
      normalizeBlastBalances({
        purchasedBlastBalance: 10000,
        earnedBlastBalance: 5000,
      }),
    );
    const pub = publicWalletSummary(s);
    assert.equal(pub.totalAvailable, 15000);
    assert.equal(pub.withdrawableBalance, 5000);
    assert.equal(pub.withdrawableAmount, blastToMoneyExact(5000));
    assert.equal(pub.currency, 'COP');
    assert.equal(hasLeakedRate(pub), false);
  });

  it('quote no incluye tasa interna', () => {
    const q = quoteWithdrawal(200, 500);
    assert.equal(q.ok, true);
    assert.equal(q.earnedBlastAmount, 200);
    assert.equal(q.moneyAmountExact, blastToMoneyExact(200));
    assert.equal(q.currency, 'COP');
    assert.equal(hasLeakedRate(q), false);
  });

  it('historial público oculta rate interno', () => {
    const row = publicWithdrawalRecord({
      id: 'wd1',
      userId: 'u1',
      coins: 100,
      moneyAmountExact: blastToMoneyExact(100),
      status: 'REQUESTED',
      internalRate: '15.0000',
      coinToCop: 15,
    });
    assert.equal(row.earnedBlastAmount, 100);
    assert.equal(row.currency, 'COP');
    assert.equal('internalRate' in row, false);
    assert.equal('coinToCop' in row, false);
    assert.equal(hasLeakedRate(row), false);
  });
});
