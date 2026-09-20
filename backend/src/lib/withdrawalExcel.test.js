const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  excelText,
  accountText,
  excelStatusLabel,
  tableRefForCount,
  recordToExcelRow,
  summarizeRecords,
  formatBogota,
} = require('./withdrawalExcelMap');
const {
  withdrawalFingerprint,
  stableWithdrawalId,
  normalizeClientKey,
} = require('./withdrawalIdentity');
const { fillWorkbook } = require('./withdrawalExcel');
const { hasLeakedRate } = require('./payoutConversion');

describe('withdrawal excel + idempotency', () => {
  it('protege inyección de fórmulas y conserva ceros / dígitos largos', () => {
    assert.equal(excelText('=2+2'), "'=2+2");
    assert.equal(excelText('+cmd'), "'+cmd");
    assert.equal(excelText('@SUM(1)'), "'@SUM(1)");
    assert.equal(accountText('00123456789012345'), '00123456789012345');
    assert.equal(accountText('00123456789012345').length, 17);
  });

  it('mapea estados sin equivalencias silenciosas', () => {
    assert.equal(excelStatusLabel('REQUESTED'), 'Pendiente');
    assert.equal(excelStatusLabel('APPROVED'), 'Aprobado');
    assert.equal(excelStatusLabel('PROCESSING'), 'En proceso');
    assert.equal(excelStatusLabel('PAID'), 'Pagado');
    assert.equal(excelStatusLabel('REJECTED'), 'Rechazado');
    assert.equal(excelStatusLabel('CANCELLED'), 'Anulado');
    assert.notEqual(excelStatusLabel('APPROVED'), 'Pagado');
  });

  it('la tabla crece por registros reales, no por tope de 500', () => {
    assert.equal(tableRefForCount(1), 'A8:R9');
    assert.equal(tableRefForCount(500), 'A8:R508');
    assert.equal(tableRefForCount(501), 'A8:R509');
    assert.equal(tableRefForCount(1001), 'A8:R1009');
    assert.equal(tableRefForCount(2001), 'A8:R2009');
    assert.equal(tableRefForCount(3001), 'A8:R3009');
  });

  it('usa snapshot histórico y COP congelado, sin tasa', () => {
    const mapped = recordToExcelRow({
      withdrawalId: 'wd_hist',
      earnedBlastAmount: 21000,
      moneyAmountCOP: 315000,
      status: 'REQUESTED',
      requestedAt: '2026-09-19T20:00:00.000Z',
      snapshot: { displayName: 'Ana', email: 'ana@test.com' },
      payout: { payoutMethod: 'Nequi', accountType: 'ahorros', accountNumber: '00123', fullName: 'Ana Titular' },
      blastRate: 15,
    });
    assert.equal(mapped.moneyCop, 315000);
    assert.equal(mapped.blast, 21000);
    assert.equal(mapped.name, 'Ana');
    assert.equal(mapped.accountNumber, '00123');
    assert.equal(mapped.status, 'Pendiente');
    assert.equal(hasLeakedRate(mapped), false);
    assert.equal(mapped.verificationId, '');
    assert.equal(mapped.identityVerifiedAtRequest, 'No');
  });

  it('conserva el titular legal del snapshot de verificación, no el apodo', () => {
    const mapped = recordToExcelRow({
      withdrawalId: 'wd_ver',
      earnedBlastAmount: 21000,
      moneyAmountCOP: 315000,
      status: 'REQUESTED',
      requestedAt: '2026-09-19T20:00:00.000Z',
      snapshot: {
        displayName: 'BoomStar',
        email: 'ana@test.com',
        verification: {
          caseId: 'wv_u1',
          legalName: 'Ana Pérez',
          identityVerified: true,
          accountVerified: true,
          identityVerifiedAtMs: Date.parse('2026-09-18T12:00:00.000Z'),
        },
      },
      payout: { payoutMethod: 'Nequi', fullName: 'Ana Pérez' },
    });
    assert.equal(mapped.name, 'BoomStar');
    assert.equal(mapped.verifiedHolder, 'Ana Pérez');
    assert.equal(mapped.verificationId, 'wv_u1');
    assert.equal(mapped.identityVerifiedAtRequest, 'Sí');
    assert.equal(mapped.accountVerifiedAtRequest, 'Sí');
  });

  it('por pagar no incluye rechazados ni anulados', () => {
    const sum = summarizeRecords([
      { status: 'REQUESTED', moneyAmountCOP: 100, earnedBlastAmount: 1 },
      { status: 'APPROVED', moneyAmountCOP: 200, earnedBlastAmount: 1 },
      { status: 'PAID', moneyAmountCOP: 300, earnedBlastAmount: 1 },
      { status: 'REJECTED', moneyAmountCOP: 400, earnedBlastAmount: 1 },
      { status: 'CANCELLED', moneyAmountCOP: 500, earnedBlastAmount: 1 },
    ]);
    assert.equal(sum.count, 5);
    assert.equal(sum.pagado, 300);
    assert.equal(sum.porPagar, 300);
    assert.equal(sum.totalCop, 1500);
  });

  it('totales vacíos sin registros ficticios', () => {
    const sum = summarizeRecords([]);
    assert.equal(sum.count, 0);
    assert.equal(sum.totalCop, 0);
    assert.equal(sum.porPagar, 0);
  });

  it('idempotencia estable por usuario+clave, conflicto si cambian datos', () => {
    const key = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    assert.equal(normalizeClientKey(key), key);
    const a = withdrawalFingerprint({
      userId: 'u1',
      coins: 21000,
      fullName: 'Ana',
      documentId: '123',
      payoutMethod: 'Nequi',
      accountNumber: '00123',
      accountType: 'ahorros',
    });
    const same = withdrawalFingerprint({
      userId: 'u1',
      coins: 21000,
      fullName: 'Ana',
      documentId: '123',
      payoutMethod: 'Nequi',
      accountNumber: '00123',
      accountType: 'ahorros',
    });
    const other = withdrawalFingerprint({
      userId: 'u1',
      coins: 22000,
      fullName: 'Ana',
      documentId: '123',
      payoutMethod: 'Nequi',
      accountNumber: '00123',
      accountType: 'ahorros',
    });
    assert.equal(a, same);
    assert.notEqual(a, other);
    assert.equal(stableWithdrawalId('u1', key), stableWithdrawalId('u1', key));
    assert.notEqual(stableWithdrawalId('u1', key), stableWithdrawalId('u2', key));
  });

  it('llena la plantilla con filas reales y recorta las 500 vacías', async () => {
    const built = await fillWorkbook(
      [
        {
          withdrawalId: 'wd_one',
          requestedAt: '2026-09-19T15:00:00.000Z',
          earnedBlastAmount: 21000,
          moneyAmountCOP: 315000,
          status: 'REQUESTED',
          snapshot: { displayName: 'Ana', email: 'ana@test.com' },
          payout: {
            payoutMethod: 'Nequi',
            accountType: 'ahorros',
            accountNumber: '00123456789012345',
          },
        },
        {
          withdrawalId: 'wd_two',
          requestedAt: '2026-09-19T16:00:00.000Z',
          earnedBlastAmount: 21000,
          moneyAmountCOP: 315000,
          status: 'PAID',
          paidAt: '2026-09-20T10:00:00.000Z',
          disbursementReference: 'TRX-99',
          snapshot: { displayName: 'Luis', email: 'luis@test.com' },
          payout: { payoutMethod: 'Bancolombia', accountType: 'corriente', accountNumber: '0001' },
        },
      ],
      { generatedAtLabel: '2026-09-19 20:00:00 America/Bogota' },
    );
    assert.equal(built.rowCount, 2);
    assert.equal(built.summary.count, 2);
    assert.ok(built.buffer.length > 1000);
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(built.buffer);
    const ws = wb.getWorksheet('Retiros');
    const table = ws.getTable('TablaRetiros');
    assert.equal(table.table.tableRef, 'A8:R10');
    assert.equal(ws.getCell('A9').value, 'wd_one');
    assert.equal(String(ws.getCell('H9').value), '00123456789012345');
    assert.equal(ws.getCell('J10').value, 'Pagado');
    assert.equal(ws.getCell('A11').value, null);
    const guia = wb.getWorksheet('Guía');
    assert.match(String(guia.getCell('A3').value || ''), /automático/i);
  });

  it('fecha de solicitud en horario de Colombia', () => {
    const text = formatBogota('2026-09-19T20:00:00.000Z');
    assert.match(text, /^2026-09-19 \d{2}:\d{2}:\d{2}$/);
  });
});
