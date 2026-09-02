const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createWidgetIntegritySignature,
  buildPaymentReference,
  parsePackageIdFromReference,
  cleanWompiSecret,
} = require('./wompi');
const { COIN_PACKAGES } = require('./coinPackages');

test('firma de integridad coincide con el ejemplo oficial de Wompi', () => {
  const hash = createWidgetIntegritySignature(
    'sk8-438k4-xmxm392-sn2m',
    2490000,
    'COP',
    'prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6',
  );
  assert.equal(hash, '37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5');
});

test('limpia comillas y espacios de secretos pegados en Vercel', () => {
  assert.equal(cleanWompiSecret('  "pub_test_abc"  '), 'pub_test_abc');
});

test('la referencia incluye el paquete y se puede parsear', () => {
  const reference = buildPaymentReference('popular_200', 'abc123xyzUID');
  assert.match(reference, /^lb_popular_200__[a-zA-Z0-9]+_[a-f0-9]+$/);
  assert.equal(
    parsePackageIdFromReference(reference, Object.keys(COIN_PACKAGES)),
    'popular_200',
  );
});

test('parsea paquetes con guion bajo aunque no coincida el uid', () => {
  const reference = 'lb_gold_plus_1500__deadbeef_0123456789abcdef0123456789abcdef';
  assert.equal(
    parsePackageIdFromReference(reference, Object.keys(COIN_PACKAGES)),
    'gold_plus_1500',
  );
});

test('amountInCop de paquetes es entero en centavos Wompi', () => {
  for (const [id, pack] of Object.entries(COIN_PACKAGES)) {
    assert.ok(Number.isInteger(pack.amountInCop), id);
    assert.ok(pack.amountInCop >= 150000, `${id} por debajo del mínimo Wompi`);
  }
});
