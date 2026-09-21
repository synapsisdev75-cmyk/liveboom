const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeMeta, SECRET_KEY } = require('./adminAudit');

describe('adminAudit', () => {
  it('omite secretos y recorta meta', () => {
    const clean = sanitizeMeta({
      status: 'PAID',
      password: 'secret',
      token: 'abc',
      accountNumber: '001234',
      nested: { pin: '1234', ok: true },
      long: 'x'.repeat(800),
    });
    assert.equal(clean.status, 'PAID');
    assert.equal(clean.password, undefined);
    assert.equal(clean.token, undefined);
    assert.equal(clean.accountNumber, undefined);
    assert.equal(clean.nested.pin, undefined);
    assert.equal(clean.nested.ok, true);
    assert.equal(clean.long.length, 500);
  });

  it('detecta claves sensibles', () => {
    assert.equal(SECRET_KEY.test('idToken'), true);
    assert.equal(SECRET_KEY.test('status'), false);
  });
});
