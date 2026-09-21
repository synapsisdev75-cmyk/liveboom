/**
 * Interruptor de la caja de mensajes (página /mensajes + ítem Mensajes del menú).
 *
 * - Móvil y tablet en vertical: visible si MESSAGES_INBOX_ENABLED.
 * - Laptop, PC y tablet horizontal: solo si MESSAGES_INBOX_WIDE_ENABLED.
 *
 * Las ventanas flotantes estilo celular (MESSAGE_BOXES) sí se permiten en PC:
 * se abren desde el rail «Chats» al tocar un usuario.
 *
 * Para mostrar también la página /mensajes en laptop/PC: «Habilitar caja de mensajes».
 */
import { VP_LG, VP_MD } from '../responsive/viewport';

export const MESSAGES_INBOX_ENABLED = true;

/**
 * Laptop / PC / tablet horizontal — página /mensajes + ítem de menú.
 * Orden del usuario para activar: «Habilitar caja de mensajes».
 */
export const MESSAGES_INBOX_WIDE_ENABLED = false;

/**
 * Ventanas flotantes estilo celular (abiertas + minimizadas).
 * Activas en todos los layouts, incluido PC/escritorio.
 */
export const MESSAGE_BOXES_ENABLED = true;

/** true = ocultar página /mensajes en el viewport actual (laptop/PC/tablet landscape). */
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

/** Ventanas/pastillas flotantes de chat visibles ahora. */
export function isMessageBoxesVisibleNow(): boolean {
  return MESSAGE_BOXES_ENABLED;
}

if (typeof document !== 'undefined') {
  document.documentElement.classList.toggle('lb-msg-boxes-off', !isMessageBoxesVisibleNow());
}
