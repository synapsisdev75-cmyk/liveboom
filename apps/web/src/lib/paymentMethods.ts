/** Métodos de pago mostrados en Billetera / recarga (logos en /public/payments). */
export type PaymentMethodLogo = {
  id: string;
  label: string;
  src: string;
  /** Logo redondo/cuadrado: se muestra más alto para igualar peso visual. */
  round?: boolean;
};

export const ACCEPTED_PAYMENT_LOGOS: PaymentMethodLogo[] = [
  { id: 'nequi', label: 'Nequi', src: '/payments/nequi-clear.png' },
  { id: 'visa', label: 'Visa', src: '/payments/visa-clear.png' },
  { id: 'daviplata', label: 'Daviplata', src: '/payments/daviplata-clear.png' },
  { id: 'mastercard', label: 'Mastercard', src: '/payments/mastercard-clear.png' },
  { id: 'pse', label: 'PSE', src: '/payments/pse-clear.png', round: true },
];
