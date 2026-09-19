/** Copy de recarga BLAST — misma redacción que el backend. */

export const BLAST_RECHARGE_SUCCESS_TITLE = '¡Recarga exitosa!';
export const BLAST_RECHARGE_SUCCESS_BODY = 'Tus BLAST ya están disponibles en tu billetera.';
export const BLAST_RECHARGE_PURCHASED_LABEL = 'BLAST comprados';
export const BLAST_RECHARGE_PENDING =
  'Estamos confirmando tu pago. Tus BLAST se agregarán automáticamente a tu billetera en cuanto el pago sea aprobado.';
export const BLAST_RECHARGE_DECLINED = 'El pago no fue aprobado. No se realizó ninguna recarga de BLAST.';

export function formatPurchasedBlast(coins: number) {
  const n = Math.max(0, Math.floor(Number(coins) || 0));
  return `+ ${n.toLocaleString('es-CO')}`;
}
