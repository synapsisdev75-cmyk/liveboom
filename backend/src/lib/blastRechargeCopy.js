/** Copy de recarga BLAST — una sola fuente para API y UI. */

const SUCCESS = '¡Recarga exitosa! Tus BLAST ya están disponibles en tu billetera.';
const PENDING =
  'Estamos confirmando tu pago. Tus BLAST se agregarán automáticamente a tu billetera en cuanto el pago sea aprobado.';
const DECLINED = 'El pago no fue aprobado. No se realizó ninguna recarga de BLAST.';

module.exports = { SUCCESS, PENDING, DECLINED };
module.exports.default = module.exports;
