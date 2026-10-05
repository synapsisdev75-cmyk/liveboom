import { useCallStore } from '../store/callStore';

/**
 * Cadencia de publicidad patrocinada: cuenta solo tiempo de uso activo
 * (pestaña visible, con red y con interacción reciente), no reloj de pared.
 */

const KEY = 'lb.adCadence.v1';
const IDLE_AFTER_MS = 60_000;
const TICK_MS = 5_000;
const EMPTY_COOLDOWN_MS = 3 * 60_000;

type CadenceState = { activeMs: number; lastShownAtMs: number };

let intervalMs = 10 * 60_000;
let lastInteractionMs = 0;
let lastTickMs = 0;
let emptyUntilMs = 0;
let inflight = false;
let installed = 0;
let timer = 0;

function read(): CadenceState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<CadenceState>;
    return { activeMs: Number(raw.activeMs) || 0, lastShownAtMs: Number(raw.lastShownAtMs) || 0 };
  } catch {
    return { activeMs: 0, lastShownAtMs: 0 };
  }
}

function write(state: CadenceState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}

export const AD_DUE_EVENT = 'lb:ad-due';

export function setAdIntervalMinutes(minutes: number) {
  const m = Math.floor(Number(minutes));
  if (Number.isFinite(m) && m >= 1) intervalMs = m * 60_000;
}

function noteInteraction() {
  lastInteractionMs = Date.now();
}

function tick() {
  const now = Date.now();
  const delta = lastTickMs ? now - lastTickMs : 0;
  lastTickMs = now;
  if (document.visibilityState !== 'visible') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (now - lastInteractionMs > IDLE_AFTER_MS) return;
  const state = read();
  const wasDue = state.activeMs >= intervalMs;
  state.activeMs += Math.min(Math.max(delta, 0), TICK_MS + 1000);
  write(state);
  if (!wasDue && state.activeMs >= intervalMs) window.dispatchEvent(new Event(AD_DUE_EVENT));
}

const EVENTS: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];

/** Instala el contador una sola vez (llamadas anidadas comparten el mismo intervalo). */
export function startAdCadence(): () => void {
  installed += 1;
  if (installed === 1) {
    EVENTS.forEach((e) => window.addEventListener(e, noteInteraction, { passive: true, capture: true }));
    lastTickMs = Date.now();
    timer = window.setInterval(tick, TICK_MS);
  }
  return () => {
    installed -= 1;
    if (installed > 0) return;
    EVENTS.forEach((e) => window.removeEventListener(e, noteInteraction, { capture: true }));
    window.clearInterval(timer);
  };
}

export function isAdDue(): boolean {
  if (Date.now() < emptyUntilMs || inflight) return false;
  return read().activeMs >= intervalMs;
}

/** Reserva el turno para que dos espacios no pidan anuncio a la vez. */
export function claimAdTurn(): boolean {
  if (!isAdDue()) return false;
  inflight = true;
  return true;
}

export function releaseAdTurn(shown: boolean) {
  inflight = false;
  if (shown) {
    write({ activeMs: 0, lastShownAtMs: Date.now() });
  } else {
    emptyUntilMs = Date.now() + EMPTY_COOLDOWN_MS;
  }
}

const UNSAFE_PREFIXES = [
  '/stream',
  '/transmitir',
  '/billetera',
  '/wallet',
  '/mensajes',
  '/crear',
  '/super-admin',
  '/superadmin',
  '/legal',
  '/login',
  '/registro',
  '/recompensas',
  '/perfil/editar',
];

/** Nunca sobre LIVE, pagos, retiros, formularios, llamadas, escritura de mensajes ni pantalla completa. */
export function isUnsafeAdContext(pathname: string): boolean {
  if (UNSAFE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  if (useCallStore.getState().status !== 'idle') return true;
  if (typeof document === 'undefined') return true;
  if (document.fullscreenElement) return true;
  if (document.querySelector('body > .waybox-modal:not([hidden])')) return true;
  const active = document.activeElement as HTMLElement | null;
  if (active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return true;
  return false;
}
