import { useEffect, useRef } from 'react';

/**
 * Atrás de a un paso para capas (visores, modales, hojas, chat abierto).
 * Cada capa abierta añade una entrada al historial con la misma URL; el gesto / botón Atrás
 * (Android, navegador) cierra solo la capa de arriba en vez de salir de la sección.
 */

type Layer = { seq: number; onBack: () => void };

const stack: Layer[] = [];
let nextSeq = 1;
let ignorePops = 0;
let installed = false;

function layerSeq(state: unknown): number | null {
  if (!state || typeof state !== 'object') return null;
  const value = (state as { lbLayer?: unknown }).lbLayer;
  return typeof value === 'number' ? value : null;
}

function isStale(seq: number | null) {
  return seq !== null && !stack.some((layer) => layer.seq === seq);
}

function skipBack() {
  ignorePops++;
  window.history.back();
}

function onPopState(event: PopStateEvent) {
  const target = layerSeq(event.state);
  if (ignorePops > 0) {
    ignorePops--;
    if (isStale(target)) skipBack();
    return;
  }
  const floor = target ?? 0;
  const toClose = stack.filter((layer) => layer.seq > floor);
  for (let i = stack.length - 1; i >= 0; i--) {
    if ((stack[i]?.seq ?? 0) > floor) stack.splice(i, 1);
  }
  toClose.reverse().forEach((layer) => layer.onBack());
  if (isStale(target)) skipBack();
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('popstate', onPopState);
}

function openLayer(onBack: () => void): number {
  install();
  const seq = nextSeq++;
  const base = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
  window.history.pushState({ ...base, lbLayer: seq }, '');
  stack.push({ seq, onBack });
  return seq;
}

function releaseLayer(seq: number) {
  const index = stack.findIndex((layer) => layer.seq === seq);
  if (index < 0) return;
  stack.splice(index, 1);
  window.setTimeout(() => {
    if (layerSeq(window.history.state) === seq) skipBack();
  }, 0);
}

/** Mientras `active` sea true, Atrás llama `onBack` (debe cerrar la capa) y consume un solo paso. */
export function useBackLayer(active: boolean, onBack: (() => void) | undefined) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const enabled = active && Boolean(onBack);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    let alive = true;
    let seq = 0;
    const arm = () => {
      seq = openLayer(() => {
        onBackRef.current?.();
        // Si la capa sigue abierta (p. ej. pidió confirmar descartar), vuelve a reservar su paso.
        window.setTimeout(() => {
          if (alive) arm();
        }, 0);
      });
    };
    arm();
    return () => {
      alive = false;
      releaseLayer(seq);
    };
  }, [enabled]);
}
