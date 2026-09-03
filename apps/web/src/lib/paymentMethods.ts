/** Métodos de pago mostrados en Billetera / recarga (logos en /public/payments). */
export type PaymentMethodLogo = {
  id: string;
  label: string;
  src: string;
};

/** Bancolombia se reemplazó por PayPal + Mastercard. */
export const ACCEPTED_PAYMENT_LOGOS: PaymentMethodLogo[] = [
  { id: 'nequi', label: 'Nequi', src: '/payments/nequi.png' },
  { id: 'visa', label: 'Visa', src: '/payments/visa.png' },
  { id: 'daviplata', label: 'Daviplata', src: '/payments/daviplata.png' },
  { id: 'paypal', label: 'PayPal', src: '/payments/paypal.svg' },
  { id: 'mastercard', label: 'Mastercard', src: '/payments/mastercard.png' },
];
