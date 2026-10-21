import { isNativeIosApp } from './nativeLiveMedia';

const EDGE_PX = 36;
const LOCK_PX = 12;
const COMMIT_RATIO = 0.33;
const FLICK_PX_MS = 0.55;

function historyRecord(): Record<string, unknown> | null {
  const state = window.history.state;
  if (!state || typeof state !== 'object') return null;
  return state as Record<string, unknown>;
}

/** Hay una capa (chat, visor, hoja) o una pantalla anterior dentro de la app. */
function canDismiss() {
  const state = historyRecord();
  if (!state) return false;
  if (typeof state.lbLayer === 'number') return true;
  if (typeof state.idx === 'number') return state.idx > 0;
  return false;
}

function topOverlay(): HTMLElement | null {
  const overlays = document.querySelectorAll<HTMLElement>('[data-lb-edge-page="overlay"]');
  for (let i = overlays.length - 1; i >= 0; i -= 1) {
    const el = overlays[i];
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 80 && rect.height > 80) return el;
  }
  return null;
}

function routePage(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-lb-edge-page="route"]');
}

/** Hoja o modal encima del hilo: el desliz cierra eso y no mueve la pantalla de atrás. */
function blockingCover(overlay: HTMLElement | null) {
  const nodes = document.querySelectorAll<HTMLElement>(
    '.lb-msg-overlay, .lb-composer-overlay, [role="dialog"]',
  );
  const width = window.innerWidth;
  const height = window.innerHeight;
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const el = nodes[i];
    if (!el) continue;
    if (overlay && (el === overlay || overlay.contains(el))) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > width * 0.6 && rect.height > height * 0.45) return true;
  }
  return false;
}

/**
 * Gesto de iPhone: desde el borde izquierdo la pantalla de encima sigue el
 * dedo y, al soltar, cierra o vuelve. El WebView no usa el gesto nativo de
 * páginas, porque esta app es una sola página y ese gesto deja la vista en blanco.
 */
