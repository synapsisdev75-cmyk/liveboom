/**
 * Dinero exacto con 4 decimales (DECIMAL(18,4) equivalente).
 * Toda la aritmética usa BigInt. Nunca Number/float para COP.
 */

const SCALE = 4;
const UNIT = 10n ** BigInt(SCALE);

function fail(message) {
  const error = new Error(message);
  error.code = 'MONEY_INVALID';
  throw error;
}

function asBigInt(value, label = 'value') {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
      fail(`${label} no es un entero seguro`);
    }
    return BigInt(value);
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  fail(`${label} inválido`);
}

/**
 * Parsea "387.6230" / "3876230" / 387 (enteros = pesos exactos) a unidades 1e-4.
 */
function parseToUnits(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
      fail('no se aceptan Number con decimales');
    }
    return BigInt(value) * UNIT;
  }
  const raw = String(value ?? '').trim();
  if (!raw) return 0n;
  if (!/^-?\d+(\.\d+)?$/.test(raw)) fail('formato monetario inválido');
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, frac = ''] = unsigned.split('.');
  if (frac.length > SCALE) fail('más de 4 decimales');
  const fracPadded = (frac + '0000').slice(0, SCALE);
  const units = BigInt(whole || '0') * UNIT + BigInt(fracPadded || '0');
  return negative ? -units : units;
}

function fromIntegerPesos(pesos) {
  return asBigInt(pesos, 'pesos') * UNIT;
}

/** Centavos Wompi (1 peso = 100 centavos) → unidades 1e-4. */
function fromWompiCents(cents) {
  return asBigInt(cents, 'cents') * 100n;
}

function multiplyIntegerByRate(integerAmount, rateExact) {
  const qty = asBigInt(integerAmount, 'amount');
  const rateUnits = parseToUnits(rateExact);
  return qty * rateUnits;
}

function addUnits(a, b) {
  return parseToUnits(a) + parseToUnits(b);
}

function toExactString(unitsOrValue) {
  const units = typeof unitsOrValue === 'bigint' ? unitsOrValue : parseToUnits(unitsOrValue);
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / UNIT;
  const frac = abs % UNIT;
  const fracStr = frac.toString().padStart(SCALE, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fracStr}`;
}

function toJSON(unitsOrValue) {
  return toExactString(unitsOrValue);
}

function compare(a, b) {
  const left = typeof a === 'bigint' ? a : parseToUnits(a);
  const right = typeof b === 'bigint' ? b : parseToUnits(b);
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function isZero(value) {
  const units = typeof value === 'bigint' ? value : parseToUnits(value);
  return units === 0n;
}

module.exports = {
  SCALE,
  UNIT,
  parseToUnits,
  fromIntegerPesos,
  fromWompiCents,
  multiplyIntegerByRate,
  addUnits,
  toExactString,
  toJSON,
  compare,
  isZero,
};
module.exports.default = module.exports;
