/** Formatea montos COP enteros recibidos del backend. No calcula tasas. */
export function formatMoneyExact(
  amountExact: string | number | null | undefined,
  currency = 'COP',
) {
  const pesos = parseCopInteger(amountExact);
  const formatted = pesos.toLocaleString('es-CO');
  return `$${formatted} ${currency}`;
}

function parseCopInteger(value: string | number | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const match = raw.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return 0;
  return Math.max(0, Math.floor(Number(match[2] || '0') || 0));
}

export function statusLabel(status: string | null | undefined) {
  const s = String(status || '').toUpperCase();
  if (s === 'PAID' || s === 'COMPLETED') return 'Retiro completado';
  if (s === 'REJECTED') return 'Rechazado';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'Cancelado';
  if (s === 'PROCESSING') return 'En proceso';
  return 'En proceso';
}
