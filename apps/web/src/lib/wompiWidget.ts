export type WompiOrder = {
  reference: string;
  publicKey: string;
  amountInCop: number;
  currency: string;
  integritySignature?: string | null;
  expirationTime?: string | null;
  checkoutUrl?: string | null;
  preferCheckout?: boolean;
  widgetAvailable?: boolean;
};

export function openWompiWidget(
  order: WompiOrder,
  onResult?: (result: WompiWidgetResult) => void,
) {
  if (typeof window.WidgetCheckout !== 'function') {
    throw new Error('El Widget de Wompi no está cargado. Recarga la página.');
  }

  const checkout = new window.WidgetCheckout({
    currency: order.currency || 'COP',
    amountInCents: order.amountInCop,
    reference: order.reference,
    publicKey: order.publicKey,
    redirectUrl: `${window.location.origin}/billetera`,
    ...(order.expirationTime ? { expirationTime: order.expirationTime } : {}),
    ...(order.integritySignature
      ? { signature: { integrity: order.integritySignature } }
      : {}),
  });

  checkout.open(onResult);
}
