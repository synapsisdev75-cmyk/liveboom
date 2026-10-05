import { Capacitor } from '@capacitor/core';

/** Retorno oficial Wompi (mismo origen web / Custom Tabs). Nunca localhost del WebView. */
export const WOMPI_WALLET_RETURN_URL = 'https://liveboomapp.com/billetera';

export function getWompiRedirectUrl(): string {
  return WOMPI_WALLET_RETURN_URL;
}

export function isNativeApp(): boolean {
  try {
    return typeof window !== 'undefined' && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export const WOMPI_INVALID_KEY_MESSAGE =
  'Los pagos con Wompi no están disponibles en este momento: Wompi no reconoce la llave del comercio. Intenta más tarde.';

/**
 * Wompi responde 404/422 cuando la llave pública no existe; su checkout solo muestra
 * "No se pudo cargar la información del undefined". Fallos de red no bloquean el pago.
 */
export async function assertWompiMerchantKey(publicKey: string | null | undefined): Promise<void> {
  const key = String(publicKey || '').trim();
  if (!key) return;
  const host = key.startsWith('pub_test_') ? 'sandbox.wompi.co' : 'production.wompi.co';
  let status = 0;
  try {
    const res = await fetch(`https://${host}/v1/merchants/${encodeURIComponent(key)}`);
    status = res.status;
  } catch {
    return;
  }
  if (status === 404 || status === 422) throw new Error(WOMPI_INVALID_KEY_MESSAGE);
}

function publicKeyFromCheckoutUrl(url: string): string {
  try {
    return new URL(url).searchParams.get('public-key') || '';
  } catch {
    return '';
  }
}

/**
 * Abre el checkout de Wompi sin destruir la sesión Capacitor (https://localhost).
 * En web usa navegación completa (comportamiento histórico).
 */
export async function openWompiCheckoutUrl(checkoutUrl: string): Promise<'external' | 'navigated'> {
  const url = String(checkoutUrl || '').trim();
  if (!url) throw new Error('Falta la URL de checkout de Wompi');
  await assertWompiMerchantKey(publicKeyFromCheckoutUrl(url));

  if (isNativeApp()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({
      url,
      presentationStyle: 'popover',
      toolbarColor: '#0a0a0b',
    });
    return 'external';
  }

  window.location.href = url;
  return 'navigated';
}
