/**
 * Interruptor de la caja de mensajes (página /mensajes + ítem Mensajes del menú + caja flotante).
 *
 * - Móvil y tablet en vertical: visible si MESSAGES_INBOX_ENABLED.
 * - Laptop, PC de escritorio y tablet en horizontal: solo si MESSAGES_INBOX_WIDE_ENABLED.
 *
 * false en WIDE = oculta en esos layouts; el código no se borra.
 * Para mostrar también en laptop/PC/tablet horizontal: «Habilitar caja de mensajes».
 */
import { VP_LG, VP_MD } from '../responsive/viewport';

export const MESSAGES_INBOX_ENABLED = true;

/**
 * Laptop / PC / tablet horizontal.
 * Orden del usuario para activar: «Habilitar caja de mensajes».
 */
export const MESSAGES_INBOX_WIDE_ENABLED = false;

/**
 * Pastillas flotantes de chat minimizado (foto + nombre) y caja abierta.
 * Misma regla de layout: ocultas en laptop/PC/tablet horizontal hasta «Habilitar caja de mensajes».
 */
export const MESSAGE_BOXES_ENABLED = true;

/** true = ocultar en el viewport actual por regla de laptop/PC/tablet landscape. */
export function isMessagesInboxHiddenByLayout(): boolean {
  if (MESSAGES_INBOX_WIDE_ENABLED) return false;
  if (typeof window === 'undefined') return false;
  const width = window.innerWidth;
  if (width >= VP_LG) return true;
  const landscape =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(orientation: landscape)').matches
      : width > window.innerHeight;
  return landscape && width >= VP_MD;
}

/** Página /mensajes + ítem de menú visibles ahora. */
export function isMessagesInboxVisibleNow(): boolean {
  if (!MESSAGES_INBOX_ENABLED) return false;
  return !isMessagesInboxHiddenByLayout();
}

/** Cajas/pastillas flotantes de chat visibles ahora. */
export function isMessageBoxesVisibleNow(): boolean {
  if (!MESSAGE_BOXES_ENABLED) return false;
  return !isMessagesInboxHiddenByLayout();
}

if (typeof document !== 'undefined') {
  document.documentElement.classList.toggle('lb-msg-boxes-off', !isMessageBoxesVisibleNow());
}
