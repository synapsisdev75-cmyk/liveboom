const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateWompiSettlement,
  applyApprovedCredit,
  applyVoidCompensation,
} = require('./blastPurchase');
const { toSummary, normalizeBlastBalances } = require('./walletEngine');

const ORDER = {
  id: 'LB-BLAST-AAA',
  reference: 'LB-BLAST-AAA',
  wompiReference: 'LB-BLAST-AAA',
  uid: 'user-1',
  userId: 'user-1',
  packageId: 'popular_200',
  coins: 200,
  blastAmount: 200,
  amountInCop: 1_090_000,
  status: 'PENDING',
};

function txn(overrides) {
  return {
    id: 'wompi-tx-1',
    reference: 'LB-BLAST-AAA',
    status: 'APPROVED',
    amount_in_cents: 1_090_000,
    currency: 'COP',
    ...overrides,
  };
}

describe('blastPurchase Wompi', () => {
  it('PENDING no acredita', () => {
    const d = evaluateWompiSettlement({ order: ORDER, txn: txn({ status: 'PENDING' }) });
    assert.equal(d.action, 'pending');
  });

  it('APPROVED acredita purchased del catálogo', () => {
    const d = evaluateWompiSettlement({ order: ORDER, txn: txn() });
    assert.equal(d.action, 'credit');
    assert.equal(d.blast, 200);
    const next = applyApprovedCredit(normalizeBlastBalances({}), d.blast);
    const s = toSummary(next);
    assert.equal(s.purchasedBalance, 200);
    assert.equal(s.earnedAvailable, 0);
    assert.equal(s.withdrawableBalance, 0);
  });

  it('DECLINED / ERROR / VOIDED (sin crédito) no mueven saldo', () => {
    for (const status of ['DECLINED', 'ERROR', 'VOIDED']) {
      const d = evaluateWompiSettlement({ order: ORDER, txn: txn({ status }) });
      assert.equal(d.action, 'mark', status);
      const s = toSummary(normalizeBlastBalances({}));
      assert.equal(s.purchasedBalance, 0);
    }
  });

  it('APPROVED x2 y x10 = un solo crédito (idempotente)', () => {
    const credited = { ...ORDER, status: 'CREDITED' };
    const first = evaluateWompiSettlement({ order: ORDER, txn: txn() });
    assert.equal(first.action, 'credit');
    for (let i = 0; i < 10; i += 1) {
      const again = evaluateWompiSettlement({
        order: credited,
        txn: txn({ id: 'wompi-tx-1' }),
      });
      assert.equal(again.action, 'duplicate');
    }
  });

  it('monto / paquete / referencia / evento inválido se bloquean', () => {
    assert.equal(
      evaluateWompiSettlement({
        order: ORDER,
        txn: txn({ amount_in_cents: 1 }),
      }).code,
      'AMOUNT_MISMATCH',
    );
    assert.equal(
      evaluateWompiSettlement({
        order: { ...ORDER, packageId: 'no_existe', coins: 999999 },
        txn: txn(),
      }).code,
      'PACKAGE_TAMPERED',
    );
    assert.equal(
      evaluateWompiSettlement({
        order: ORDER,
        txn: txn({ reference: 'OTRA-REF' }),
      }).code,
      'REFERENCE_MISMATCH',
    );
    assert.equal(
      evaluateWompiSettlement({ order: ORDER, txn: null }).code,
      'INVALID_EVENT',
    );
    assert.equal(
      evaluateWompiSettlement({
        order: ORDER,
        txn: txn({ currency: 'USD' }),
      }).code,
      'CURRENCY_MISMATCH',
    );
  });

  it('VOIDED después de acreditar genera compensación en purchased', () => {
    const credited = applyApprovedCredit(normalizeBlastBalances({}), 200);
    const voided = applyVoidCompensation(credited, 200);
    assert.equal(voided.ok, true);
    const s = toSummary(voided.balances);
    assert.equal(s.purchasedBalance, 0);
    assert.equal(s.earnedAvailable, 0);
  });
});
