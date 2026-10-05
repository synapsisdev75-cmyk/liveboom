const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildWebCheckoutUrl, createWidgetIntegritySignature } = require('./wompi');

describe('Web Checkout firmado de Wompi', () => {
  it('arma la URL con monto, referencia, firma, retorno y vencimiento', () => {
    const expirationTime = '2026-10-05T22:00:00.000Z';
    const signature = createWidgetIntegritySignature('ad_ref_1', 160000, 'COP', 'secret', expirationTime);
    const url = new URL(
      buildWebCheckoutUrl({
        publicKey: ' pub_test_abc ',
        amountInCents: 160000,
        reference: 'ad_ref_1',
        integritySignature: signature,
        redirectUrl: 'https://liveboomapp.com/crear',
        expirationTime,
      }),
    );
    assert.equal(url.origin + url.pathname, 'https://checkout.wompi.co/p/');
    assert.equal(url.searchParams.get('public-key'), 'pub_test_abc');
    assert.equal(url.searchParams.get('currency'), 'COP');
    assert.equal(url.searchParams.get('amount-in-cents'), '160000');
    assert.equal(url.searchParams.get('reference'), 'ad_ref_1');
    assert.equal(url.searchParams.get('signature:integrity'), signature);
    assert.equal(url.searchParams.get('redirect-url'), 'https://liveboomapp.com/crear');
    assert.equal(url.searchParams.get('expiration-time'), expirationTime);
  });
});
