const test = require('node:test');
const assert = require('node:assert/strict');
const {
  coinsForAppleProduct,
  assertAppleTransactionPayload,
  verifyAppleSignedTransaction,
} = require('./appleIap');

test('cada paquete BLAST usa el id guardado en App Store Connect', () => {
  assert.equal(coinsForAppleProduct('iveboom.app.blast.25'), 25);
  assert.equal(coinsForAppleProduct('iveboom.app.blast.25000'), 25000);
  assert.equal(coinsForAppleProduct('com.liveboom.app.blast.25'), 0);
  assert.equal(coinsForAppleProduct('iveboom.app.blast.1'), 0);
});

test('rechaza un comprobante de otra app, revertido o sin pago', () => {
  const base = {
    productId: 'iveboom.app.blast.200',
    bundleId: 'com.liveboom.app',
    transactionId: '1001',
    inAppOwnershipType: 'PURCHASED',
  };
  assert.equal(assertAppleTransactionPayload(base).coins, 200);
  assert.throws(() => assertAppleTransactionPayload({ ...base, bundleId: 'com.otra.app' }), /LiveBoom/);
  assert.throws(() => assertAppleTransactionPayload({ ...base, revocationDate: 1 }), /revirtió/);
  assert.throws(
    () => assertAppleTransactionPayload({ ...base, inAppOwnershipType: 'FAMILY_SHARED' }),
    /no está pagada/,
  );
  assert.throws(() => assertAppleTransactionPayload({ ...base, productId: 'iveboom.app.blast.1' }), /no reconocido/);
});

test('un texto cualquiera no pasa como compra de Apple', async () => {
  await assert.rejects(verifyAppleSignedTransaction('no-es-un-jwt'), /inválido/);
  await assert.rejects(verifyAppleSignedTransaction('a.b.c'), /inválido|Apple/);
});
