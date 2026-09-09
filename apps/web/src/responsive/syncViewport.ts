import {
  classifyHeightBand,
  classifyOrientation,
  classifyWidthBand,
} from './viewport';

const KEYBOARD_PX = 80;

function readSize() {
  const vv = window.visualViewport;
  const width = Math.round(vv?.width ?? window.innerWidth);
  const height = Math.round(vv?.height ?? window.innerHeight);
  const offsetTop = vv?.offsetTop ?? 0;
  const keyboard = Math.max(0, window.innerHeight - height - offsetTop);
  return { width, height, keyboard };
}

function applyViewportVars() {
  const root = document.documentElement;
  const { width, height, keyboard } = readSize();
  root.style.setProperty('--lb-vv-width', `${width}px`);
  root.style.setProperty('--lb-vv-height', `${height}px`);
  root.style.setProperty('--lb-keyboard-inset', `${keyboard}px`);
  root.dataset.lbWidth = classifyWidthBand(width);
  root.dataset.lbHeight = classifyHeightBand(height);
  root.dataset.lbOrient = classifyOrientation(width, height);
  root.dataset.lbKeyboard = keyboard >= KEYBOARD_PX ? 'open' : 'closed';
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
  const visual = window.visualViewport;
  visual?.addEventListener('resize', schedule);
  visual?.addEventListener('scroll', schedule);
  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    visual?.removeEventListener('resize', schedule);
    visual?.removeEventListener('scroll', schedule);
  };
}
