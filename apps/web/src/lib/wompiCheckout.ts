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

/**
 * Abre el checkout de Wompi sin destruir la sesión Capacitor (https://localhost).
 * En web usa navegación completa (comportamiento histórico).
 */
export async function openWompiCheckoutUrl(checkoutUrl: string): Promise<'external' | 'navigated'> {
  const url = String(checkoutUrl || '').trim();
  if (!url) throw new Error('Falta la URL de checkout de Wompi');

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
