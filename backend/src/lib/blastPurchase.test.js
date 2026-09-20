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

  it('orden APPROVED sin CREDITED todavía acredita', () => {
    const d = evaluateWompiSettlement({
      order: { ...ORDER, status: 'APPROVED' },
      txn: txn(),
    });
    assert.equal(d.action, 'credit');
    assert.equal(d.blast, 200);
  });

  it('acepta monto en pesos si Wompi envía centavos', () => {
    const d = evaluateWompiSettlement({
      order: { ...ORDER, amountInCop: 10_900 },
      txn: txn({ amount_in_cents: 1_090_000 }),
    });
    assert.equal(d.action, 'credit');
    assert.equal(d.blast, 200);
  });

  it('paquete nuevo 25 BLAST a COP 1600 acredita 25', () => {
    const d = evaluateWompiSettlement({
      order: {
        ...ORDER,
        packageId: 'basico_25',
        coins: 25,
        blastAmount: 25,
        amountInCop: 160_000,
      },
      txn: txn({ amount_in_cents: 160_000 }),
    });
    assert.equal(d.action, 'credit');
    assert.equal(d.blast, 25);
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
        order: { ...ORDER, coins: 999999, blastAmount: 999999 },
        txn: txn(),
      }).blast,
      200,
    );
    assert.equal(
      evaluateWompiSettlement({
        order: { ...ORDER, packageId: 'no_existe', coins: 0, blastAmount: 0 },
        txn: txn(),
      }).code,
      'PACKAGE_TAMPERED',
    );
    assert.equal(
      evaluateWompiSettlement({
        order: { ...ORDER, packageId: 'no_existe' },
        txn: txn(),
      }).blast,
      200,
    );
    assert.equal(
      evaluateWompiSettlement({
        order: ORDER,
        txn: txn({ reference: 'OTRA-REF' }),
      }).code,
      'REFERENCE_MISMATCH',
    );
    const viaLink = evaluateWompiSettlement({
      order: { ...ORDER, paymentLinkId: 'link_abc' },
      txn: txn({
        reference: 'SAuDc6_1789862818_HpPOBub8L',
        payment_link_id: 'link_abc',
      }),
    });
    assert.equal(viaLink.action, 'credit');
    assert.equal(viaLink.blast, 200);
    const viaTxnId = evaluateWompiSettlement({
      order: { ...ORDER, wompiTransactionId: 'wompi-tx-1' },
      txn: txn({ reference: 'SAuDc6_otra' }),
    });
    assert.equal(viaTxnId.action, 'credit');
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
