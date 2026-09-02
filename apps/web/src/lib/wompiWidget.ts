export type WompiOrder = {
  reference: string;
  publicKey: string;
  amountInCop: number;
  amountInCents?: number;
  currency: string;
  integritySignature?: string | null;
  customerEmail?: string;
  customerName?: string;
};

const WIDGET_SRC = 'https://checkout.wompi.co/widget.js';

export function loadWompiWidget(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('El Widget de Wompi solo funciona en el navegador.'));
  }
  if (typeof window.WidgetCheckout === 'function') {
    return Promise.resolve();
  }
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${WIDGET_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (typeof window.WidgetCheckout === 'function') {
          window.clearInterval(timer);
          resolve();
        } else if (Date.now() - started > 12_000) {
          window.clearInterval(timer);
          reject(new Error('El Widget de Wompi no está cargado. Recarga la página.'));
        }
      }, 50);
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = WIDGET_SRC;
    script.async = true;
    script.onload = () => {
      if (typeof window.WidgetCheckout === 'function') resolve();
      else reject(new Error('El Widget de Wompi no está cargado. Recarga la página.'));
    };
    script.onerror = () =>
      reject(new Error('No se pudo cargar Wompi. Revisa tu conexión o desactiva el bloqueador.'));
    document.body.appendChild(script);
  });
}

export async function openWompiWidget(
  order: WompiOrder,
  onResult?: (result: WompiWidgetResult) => void,
): Promise<WompiWidgetResult | undefined> {
  await loadWompiWidget();
  if (typeof window.WidgetCheckout !== 'function') {
    throw new Error('El Widget de Wompi no está cargado. Recarga la página.');
  }
  if (!order.integritySignature) {
    throw new Error('Falta la firma de Wompi. Intenta de nuevo en un momento.');
  }

  const amountInCents = Number(order.amountInCents || order.amountInCop);
  const checkout = new window.WidgetCheckout({
    currency: order.currency || 'COP',
    amountInCents,
    reference: order.reference,
    publicKey: order.publicKey,
    redirectUrl: `${window.location.origin}/billetera?lb_ref=${encodeURIComponent(order.reference)}`,
    signature: { integrity: order.integritySignature },
    ...(order.customerEmail
      ? {
          customerData: {
            email: order.customerEmail,
            ...(order.customerName ? { fullName: order.customerName } : {}),
          },
        }
      : {}),
  });

  return new Promise((resolve) => {
    checkout.open((result) => {
      onResult?.(result);
      resolve(result);
    });
  });
}
