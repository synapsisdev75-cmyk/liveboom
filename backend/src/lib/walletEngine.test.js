const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeBlastBalances,
  toSummary,
  applyCreditPurchased,
  applyCreditEarned,
  applySpend,
  applyRequestWithdrawal,
  applyConfirmWithdrawal,
  applyRejectWithdrawal,
  applyRefund,
} = require('./walletEngine');

describe('walletEngine', () => {
  it('recarga acredita solo purchased', () => {
    const next = applyCreditPurchased(normalizeBlastBalances({}), 10000);
    const s = toSummary(next);
    assert.equal(s.purchasedBalance, 10000);
    assert.equal(s.earnedAvailable, 0);
    assert.equal(s.totalAvailable, 10000);
    assert.equal(s.withdrawableBalance, 0);
  });

  it('regalo / llamada / live / privado acreditan earned', () => {
    let b = normalizeBlastBalances({});
    b = applyCreditEarned(b, 250); // gift
    b = applyCreditEarned(b, 300); // call
    b = applyCreditEarned(b, 400); // video
    b = applyCreditEarned(b, 750); // live
    b = applyCreditEarned(b, 500); // private
    const s = toSummary(b);
    assert.equal(s.purchasedBalance, 0);
    assert.equal(s.earnedAvailable, 2200);
    assert.equal(s.withdrawableBalance, 2200);
  });

  it('purchased=10000 earned=5000 → total 15000 withdrawable 5000', () => {
    const b = normalizeBlastBalances({
      purchasedBlastBalance: 10000,
      earnedBlastBalance: 5000,
    });
    const s = toSummary(b);
    assert.equal(s.purchasedBalance, 10000);
    assert.equal(s.earnedAvailable, 5000);
    assert.equal(s.totalAvailable, 15000);
    assert.equal(s.withdrawableBalance, 5000);
  });

  it('retiro de purchased está bloqueado', () => {
    const b = normalizeBlastBalances({
      purchasedBlastBalance: 20000,
      earnedBlastBalance: 0,
    });
    const result = applyRequestWithdrawal(b, 1000);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'PURCHASED_NOT_WITHDRAWABLE');
    assert.equal(result.balances.purchasedBlastBalance, 20000);
    assert.equal(result.balances.earnedBlastReserved, 0);
  });

  it('retiro de earned reserva saldo y no toca purchased', () => {
    const start = normalizeBlastBalances({
      purchasedBlastBalance: 20000,
      earnedBlastBalance: 8000,
    });
    const req = applyRequestWithdrawal(start, 3000);
    assert.equal(req.ok, true);
    const s = toSummary(req.balances);
    assert.equal(s.purchasedBalance, 20000);
    assert.equal(s.earnedAvailable, 5000);
    assert.equal(s.earnedReserved, 3000);
    assert.equal(s.withdrawableBalance, 5000);
    assert.equal(s.totalAvailable, 25000);

    const paid = applyConfirmWithdrawal(req.balances, 3000);
    assert.equal(paid.ok, true);
    const afterPaid = toSummary(paid.balances);
    assert.equal(afterPaid.earnedReserved, 0);
    assert.equal(afterPaid.earnedAvailable, 5000);
    assert.equal(afterPaid.purchasedBalance, 20000);

    const rejected = applyRejectWithdrawal(req.balances, 3000);
    assert.equal(rejected.ok, true);
    const afterReject = toSummary(rejected.balances);
    assert.equal(afterReject.earnedAvailable, 8000);
    assert.equal(afterReject.earnedReserved, 0);
  });

  it('no permite doble retiro del mismo saldo disponible', () => {
    const start = normalizeBlastBalances({
      purchasedBlastBalance: 1000,
      earnedBlastBalance: 500,
    });
    const first = applyRequestWithdrawal(start, 500);
    assert.equal(first.ok, true);
    const second = applyRequestWithdrawal(first.balances, 500);
    assert.equal(second.ok, false);
    assert.equal(second.code, 'PURCHASED_NOT_WITHDRAWABLE');
  });

  it('consumo usa purchased primero y luego earned', () => {
    const start = normalizeBlastBalances({
      purchasedBlastBalance: 300,
      earnedBlastBalance: 500,
    });
    const spent = applySpend(start, 400, { allowEarned: true, strict: true });
    assert.equal(spent.ok, true);
    assert.equal(spent.chargedPurchased, 300);
    assert.equal(spent.chargedEarned, 100);
    const s = toSummary(spent.balances);
    assert.equal(s.purchasedBalance, 0);
    assert.equal(s.earnedAvailable, 400);
  });

  it('saldo negativo está bloqueado', () => {
    const start = normalizeBlastBalances({
      purchasedBlastBalance: 10,
      earnedBlastBalance: 5,
    });
    const spent = applySpend(start, 20, { allowEarned: true, strict: true });
    assert.equal(spent.ok, false);
    assert.equal(spent.code, 'INSUFFICIENT');
    assert.equal(spent.balances.purchasedBlastBalance, 10);
    assert.equal(spent.balances.earnedBlastBalance, 5);
  });

  it('refund devuelve a los buckets originales', () => {
    const start = normalizeBlastBalances({
      purchasedBlastBalance: 0,
      earnedBlastBalance: 400,
    });
    const refunded = applyRefund(start, { purchased: 300, earned: 100 });
    const s = toSummary(refunded.balances);
    assert.equal(s.purchasedBalance, 300);
    assert.equal(s.earnedAvailable, 500);
  });

  it('legado coinsBalance sin origen se clasifica como comprado', () => {
    const b = normalizeBlastBalances({ coinsBalance: 7000 });
    const s = toSummary(b);
    assert.equal(s.purchasedBalance, 7000);
    assert.equal(s.earnedAvailable, 0);
    assert.equal(s.withdrawableBalance, 0);
  });

  it('idempotencia: la misma clave no acredita dos veces', () => {
    const seen = new Map();
    function creditOnce(key, amount) {
      if (seen.has(key)) return { ...seen.get(key), duplicate: true };
      const balances = applyCreditPurchased(normalizeBlastBalances({}), amount);
      const result = { duplicate: false, summary: toSummary(balances) };
      seen.set(key, result);
      return result;
    }
    const a = creditOnce('wompi:abc', 5000);
    const b = creditOnce('wompi:abc', 5000);
    assert.equal(a.duplicate, false);
    assert.equal(b.duplicate, true);
    assert.equal(a.summary.purchasedBalance, 5000);
    assert.equal(b.summary.purchasedBalance, 5000);
  });
});
