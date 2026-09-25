import { getWompiRedirectUrl } from './wompiCheckout';

export type WompiOrder = {
  reference: string;
  publicKey: string;
  amountInCop: number;
  currency: string;
  coins?: number;
  integritySignature?: string | null;
  expirationTime?: string | null;
  checkoutUrl?: string | null;
  preferCheckout?: boolean;
  widgetAvailable?: boolean;
};

const WOMPI_WIDGET_SRC = 'https://checkout.wompi.co/widget.js';

function loadWompiWidget(): Promise<void> {
  if (typeof window.WidgetCheckout === 'function') return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>('script[data-lb-wompi="1"]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar Wompi')), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = WOMPI_WIDGET_SRC;
    script.async = true;
    script.dataset.lbWompi = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Wompi'));
    document.body.appendChild(script);
  });
}

export async function openWompiWidget(
  order: WompiOrder,
  onResult?: (result: WompiWidgetResult) => void,
) {
  await loadWompiWidget();
  if (typeof window.WidgetCheckout !== 'function') {
    throw new Error('El Widget de Wompi no está cargado. Recarga la página.');
  }

  const checkout = new window.WidgetCheckout({
    currency: order.currency || 'COP',
    amountInCents: order.amountInCop,
    reference: order.reference,
    publicKey: order.publicKey,
    // Siempre producción: en Capacitor origin es https://localhost y rompe el retorno.
    redirectUrl: getWompiRedirectUrl(),
    ...(order.expirationTime ? { expirationTime: order.expirationTime } : {}),
    ...(order.integritySignature
      ? { signature: { integrity: order.integritySignature } }
      : {}),
  });

  checkout.open(onResult);
}