export function installIosEdgeBack() {
  if (typeof window === 'undefined' || !isNativeIosApp()) return () => undefined;

  const root = document.documentElement;
  let pointerId = -1;
  let tracking = false;
  let active = false;
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let velocity = 0;
  let lastX = 0;
  let lastT = 0;
  let sliding: HTMLElement | null = null;
  let unders: HTMLElement[] = [];

  function collectUnders() {
    if (!sliding) {
      unders = [];
      return;
    }
    const parent = sliding.parentElement;
    unders = Array.from(document.querySelectorAll<HTMLElement>('[data-lb-edge-under]')).filter(
      (el) => el.parentElement === parent && el !== sliding,
    );
  }

  function paint(px: number) {
    if (!sliding) return;
    const width = Math.max(window.innerWidth, 1);
    const x = Math.max(0, Math.min(px, width));
    const progress = Math.min(1, x / width);
    sliding.style.transition = 'none';
    sliding.style.transform = x > 0 ? `translate3d(${x}px,0,0)` : '';
    sliding.style.borderRadius = x > 10 ? '1.15rem 0 0 1.15rem' : '';
    sliding.style.boxShadow = x > 0 ? 'inset 14px 0 18px rgba(0,0,0,0.35)' : '';
    root.style.setProperty('--lb-edge-p', String(progress));
    unders.forEach((el) => {
      const shift = (1 - progress) * -36;
      el.style.transition = 'none';
      el.style.transform = `translate3d(${shift}px,0,0)`;
    });
  }

  function clearMotion(el: HTMLElement | null) {
    if (!el) return;
    el.style.transition = '';
    el.style.transform = '';
    el.style.borderRadius = '';
    el.style.boxShadow = '';
  }

  function clearUnders() {
    unders.forEach((el) => {
      el.style.transition = '';
      el.style.transform = '';
    });
    unders = [];
  }

  function finish(commit: boolean) {
    const el = sliding;
    const travel = dx;
    const speed = velocity;
    sliding = null;
    const width = Math.max(window.innerWidth, 1);
    const go = commit && canDismiss() && (travel >= width * COMMIT_RATIO || (speed >= FLICK_PX_MS && travel > 48));
    const ease = 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)';
    if (!go) {
      if (el) {
        el.style.transition = ease;
        el.style.transform = '';
        el.style.borderRadius = '';
        el.style.boxShadow = '';
      }
      unders.forEach((under) => {
        under.style.transition = ease;
        under.style.transform = '';
      });
      window.setTimeout(() => {
        clearMotion(el);
        clearUnders();
        root.style.removeProperty('--lb-edge-p');
      }, 340);
      return;
    }
    if (el) {
      el.style.transition = 'transform 0.26s cubic-bezier(0.32, 0.72, 0, 1)';
      el.style.transform = 'translate3d(100%,0,0)';
      unders.forEach((under) => {
        under.style.transition = 'transform 0.26s cubic-bezier(0.32, 0.72, 0, 1)';
        under.style.transform = '';
      });
      window.setTimeout(() => {
        window.history.back();
        clearMotion(el);
        clearUnders();
        root.style.removeProperty('--lb-edge-p');
      }, 240);
      return;
    }
    window.history.back();
    clearUnders();
    root.style.removeProperty('--lb-edge-p');
  }

  function reset() {
    tracking = false;
    active = false;
    pointerId = -1;
    dx = 0;
    velocity = 0;
    delete root.dataset.lbEdgeBack;
  }

  function onDown(event: PointerEvent) {
    if (!event.isPrimary || event.pointerType === 'mouse') return;
    if (event.clientX > EDGE_PX) return;
    const target = event.target;
    if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (!canDismiss() && !topOverlay()) return;
    pointerId = event.pointerId;
    tracking = true;
    active = false;
    startX = event.clientX;
    startY = event.clientY;
    dx = 0;
    velocity = 0;
    lastX = event.clientX;
    lastT = event.timeStamp;
  }

  function onMove(event: PointerEvent) {
    if (!tracking || event.pointerId !== pointerId) return;
    const now = event.timeStamp;
    const step = event.clientX - lastX;
    const dt = now - lastT;
    if (dt > 0 && dt < 80) velocity = step / dt;
    lastX = event.clientX;
    lastT = now;
    dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!active) {
      if (Math.abs(dy) > LOCK_PX && Math.abs(dy) > Math.abs(dx)) {
        reset();
        return;
      }
      if (dx < LOCK_PX || dx <= Math.abs(dy)) return;
      active = true;
      root.dataset.lbEdgeBack = '1';
      const overlay = topOverlay();
      const layerOpen = typeof historyRecord()?.lbLayer === 'number';
      if (blockingCover(overlay)) sliding = null;
      else if (overlay) sliding = overlay;
      else if (layerOpen) sliding = null;
      else sliding = routePage();
      collectUnders();
    }
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    paint(dx);
  }

  function onTouchMove(event: TouchEvent) {
    if (!active) return;
    if (event.cancelable) event.preventDefault();
  }

  function onUp(event: PointerEvent) {
    if (!tracking || event.pointerId !== pointerId) return;
    const claimed = active;
    const travel = dx;
    const speed = velocity;
    tracking = false;
    active = false;
    pointerId = -1;
    if (!claimed) {
      delete root.dataset.lbEdgeBack;
      return;
    }
    dx = travel;
    velocity = speed;
    finish(true);
    window.setTimeout(() => {
      delete root.dataset.lbEdgeBack;
    }, 0);
  }

  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, { capture: true, passive: false });
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onUp, true);
  window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });

  return () => {
    reset();
    clearMotion(sliding);
    sliding = null;
    clearUnders();
    root.style.removeProperty('--lb-edge-p');
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onUp, true);
    window.removeEventListener('touchmove', onTouchMove, true);
  };
}
