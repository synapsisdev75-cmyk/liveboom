const path = require('path');
const ExcelJS = require('exceljs');
const {
  HEADER_ROW,
  MAX_DATA_ROWS_PER_SHEET,
  tableRefForCount,
  recordToExcelRow,
  summarizeRecords,
  rowValues,
} = require('./withdrawalExcelMap');

const TEMPLATE_PATH = path.join(__dirname, '../../assets/LiveBoom-Control-Retiros.xlsx');

const GUIDE_A3 =
  'Reporte automático de LiveBoom | Se actualiza desde las solicitudes confirmadas | No autoriza pagos ni transferencias';
const GUIDE_A5 =
  'Cada solicitud confirmada por el backend genera o actualiza una fila por ID. No agregues filas a mano. El archivo descargado es una copia con fecha de corte; no se sincroniza en vivo.';
const GUIDE_GROW =
  'La tabla TablaRetiros crece con los registros reales. No hay tope de 500 filas. Los resúmenes cubren todo el corte. Si el volumen supera el límite de Excel, LiveBoom parte el reporte en hojas o archivos identificados.';

function applyRow(ws, excelRow, mapped) {
  const values = rowValues(mapped);
  values.forEach((value, col) => {
    const cell = ws.getRow(excelRow).getCell(col + 1);
    if (col === 3) {
      cell.value = value;
      cell.numFmt = '"$"#,##0';
    } else if (col === 4) {
      cell.value = value;
      cell.numFmt = '#,##0';
    } else if (col === 7) {
      cell.value = String(value ?? '');
      cell.numFmt = '@';
    } else {
      cell.value = value;
    }
  });
  ws.getRow(excelRow).commit();
}

function clearRow(ws, excelRow) {
  const row = ws.getRow(excelRow);
  for (let col = 1; col <= 13; col += 1) {
    row.getCell(col).value = null;
  }
  row.commit();
}

function resizeTable(ws, count) {
  const table = ws.getTable('TablaRetiros');
  const ref = tableRefForCount(count);
  if (table?.table) {
    table.table.tableRef = ref;
    table.table.autoFilterRef = ref;
    table.commit();
  }
}

function writeGuide(wb, { generatedAtLabel, rowCount }) {
  const guia = wb.getWorksheet('Guía');
  if (!guia) return;
  guia.getCell('A3').value = GUIDE_A3;
  guia.getCell('A5').value = GUIDE_A5;
  const growCell = ['A14', 'A15', 'A16', 'A17', 'A18'].find((addr) => {
    const text = String(guia.getCell(addr).value || '');
    return /500 filas|AMPLIAR EL REGISTRO/i.test(text);
  });
  if (growCell) guia.getCell(growCell).value = GUIDE_GROW;
  else guia.getCell('A18').value = GUIDE_GROW;
  guia.getCell('A20').value =
    `Corte del archivo: ${generatedAtLabel} · ${rowCount} solicitudes reales. Copia de descarga, sin sincronización permanente.`;
}

async function fillWorkbook(records, { generatedAtLabel } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);
  const ws = wb.getWorksheet('Retiros');
  if (!ws) throw new Error('Falta la hoja Retiros en la plantilla');

  const sorted = [...(records || [])].sort((a, b) => {
    const ta = Date.parse(a.requestedAt || a.createdAt || 0) || 0;
    const tb = Date.parse(b.requestedAt || b.createdAt || 0) || 0;
    return ta - tb;
  });

  const chunks = [];
  for (let i = 0; i < sorted.length; i += MAX_DATA_ROWS_PER_SHEET) {
    chunks.push(sorted.slice(i, i + MAX_DATA_ROWS_PER_SHEET));
  }
  if (!chunks.length) chunks.push([]);

  const first = chunks[0];
  const dataCount = Math.max(first.length, 1);
  const previousLast = 508;
  const lastDataRow = HEADER_ROW + dataCount;

  first.forEach((row, index) => {
    applyRow(ws, HEADER_ROW + 1 + index, recordToExcelRow(row));
  });
  if (!first.length) {
    clearRow(ws, HEADER_ROW + 1);
  }
  const clearUntil = Math.max(previousLast, lastDataRow);
  for (let r = lastDataRow + 1; r <= clearUntil; r += 1) {
    clearRow(ws, r);
  }
  resizeTable(ws, dataCount);

  const subtitle = ws.getCell('A2');
  subtitle.value = `USO INTERNO DEL SUPERADMINISTRADOR | Solo BLAST ganados | Corte ${generatedAtLabel || ''} | Copia de descarga, no sincroniza en vivo`;

  writeGuide(wb, {
    generatedAtLabel: generatedAtLabel || '',
    rowCount: sorted.length,
  });

  for (let i = 1; i < chunks.length; i += 1) {
    const name = `Retiros_${i + 1}`;
    const extra = wb.addWorksheet(name);
    extra.getRow(1).values = [
      'ID solicitud',
      'Fecha solicitud',
      'Nombre del usuario',
      'Retiro (COP)',
      'BLAST ganados a retirar',
      'Banco',
      'Tipo de cuenta',
      'Número de cuenta bancaria',
      'Correo electrónico',
      'Estado',
      'Fecha de pago',
      'Referencia de pago',
      'Observaciones',
    ];
    chunks[i].forEach((row, index) => {
      extra.getRow(2 + index).values = rowValues(recordToExcelRow(row));
      extra.getRow(2 + index).getCell(8).numFmt = '@';
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buffer),
    summary: summarizeRecords(sorted),
    sheetCount: chunks.length,
    rowCount: sorted.length,
  };
}

module.exports = {
  TEMPLATE_PATH,
  fillWorkbook,
};
module.exports.default = module.exports;
