const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const money = require('./moneyDecimal');

describe('moneyDecimal', () => {
  it('guarda 4 decimales sin Number', () => {
    assert.equal(money.toExactString(money.parseToUnits('15.12')), '15.1200');
    assert.equal(money.toExactString(money.parseToUnits('26.45')), '26.4500');
    assert.equal(money.toExactString(money.parseToUnits('103.72')), '103.7200');
    assert.equal(money.toExactString(money.fromIntegerPesos(1285)), '1285.0000');
  });

  it('multiplica BLAST × tasa con BigInt', () => {
    const units = money.multiplyIntegerByRate(25840, '15.0000');
    assert.equal(money.toExactString(units), '387600.0000');
    assert.equal(typeof units, 'bigint');
  });

  it('rechaza Number con decimales', () => {
    assert.throws(() => money.parseToUnits(15.12), /decimales/);
  });

  it('centavos Wompi a COP exacto', () => {
    assert.equal(money.toExactString(money.fromWompiCents(1_090_000)), '10900.0000');
  });
});
