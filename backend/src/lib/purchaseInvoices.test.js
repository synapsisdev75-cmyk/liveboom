const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { invoiceNumber, mapBlastOrder, mapAdOrder } = require('./purchaseInvoices');

describe('facturas de compras', () => {
  it('factura una recarga de BLAST acreditada con el monto en pesos', () => {
    const row = mapBlastOrder({
      id: 'lb_ref_1',
      status: 'CREDITED',
      coins: 25,
      amountInCop: 160_000,
      packageId: 'basico_25',
      creditedAtMs: 1_700_000_000_000,
      wompiTransactionId: 'txn_1',
    });
    assert.equal(row.kind, 'blast');
    assert.equal(row.amountCop, 1_600);
    assert.equal(row.quantity, 25);
    assert.equal(row.paidAtMs, 1_700_000_000_000);
    assert.equal(row.invoiceNumber, invoiceNumber('lb_ref_1'));
    assert.match(row.invoiceNumber, /^LB-[0-9A-F]{10}$/);
  });

  it('no factura recargas pendientes, anuladas o sin monto', () => {
    assert.equal(mapBlastOrder({ id: 'a', status: 'PENDING', coins: 25, amountInCop: 160_000 }), null);
    assert.equal(mapBlastOrder({ id: 'b', status: 'VOIDED', coins: 25, amountInCop: 160_000 }), null);
    assert.equal(mapBlastOrder({ id: 'c', status: 'CREDITED', coins: 25, amountInCop: 0 }), null);
  });

  it('factura publicidad pagada con su duración y no la que sigue pendiente', () => {
    const row = mapAdOrder({
      reference: 'ad_ref_1',
      paymentStatus: 'paid',
      totalCop: 1_600,
      days: 0,
      hours: 2,
      format: 'static',
      regionLabel: 'Meta',
      title: 'En vivo',
      paidAtMs: 1_700_000_100_000,
    });
    assert.equal(row.kind, 'ads');
    assert.equal(row.description, 'Publicidad 2 horas');
    assert.equal(row.detail, 'estático · Meta · En vivo');
    assert.equal(row.amountCop, 1_600);
    assert.equal(mapAdOrder({ reference: 'ad_ref_2', paymentStatus: 'pending', totalCop: 1_600 }), null);
  });
});
