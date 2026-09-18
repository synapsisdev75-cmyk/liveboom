const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeBlastBalances,
  applyCreditPurchased,
  applyCreditEarned,
  applySpend,
  applyWithdrawEarned,
  applyRestoreEarned,
} = require('./blastBalances');

test('recargas van a comprados y no se pueden retirar', () => {
  const afterTopup = applyCreditPurchased(normalizeBlastBalances({}), 200);
  assert.equal(afterTopup.purchasedBlastBalance, 200);
  assert.equal(afterTopup.earnedBlastBalance, 0);
  const withdraw = applyWithdrawEarned(afterTopup, 50);
  assert.equal(withdraw.ok, false);
  assert.equal(withdraw.available, 0);
});

test('regalos y llamadas acreditan ganados y sí se retiran', () => {
  let bal = normalizeBlastBalances({});
  bal = applyCreditPurchased(bal, 80);
  bal = applyCreditEarned(bal, 120);
  assert.equal(bal.purchasedBlastBalance, 80);
  assert.equal(bal.earnedBlastBalance, 120);
  const withdraw = applyWithdrawEarned(bal, 100);
  assert.equal(withdraw.ok, true);
  assert.equal(withdraw.balances.earnedBlastBalance, 20);
  assert.equal(withdraw.balances.purchasedBlastBalance, 80);
  assert.equal(withdraw.balances.earnedBlastWithdrawn, 100);
  assert.equal(withdraw.balances.coinsBalance, 100);
});

test('no se puede retirar más de lo ganado', () => {
  const bal = applyCreditEarned(normalizeBlastBalances({}), 40);
  const withdraw = applyWithdrawEarned(bal, 50);
  assert.equal(withdraw.ok, false);
  assert.equal(withdraw.available, 40);
});

test('enviar regalos gasta comprados primero y no mezcla el retiro', () => {
  let bal = normalizeBlastBalances({});
  bal = applyCreditPurchased(bal, 30);
  bal = applyCreditEarned(bal, 70);
  const spent = applySpend(bal, 40, true);
  assert.equal(spent.ok, true);
  assert.equal(spent.chargedPurchased, 30);
  assert.equal(spent.chargedEarned, 10);
  const withdraw = applyWithdrawEarned(spent.balances, 60);
  assert.equal(withdraw.ok, true);
  assert.equal(withdraw.balances.purchasedBlastBalance, 0);
  assert.equal(withdraw.balances.earnedBlastBalance, 0);
});

test('rechazar un retiro restaura solo ganados', () => {
  let bal = applyCreditEarned(normalizeBlastBalances({}), 90);
  const withdrawn = applyWithdrawEarned(bal, 50);
  assert.equal(withdrawn.ok, true);
  const restored = applyRestoreEarned(withdrawn.balances, 50);
  assert.equal(restored.earnedBlastBalance, 90);
  assert.equal(restored.earnedBlastWithdrawn, 0);
});
