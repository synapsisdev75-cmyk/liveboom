/** Formatea montos COP exactos (string 4 decimales) sin calcular tasas. */
export function formatMoneyExact(amountExact: string | null | undefined, currency = 'COP') {
  const raw = String(amountExact || '').trim();
  const match = raw.match(/^(-?)(\d+)(?:\.(\d{1,4}))?$/);
  if (!match) return raw ? `$${raw} ${currency}` : `$0 ${currency}`;
  const sign = match[1] || '';
  const whole = Number(match[2] || '0');
  const frac = (match[3] || '0000').padEnd(4, '0').slice(0, 4);
  const wholeFmt = Number.isFinite(whole) ? whole.toLocaleString('es-CO') : match[2];
  return `${sign}$${wholeFmt},${frac} ${currency}`;
}

export function statusLabel(status: string | null | undefined) {
  const s = String(status || '').toUpperCase();
  if (s === 'PAID' || s === 'COMPLETED') return 'Retiro completado';
  if (s === 'REJECTED') return 'Rechazado';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'Cancelado';
  if (s === 'PROCESSING') return 'En proceso';
  return 'En proceso';
}
