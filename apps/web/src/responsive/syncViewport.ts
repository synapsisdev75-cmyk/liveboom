import {
  classifyHeightBand,
  classifyOrientation,
  classifyWidthBand,
} from './viewport';

const KEYBOARD_PX = 80;

function isTextEntry(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    const type = (el.type || 'text').toLowerCase();
    if (['button', 'checkbox', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit', 'color'].includes(type)) {
      return false;
    }
    return !el.readOnly && !el.disabled;
  }
  return el.isContentEditable;
}

function readSize() {
  const root = document.documentElement;
  const android = root.classList.contains('lb-android-native');
  const vv = window.visualViewport;
  const width = Math.round(vv?.width ?? window.innerWidth);
  const innerH = Math.round(window.innerHeight);
  const vvH = Math.round(vv?.height ?? innerH);
  const offsetTop = Math.round(vv?.offsetTop ?? 0);
  const overlap = Math.max(0, innerH - vvH - offsetTop);
  const editing = isTextEntry(document.activeElement);
  // APK: adjustResize ya encoge el WebView. Si además usamos visualViewport,
  // queda una franja negra entre el compositor y el teclado.
  const height = android ? innerH : vvH;
  const keyboard = android ? (editing ? overlap : 0) : overlap;
  return { width, height, keyboard, editing, android };
}

function applyViewportVars() {
  const root = document.documentElement;
  const { width, height, keyboard, editing, android } = readSize();
  root.style.setProperty('--lb-vv-width', `${width}px`);
  root.style.setProperty('--lb-vv-height', `${height}px`);
  root.style.setProperty('--lb-keyboard-inset', `${keyboard}px`);
  root.dataset.lbWidth = classifyWidthBand(width);
  root.dataset.lbHeight = classifyHeightBand(height);
  root.dataset.lbOrient = classifyOrientation(width, height);
  const open = android ? editing && keyboard >= KEYBOARD_PX : keyboard >= KEYBOARD_PX;
  root.dataset.lbKeyboard = open ? 'open' : 'closed';
}

/**
 * Un solo listener de viewport para tokens CSS.
 * Fold, split screen, rotación y teclado actualizan vars sin recargar.
 */
export function installViewportSync() {
  if (typeof window === 'undefined') return () => undefined;
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      applyViewportVars();
    });
  };
  applyViewportVars();
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.addEventListener('focusin', schedule);
  window.addEventListener('focusout', schedule);
  const visual = window.visualViewport;
  visual?.addEventListener('resize', schedule);
  visual?.addEventListener('scroll', schedule);
  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    window.removeEventListener('focusin', schedule);
    window.removeEventListener('focusout', schedule);
    visual?.removeEventListener('resize', schedule);
    visual?.removeEventListener('scroll', schedule);
  };
}
