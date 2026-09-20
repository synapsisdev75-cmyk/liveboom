const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  CREATOR_BLAST_COP_RATE,
  blastToMoneyCop,
  blastToMoneyExact,
  publicWalletSummary,
  quoteWithdrawal,
  publicWithdrawalRecord,
  hasLeakedRate,
  stripLeakedRate,
} = require('./payoutConversion');
const { toSummary, normalizeBlastBalances } = require('./walletEngine');

describe('payoutConversion', () => {
  it('tasa cerrada 1 BLAST ganado = 15 COP enteros', () => {
    assert.equal(CREATOR_BLAST_COP_RATE, 15);
    assert.equal(blastToMoneyCop(1), 15);
    assert.equal(blastToMoneyCop(100), 1500);
    assert.equal(blastToMoneyCop(1000), 15000);
    assert.equal(blastToMoneyCop(10000), 150000);
    assert.equal(blastToMoneyCop(25840), 387600);
    assert.equal(blastToMoneyExact(25840), '387600');
  });

  it('purchased=20000 earned=10000 → dinero solo de ganados', () => {
    const s = toSummary(
      normalizeBlastBalances({
        purchasedBlastBalance: 20000,
        earnedBlastBalance: 10000,
      }),
    );
    const pub = publicWalletSummary(s);
    assert.equal(pub.totalAvailable, 30000);
    assert.equal(pub.earnedAvailable, 10000);
    assert.equal(pub.earnedBlastAvailable, 10000);
    assert.equal(pub.withdrawableBalance, 10000);
    assert.equal(pub.withdrawableAmount, 150000);
    assert.equal(pub.currency, 'COP');
    assert.equal(hasLeakedRate(pub), false);
  });

  it('purchased=0 earned=25840 → $387.600', () => {
    const s = toSummary(
      normalizeBlastBalances({
        purchasedBlastBalance: 0,
        earnedBlastBalance: 25840,
      }),
    );
    const pub = publicWalletSummary(s);
    assert.equal(pub.earnedBlastAvailable, 25840);
    assert.equal(pub.withdrawableAmount, 387600);
    assert.equal(hasLeakedRate(pub), false);
  });

  it('quote no incluye tasa interna', () => {
    const q = quoteWithdrawal(21000, 25000);
    assert.equal(q.ok, true);
    assert.equal(q.earnedBlastAmount, 21000);
    assert.equal(q.moneyAmountCOP, 315000);
    assert.equal(q.currency, 'COP');
    assert.equal(hasLeakedRate(q), false);
  });

  it('mínimo de retiro es 315000 COP', () => {
    const { MIN_WITHDRAW_COP, MIN_WITHDRAW_COINS } = require('./payoutConversion');
    assert.equal(MIN_WITHDRAW_COP, 315000);
    assert.equal(blastToMoneyCop(MIN_WITHDRAW_COINS), 315000);
    const below = quoteWithdrawal(20999, 50000);
    assert.equal(below.ok, false);
    assert.equal(below.code, 'BELOW_MINIMUM');
    assert.equal(below.minWithdrawAmount, 315000);
    const pub = publicWalletSummary(
      toSummary(normalizeBlastBalances({ earnedBlastBalance: 25840 })),
    );
    assert.equal(pub.minWithdrawAmount, 315000);
  });

  it('historial congela moneyAmountCOP y oculta rate', () => {
    const row = publicWithdrawalRecord({
      id: 'wd1',
      userId: 'u1',
      coins: 100,
      moneyAmountCOP: 999,
      status: 'REQUESTED',
      internalRate: 15,
      coinToCop: 15,
      blastRate: 15,
    });
    assert.equal(row.earnedBlastAmount, 100);
    assert.equal(row.moneyAmountCOP, 999);
    assert.equal(row.currency, 'COP');
    assert.equal('internalRate' in row, false);
    assert.equal('coinToCop' in row, false);
    assert.equal('blastRate' in row, false);
    assert.equal(hasLeakedRate(row), false);
  });

  it('stripLeakedRate elimina claves de tasa', () => {
    const safe = stripLeakedRate({
      earnedBlastAvailable: 10,
      withdrawableAmount: 150,
      currency: 'COP',
      blastRate: 15,
      CREATOR_BLAST_COP_RATE: 15,
    });
    assert.equal(safe.earnedBlastAvailable, 10);
    assert.equal(safe.withdrawableAmount, 150);
    assert.equal('blastRate' in safe, false);
    assert.equal('CREATOR_BLAST_COP_RATE' in safe, false);
  });

  it('congela 25840 BLAST = 387600 COP y no recalcula', () => {
    const row = publicWithdrawalRecord({
      id: 'wd-freeze',
      userId: 'u1',
      earnedBlastAmount: 25840,
      moneyAmountCOP: 387600,
    });
    assert.equal(row.earnedBlastAmount, 25840);
    assert.equal(row.moneyAmountCOP, 387600);
    assert.equal(row.currency, 'COP');
  });

  it('adminWithdrawalRecord incluye payout y oculta tasa', () => {
    const { adminWithdrawalRecord } = require('./payoutConversion');
    const row = adminWithdrawalRecord({
      id: 'wd-admin',
      userId: 'u1',
      earnedBlastAmount: 21000,
      moneyAmountCOP: 315000,
      internalRate: 15,
      blastRate: 15,
      payout: {
        fullName: 'Ana Pérez',
        documentId: '123',
        payoutMethod: 'Nequi',
        accountNumber: '3001234567',
        accountType: 'ahorros',
        coinToCop: 15,
      },
      user: { displayName: 'Ana', username: 'ana', email: 'ana@test.com' },
    });
    assert.equal(row.moneyAmountCOP, 315000);
    assert.equal(row.payout.payoutMethod, 'Nequi');
    assert.equal(row.payout.accountNumber, '3001234567');
    assert.equal(row.user.username, 'ana');
    assert.equal('internalRate' in row, false);
    assert.equal('blastRate' in row, false);
    assert.equal('coinToCop' in row.payout, false);
    assert.equal(hasLeakedRate(row), false);
  });
});
