const test = require('node:test');
const assert = require('node:assert/strict');
const { checkEmailDeliverable } = require('./emailDeliverability');

test('rechaza formato inválido', async () => {
  for (const email of ['', 'sin-arroba', 'a@b', 'a..b@gmail.com', '.a@gmail.com', 'a@-x.com']) {
    const r = await checkEmailDeliverable(email);
    assert.equal(r.ok, false, email);
    assert.equal(r.reason, 'invalid_format', email);
  }
});

test('sugiere el dominio correcto en errores de tipeo', async () => {
  const r = await checkEmailDeliverable('Ana@Gmial.com');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'typo');
  assert.equal(r.suggestion, 'ana@gmail.com');
});

test('rechaza correos desechables y de prueba', async () => {
  for (const email of ['x@mailinator.com', 'x@yopmail.com', 'x@example.com', 'x@algo.local']) {
    const r = await checkEmailDeliverable(email);
    assert.equal(r.ok, false, email);
    assert.equal(r.reason, 'disposable', email);
  }
});
