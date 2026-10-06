import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

type Insets = { top: number; bottom: number; left: number; right: number; ready?: boolean };

type SystemInsetsPlugin = {
  get: () => Promise<Insets>;
  setNavigationBarStyle: (options: { light: boolean; color?: string }) => Promise<void>;
  addListener: (event: 'change', cb: (insets: Insets) => void) => Promise<PluginListenerHandle>;
};

const SystemInsets = registerPlugin<SystemInsetsPlugin>('LiveBoomSystemInsets');

/** Alto de la barra de botones de Android cuando la APK no trae el plugin y el WebView no da env(). */
const FALLBACK_NAV_BAR_PX = 48;

function setBottomInset(px: number) {
  const value = Math.max(0, Math.round(px * 10) / 10);
  document.documentElement.style.setProperty('--lb-native-inset-bottom', `${value}px`);
}

function envBottomPx(): number {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px;
}

/** WebView a pantalla completa (dibujado detrás de la barra de navegación). */
function drawnBehindNavBar(): boolean {
  return window.innerHeight >= window.screen.height - 2;
}

function applyFallback() {
  if (document.documentElement.dataset.lbKeyboard === 'open') return;
  const fromEnv = envBottomPx();
  setBottomInset(fromEnv > 0 || !drawnBehindNavBar() ? 0 : FALLBACK_NAV_BAR_PX);
}

function cssColorToHex(value: string): string | undefined {
  const raw = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')}`;
  }
  const m = raw.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!m) return undefined;
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
}

function syncNavigationBarStyle() {
  const root = document.documentElement;
  const light = root.dataset.lbTheme === 'light';
  const styles = getComputedStyle(root);
  const color = cssColorToHex(styles.getPropertyValue(light ? '--lb-surface' : '--lb-bg-sidebar'));
  void SystemInsets.setNavigationBarStyle({ light, color }).catch(() => undefined);
}

/**
 * APK Android: la barra inferior de LiveBoom se apoya sobre la barra de botones/gestos del
 * sistema y la cubre con su color, usando el alto real que entrega el plugin nativo.
 */
export function installNativeSystemInsets() {
  if (typeof window === 'undefined' || Capacitor.getPlatform() !== 'android') return;

  let hasPlugin = false;
  const onInsets = (insets: Insets) => {
    if (!insets?.ready) return;
    hasPlugin = true;
    setBottomInset(Number(insets.bottom) || 0);
  };

  SystemInsets.get()
    .then((insets) => {
      onInsets(insets);
      void SystemInsets.addListener('change', onInsets).catch(() => undefined);
      syncNavigationBarStyle();
      new MutationObserver(syncNavigationBarStyle).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-lb-theme'],
      });
      if (!insets?.ready) window.setTimeout(() => !hasPlugin && applyFallback(), 1500);
    })
    .catch(() => {
      applyFallback();
      window.addEventListener('resize', applyFallback);
      window.addEventListener('orientationchange', () => window.setTimeout(applyFallback, 300));
    });
}
