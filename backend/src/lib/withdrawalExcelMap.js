/**
 * Mapeo de retiros → filas Excel. Sin tasas internas ni recálculo COP.
 */

const EXCEL_STATUS = {
  REQUESTED: 'Pendiente',
  APPROVED: 'Aprobado',
  PROCESSING: 'En proceso',
  PAID: 'Pagado',
  REJECTED: 'Rechazado',
  CANCELLED: 'Anulado',
};

const PAYABLE_LABELS = new Set(['Pendiente', 'Aprobado', 'En proceso']);
const HEADER_ROW = 8;
const EXCEL_MAX_ROWS = 1_048_576;
const SHEET_OVERHEAD = 12;
const MAX_DATA_ROWS_PER_SHEET = EXCEL_MAX_ROWS - SHEET_OVERHEAD;

function excelStatusLabel(status) {
  const s = String(status || '').trim().toUpperCase();
  if (s === 'REQUESTED' || s === 'PENDING') return EXCEL_STATUS.REQUESTED;
  if (s === 'APPROVED' || s === 'APROBADO') return EXCEL_STATUS.APPROVED;
  if (s === 'PROCESSING' || s === 'IN_PROCESS' || s === 'EN PROCESO') {
    return EXCEL_STATUS.PROCESSING;
  }
  if (s === 'PAID' || s === 'COMPLETED' || s === 'COMPLETE') return EXCEL_STATUS.PAID;
  if (s === 'REJECTED') return EXCEL_STATUS.REJECTED;
  if (s === 'CANCELLED' || s === 'CANCELED' || s === 'ANULADO') return EXCEL_STATUS.CANCELLED;
  return 'Sin clasificar';
}

function formatBogota(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}:${pick('second')}`;
}

function excelText(value) {
  const raw = value == null ? '' : String(value);
  if (!raw) return '';
  if (/^[=+\-@\t\r]/.test(raw) || raw.includes('\n=')) return `'${raw}`;
  return raw;
}

function accountText(value) {
  if (value == null) return '';
  return excelText(String(value));
}

function moneyCopOf(row) {
  const n = Math.floor(Number(row?.moneyAmountCOP ?? row?.moneyAmountExact) || 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function blastOf(row) {
  return Math.max(0, Math.floor(Number(row?.earnedBlastAmount ?? row?.coins) || 0));
}

function tableRefForCount(count) {
  const rows = Math.max(1, Math.floor(Number(count) || 0));
  const last = HEADER_ROW + rows;
  if (last >= EXCEL_MAX_ROWS) {
    throw new Error('EXCEL_ROW_LIMIT');
  }
  return `A${HEADER_ROW}:M${last}`;
}

function needsSplit(count) {
  return Math.floor(Number(count) || 0) > MAX_DATA_ROWS_PER_SHEET;
}

function recordToExcelRow(row) {
  const snapshot = row?.snapshot && typeof row.snapshot === 'object' ? row.snapshot : {};
  const user = row?.user && typeof row.user === 'object' ? row.user : {};
  const payout = row?.payout && typeof row.payout === 'object' ? row.payout : {};
  const name = snapshot.displayName || user.displayName || payout.fullName || '';
  const email = snapshot.email || user.email || '';
  const flags = Array.isArray(row?.reviewFlags) ? row.reviewFlags : [];
  const notes = [];
  if (row?.observations) notes.push(String(row.observations));
  if (payout.fullName && name && payout.fullName !== name) {
    notes.push(`Titular: ${payout.fullName}`);
  }
  if (flags.includes('PROFILE_NOT_FROZEN')) {
    notes.push('Revisar: perfil no congelado al solicitar');
  }
  if (flags.includes('MISSING_EMAIL')) notes.push('Revisar: correo ausente');
  if (flags.includes('MISSING_NAME')) notes.push('Revisar: nombre ausente');
  const paid = excelStatusLabel(row?.status) === 'Pagado';
  return {
    id: excelText(row?.withdrawalId || row?.id || ''),
    requestedAt: formatBogota(row?.requestedAt || row?.createdAt),
    name: excelText(name),
    moneyCop: moneyCopOf(row),
    blast: blastOf(row),
    bank: excelText(payout.payoutMethod || ''),
    accountType: excelText(payout.accountType || ''),
    accountNumber: accountText(payout.accountNumber),
    email: excelText(email),
    status: excelStatusLabel(row?.status),
    paidAt: paid ? formatBogota(row?.paidAt || row?.processedAt) : '',
    disbursementReference: paid ? excelText(row?.disbursementReference || '') : '',
    observations: excelText(notes.filter(Boolean).join(' · ')),
  };
}

function summarizeRecords(rows) {
  const by = {
    Pendiente: { count: 0, cop: 0, blast: 0 },
    Aprobado: { count: 0, cop: 0, blast: 0 },
    'En proceso': { count: 0, cop: 0, blast: 0 },
    Pagado: { count: 0, cop: 0, blast: 0 },
    Rechazado: { count: 0, cop: 0, blast: 0 },
    Anulado: { count: 0, cop: 0, blast: 0 },
    'Sin clasificar': { count: 0, cop: 0, blast: 0 },
  };
  let totalCop = 0;
  let pagado = 0;
  let porPagar = 0;
  for (const raw of rows || []) {
    const mapped = recordToExcelRow(raw);
    const bucket = by[mapped.status] ? mapped.status : 'Sin clasificar';
    by[bucket].count += 1;
    by[bucket].cop += mapped.moneyCop;
    by[bucket].blast += mapped.blast;
    totalCop += mapped.moneyCop;
    if (mapped.status === 'Pagado') pagado += mapped.moneyCop;
    if (PAYABLE_LABELS.has(mapped.status)) porPagar += mapped.moneyCop;
  }
  return {
    count: (rows || []).length,
    totalCop,
    pagado,
    porPagar,
    by,
  };
}

function rowValues(mapped) {
  return [
    mapped.id,
    mapped.requestedAt,
    mapped.name,
    mapped.moneyCop,
    mapped.blast,
    mapped.bank,
    mapped.accountType,
    mapped.accountNumber,
    mapped.email,
    mapped.status,
    mapped.paidAt,
    mapped.disbursementReference,
    mapped.observations,
  ];
}

module.exports = {
  EXCEL_STATUS,
  PAYABLE_LABELS,
  HEADER_ROW,
  EXCEL_MAX_ROWS,
  MAX_DATA_ROWS_PER_SHEET,
  excelStatusLabel,
  formatBogota,
  excelText,
  accountText,
  tableRefForCount,
  needsSplit,
  recordToExcelRow,
  summarizeRecords,
  rowValues,
};
module.exports.default = module.exports;
